"""Read-only ORS 10 wheelchair API experiment; no third-party packages required.

This verifies HTTP routing and geometry, not real-world wheelchair accessibility.
See TESTING.md for scope, criteria and the official API sources.
"""

from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import time
import urllib.error
import urllib.request


DEFAULT_BASE_URL = "http://127.0.0.1:18082/ors"
ROUTES = [
    {
        "id": "rynek_florianska",
        "label": "Rynek, wylot Floriańskiej -> Floriańska przy Bramie Floriańskiej",
        "coordinates": [[19.93931, 50.06218], [19.94123, 50.06464]],
    },
    {
        "id": "grodzka",
        "label": "Grodzka przy Rynku -> Grodzka przy placu św. Marii Magdaleny",
        "coordinates": [[19.93785, 50.05958], [19.93831, 50.05627]],
    },
    {
        "id": "kazimierz",
        "label": "Szeroka przy Miodowej -> okolice placu Nowego i Estery",
        "coordinates": [[19.94813, 50.05307], [19.94560, 50.05250]],
    },
]


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def save(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def haversine(a, b) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    term = math.sin((lat2 - lat1) / 2) ** 2
    term += math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371008.8 * 2 * math.asin(min(1.0, math.sqrt(term)))


class Recorder:
    def __init__(self, base_url: str, output: Path, timeout: float):
        self.base_url, self.output, self.timeout = base_url.rstrip("/"), output, timeout
        self.results = []

    def request(self, name: str, path: str, body=None) -> dict:
        method = "GET" if body is None else "POST"
        url = self.base_url + path
        headers = {"Content-Type": "application/json",
                   "Accept": "application/geo+json" if path.endswith("/geojson") else "application/json"}
        save(self.output / f"{name}.request.json", {
            "timestamp_utc": now(), "method": method, "url": url, "headers": headers, "body": body,
        })
        request = urllib.request.Request(
            url, data=None if body is None else json.dumps(body).encode("utf-8"),
            headers=headers,
            method=method,
        )
        started = time.monotonic()
        status, raw, transport_error = None, b"", None
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                status, raw = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            transport_error = str(error)
        elapsed = round(time.monotonic() - started, 3)
        raw_text = raw.decode("utf-8", errors="replace")
        (self.output / f"{name}.response.body.txt").write_text(raw_text, encoding="utf-8")
        try:
            data = json.loads(raw_text)
        except (json.JSONDecodeError, ValueError):
            data = None
        result = {
            "name": name, "http_status": status, "elapsed_seconds": elapsed,
            "transport_error": transport_error, "body": data,
        }
        save(self.output / f"{name}.response.json", result)
        return result

    def add(self, result: dict) -> None:
        self.results.append(result)
        print(f"{result['name']}: {result['outcome']}", flush=True)


def base_request(route: dict) -> dict:
    return {
        "coordinates": route["coordinates"],
        "radiuses": [30, 30],
        "instructions": True,
        "instructions_format": "text",
        "language": "pl",
        "units": "m",
        "geometry_simplify": False,
        "suppress_warnings": False,
        "options": {
            "avoid_features": ["steps"],
            "profile_params": {
                "surface_quality_known": False,
                "allow_unsuitable": False,
                "restrictions": {
                    "maximum_incline": 6,
                    "maximum_sloped_kerb": 0.06,
                    "minimum_width": 0.9,
                    "smoothness_type": "good",
                    "surface_type": "sett",
                    "track_type": "grade1",
                },
            },
        },
    }


def strict_request(base: dict) -> dict:
    body = copy.deepcopy(base)
    profile = body["options"]["profile_params"]
    profile["surface_quality_known"] = True
    profile["restrictions"].update({
        "maximum_incline": 3, "maximum_sloped_kerb": 0.03, "minimum_width": 1.2,
    })
    return body


def valid_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_route(data, requested: dict) -> tuple[dict, list]:
    """Check indexing and contiguous steps against the original, unsimplified geometry."""
    errors = []
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
        return {"errors": ["Response is not a GeoJSON FeatureCollection"]}, []
    features = data.get("features", [])
    if not isinstance(features, list) or len(features) != 1:
        return {"errors": ["Expected exactly one route feature"]}, []
    feature = features[0]
    geometry, props = feature.get("geometry", {}), feature.get("properties", {})
    coords = geometry.get("coordinates", [])
    if geometry.get("type") != "LineString" or len(coords) < 2:
        return {"errors": ["Expected LineString with at least two coordinates"]}, []
    if any(not isinstance(p, list) or len(p) < 2 or not all(valid_number(v) for v in p)
           or not (-180 <= p[0] <= 180 and -90 <= p[1] <= 90) for p in coords):
        return {"errors": ["Invalid coordinate values"]}, []
    n = len(coords)
    endpoints = props.get("way_points")
    if endpoints != [0, n - 1]:
        errors.append(f"Unexpected route way_points: {endpoints}; expected [0, {n-1}]")
    segments = props.get("segments", [])
    if len(segments) != len(requested["coordinates"]) - 1:
        errors.append("Segment count does not match requested waypoints")
    previous_end, step_count, segment_distance, segment_duration = 0, 0, 0.0, 0.0
    for segment in segments:
        steps = segment.get("steps", [])
        if not steps:
            errors.append("Segment has no navigation steps")
        step_distance, step_duration = 0.0, 0.0
        for step in steps:
            pair = step.get("way_points")
            if (not isinstance(pair, list) or len(pair) != 2
                    or not all(isinstance(v, int) and not isinstance(v, bool) for v in pair)
                    or not 0 <= pair[0] <= pair[1] < n):
                errors.append(f"Invalid step indices: {pair}")
            else:
                if pair[0] != previous_end:
                    errors.append(f"Non-contiguous steps: previous end {previous_end}, next {pair}")
                previous_end = pair[1]
            if not isinstance(step.get("instruction"), str) or not step["instruction"].strip():
                errors.append("Missing instruction text")
            for field in ("distance", "duration"):
                value = step.get(field)
                if not valid_number(value) or value < 0:
                    errors.append(f"Invalid step {field}")
            if valid_number(step.get("distance")):
                step_distance += step["distance"]
            if valid_number(step.get("duration")):
                step_duration += step["duration"]
            step_count += 1
        for field, total in (("distance", step_distance), ("duration", step_duration)):
            value = segment.get(field)
            if not valid_number(value) or value < 0:
                errors.append(f"Invalid segment {field}")
            elif abs(value - total) > max(1.0, len(steps) * 0.11):
                errors.append(f"Sum of step {field} differs from segment beyond rounding tolerance")
        segment_distance += segment.get("distance", 0)
        segment_duration += segment.get("duration", 0)
    if previous_end != n - 1:
        errors.append("Steps do not reach final geometry coordinate")
    summary = props.get("summary", {})
    for field, total in (("distance", segment_distance), ("duration", segment_duration)):
        value = summary.get(field)
        if not valid_number(value) or value <= 0:
            errors.append(f"Non-positive route {field}")
        elif abs(value - total) > max(1.0, len(segments) * 0.11):
            errors.append(f"Sum of segment {field} differs from route summary")
    snap_distances = [haversine(requested["coordinates"][0], coords[0]),
                      haversine(requested["coordinates"][-1], coords[-1])]
    if any(distance > radius + 1 for distance, radius in zip(snap_distances, requested["radiuses"])):
        errors.append("Returned route endpoint is outside requested snapping radius")
    return {
        "errors": errors, "geometry_points": n, "navigation_steps": step_count,
        "distance_m": summary.get("distance"), "duration_s": summary.get("duration"),
        "snapping_distance_m": [round(v, 2) for v in snap_distances],
        "warnings": props.get("warnings", []),
        "engine": data.get("metadata", {}).get("engine"),
        "note": "API/geometry validation only; no street-side or real-world accessibility certification.",
    }, coords


def run_route(recorder: Recorder, name: str, body: dict, allow_no_route=False) -> tuple[dict, list]:
    response = recorder.request(name, "/v2/directions/wheelchair/geojson", body)
    data = response["body"]
    result = {key: response[key] for key in ("name", "http_status", "elapsed_seconds", "transport_error")}
    error = data.get("error", {}) if isinstance(data, dict) else {}
    if response["http_status"] != 200:
        # 2009 = no route; 2010 = endpoint cannot snap under these restrictions.
        # Parameter errors, 5xx, timeouts and 404 endpoint errors are never accepted.
        accepted = allow_no_route and response["http_status"] == 404 and error.get("code") in (2009, 2010)
        result.update({"outcome": "NO_ROUTE_ACCEPTED" if accepted else "FAIL", "api_error": error})
        return result, []
    try:
        validation, coords = validate_route(data, body)
    except (TypeError, KeyError, ValueError, IndexError) as error:
        validation, coords = {"errors": [f"Malformed response: {error}"]}, []
    result.update(validation)
    result["outcome"] = "PASS" if not validation["errors"] else "FAIL"
    return result, coords


def obstruction(coords: list, half_width_m=6.0) -> tuple[dict, dict]:
    lengths = [haversine(a, b) for a, b in zip(coords, coords[1:])]
    total, cursor, candidates = sum(lengths), 0.0, []
    for i, length in enumerate(lengths):
        along = cursor + length / 2
        if length >= 4 and total * 0.25 <= along <= total * 0.75:
            candidates.append((length, i))
        cursor += length
    if not candidates:
        raise ValueError("No interior segment suitable for a small controlled obstruction")
    _, index = max(candidates)
    a, b = coords[index], coords[index + 1]
    lon, lat = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    polygon, details = square_obstacle([lon, lat], half_width_m)
    details["segment_index"] = index
    return polygon, details


def square_obstacle(center: list, half_width_m: float) -> tuple[dict, dict]:
    lon, lat = center
    dx, dy = half_width_m / (111320 * math.cos(math.radians(lat))), half_width_m / 111320
    bounds = [lon - dx, lat - dy, lon + dx, lat + dy]
    x1, y1, x2, y2 = bounds
    polygon = {"type": "Polygon", "coordinates": [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]]}
    return polygon, {"center": [lon, lat], "bounds": bounds,
                     "half_width_m": half_width_m, "artificial_test_obstacle": True}


def intersects_rectangle(coords: list, bounds: list) -> bool:
    """Liang-Barsky clipping, including boundary contact, for each LineString segment."""
    xmin, ymin, xmax, ymax = bounds
    for a, b in zip(coords, coords[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        low, high, hit = 0.0, 1.0, True
        for p, q in ((-dx, a[0]-xmin), (dx, xmax-a[0]), (-dy, a[1]-ymin), (dy, ymax-a[1])):
            if abs(p) < 1e-15:
                if q < 0:
                    hit = False
                    break
            elif p < 0:
                low = max(low, q/p)
            else:
                high = min(high, q/p)
            if low > high:
                hit = False
                break
        if hit:
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.environ.get("ORS_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--output", type=Path)
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--case", choices=("all", "blocked-start"), default="all")
    args = parser.parse_args()
    output = args.output or Path(__file__).parent / "results" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    output.mkdir(parents=True, exist_ok=False)
    recorder = Recorder(args.base_url, output, args.timeout)
    save(output / "test_plan.json", {"routes": ROUTES, "base_url": args.base_url, "case": args.case,
        "note": "Approximate street/approach points, not audited accessible entrances. Coordinates are lon,lat.",
        "request_snap_radius_m": 30, "artificial_obstacle_half_width_m": 6})
    health = recorder.request("health", "/v2/health")
    ready = health["http_status"] == 200 and isinstance(health["body"], dict) and health["body"].get("status") == "ready"
    recorder.add({"name": "health", "outcome": "PASS" if ready else "FAIL", "response": health})
    status = recorder.request("status", "/v2/status")
    status_body = status["body"] if isinstance(status["body"], dict) else {}
    profiles = status_body.get("profiles", {})
    wheelchair = profiles.get("wheelchair", {}) if isinstance(profiles, dict) else {}
    status_ok = status["http_status"] == 200 and wheelchair.get("encoder_name") == "wheelchair"
    recorder.add({"name": "status", "outcome": "PASS" if status_ok else "FAIL", "engine": status_body.get("engine"),
                  "wheelchair_profile": wheelchair, "http_status": status["http_status"]})
    successful = []
    if ready and status_ok and args.case == "blocked-start":
        route = ROUTES[0]
        body = base_request(route)
        # Half-width 70m covers the complete 30m snapping circle with ample margin.
        polygon, details = square_obstacle(route["coordinates"][0], 70)
        body["options"]["avoid_polygons"] = polygon
        name = route["id"] + "_blocked_start"
        save(output / f"{name}.obstacle.geojson", {"type": "Feature", "geometry": polygon, "properties": details})
        result, _ = run_route(recorder, name, body, allow_no_route=True)
        expected_rejection = result["outcome"] == "NO_ROUTE_ACCEPTED"
        result["outcome"] = "PASS" if expected_rejection else "FAIL"
        result["obstacle"] = details
        result["interpretation"] = (
            "Expected HTTP 404 with ORS 2009/2010 because the entire 30m start snapping radius is blocked. "
            "No fallback, endpoint shift, radius change or relaxed restrictions were attempted."
        )
        if not expected_rejection:
            result.setdefault("errors", []).append("Expected explicit no-route/no-snap rejection for blocked start")
        recorder.add(result)
    elif ready and status_ok:
        for route in ROUTES:
            body = base_request(route)
            result, coords = run_route(recorder, route["id"] + "_baseline", body)
            recorder.add(result)
            if result["outcome"] == "PASS":
                successful.append((route, body, coords, result))
            strict, _ = run_route(recorder, route["id"] + "_strict", strict_request(body), allow_no_route=True)
            strict["interpretation"] = "Strict request was not retried with relaxed constraints. A found route does not prove completeness of OSM accessibility tags."
            recorder.add(strict)
        if successful:
            route, body, _, _ = successful[0]
            diagnostic_body = copy.deepcopy(body)
            diagnostic_body["options"]["profile_params"]["restrictions"]["minimum_width"] = 10.0
            diagnostic, _ = run_route(recorder, route["id"] + "_width_10m_diagnostic", diagnostic_body, allow_no_route=True)
            if diagnostic["outcome"] == "PASS":
                diagnostic["outcome"] = "DIAGNOSTIC_ROUTE_RETURNED"
                diagnostic["interpretation"] = (
                    "A route was returned with minimum_width=10m and surface_quality_known=false. "
                    "This is NOT proof that all paths are 10m wide or that width filtering is effective. "
                    "Inspect raw OSM width tags on matched edges; missing widths may remain routable."
                )
            elif diagnostic["outcome"] == "NO_ROUTE_ACCEPTED":
                diagnostic["outcome"] = "DIAGNOSTIC_NO_ROUTE"
                diagnostic["interpretation"] = "No route under the 10m width stress test. This alone does not prove complete width data."
            recorder.add(diagnostic)
        detour_passed = False
        for route, body, coords, baseline in successful:
            name = route["id"] + "_avoid_polygon"
            try:
                polygon, details = obstruction(coords)
            except ValueError as error:
                recorder.add({"name": name, "outcome": "SKIPPED", "reason": str(error)})
                continue
            avoid = copy.deepcopy(body)
            avoid["options"]["avoid_polygons"] = polygon
            save(output / f"{name}.obstacle.geojson", {"type": "Feature", "geometry": polygon, "properties": details})
            result, detour = run_route(recorder, name, avoid, allow_no_route=True)
            result["obstacle"] = details
            result["baseline_intersects_obstacle"] = intersects_rectangle(coords, details["bounds"])
            if detour:
                result["detour_intersects_obstacle"] = intersects_rectangle(detour, details["bounds"])
                result["distance_change_m"] = round(result["distance_m"] - baseline["distance_m"], 2)
                result["geometry_changed"] = detour != coords
                if result["detour_intersects_obstacle"] or not result["geometry_changed"] or not result["baseline_intersects_obstacle"]:
                    result["outcome"] = "FAIL"
                    result.setdefault("errors", []).append("Avoided route must differ and not intersect the controlled obstacle")
            recorder.add(result)
            if result["outcome"] == "PASS":
                detour_passed = True
                break
        recorder.add({"name": "dynamic_obstacle_demonstration", "outcome": "PASS" if detour_passed else "FAIL",
                      "note": "Requires at least one actual alternative route avoiding a polygon intersecting its baseline. No-route alone does not demonstrate a detour."})
    else:
        recorder.add({"name": "routing_tests", "outcome": "SKIPPED", "reason": "Instance not ready or wheelchair profile unavailable; no routing requests sent."})
    failed = [item["name"] for item in recorder.results if item["outcome"] == "FAIL"]
    summary = {"finished_utc": now(), "base_url": args.base_url, "output_directory": str(output.resolve()),
               "overall": "FAIL" if failed else "PASS", "failures": failed, "tests": recorder.results,
               "scope": "Local API and geometric behavior only. No real-world wheelchair safety or live mobile navigation claim."}
    save(output / "summary.json", summary)
    print(json.dumps({"overall": summary["overall"], "summary": str((output / "summary.json").resolve()),
                      "failures": failed}, ensure_ascii=False), flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
