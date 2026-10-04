"""Join parsed GKV records with independently reviewed manufacturer evidence."""
from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ALLOWED = {"match", "conflict", "insufficient"}


def envelope(measure):
    """Comparison of reported bounds only, not a claim that configurations match."""
    if isinstance(measure, (int, float)):
        return [measure, measure]
    if not isinstance(measure, dict):
        return None
    if "value_mm" in measure:
        return [measure["value_mm"], measure["value_mm"]]
    for low, high in [("min_mm", "max_mm"), ("min", "max")]:
        if low in measure and high in measure:
            return [measure[low], measure[high]]
    for key in ["values_mm", "values"]:
        if measure.get(key):
            return [min(measure[key]), max(measure[key])]
    return None


def write_json(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    extracted = json.loads((ROOT / "extracted.json").read_text(encoding="utf-8"))
    evidence_document = json.loads((ROOT / "manufacturer-verification.json").read_text(encoding="utf-8"))
    evidence_rows = evidence_document["records"]
    evidence = {row["gkv_id"]: row for row in evidence_rows}
    if len(evidence) != len(evidence_rows):
        raise ValueError("Duplicate manufacturer evidence IDs")
    expected = {row["gkv_id"] for row in extracted}
    if expected != set(evidence):
        raise ValueError(f"Evidence/selection mismatch: missing={expected-set(evidence)}, extra={set(evidence)-expected}")
    combined = []
    for record in extracted:
        check = evidence[record["gkv_id"]]
        status = check["status"]
        if status not in ALLOWED:
            raise ValueError(f"Invalid status {status}")
        if not check.get("reasoning"):
            raise ValueError(f"Missing reasoning: {record['gkv_id']}")
        if status in {"match", "conflict"} and (not check.get("source_url") or not check.get("evidence_text")):
            raise ValueError(f"Conclusive status without cited evidence: {record['gkv_id']}")
        secondary_flags = []
        gkv_seat = record["dimensions"]["seat_width"]
        manufacturer_seat = check.get("measurements", {}).get("seat_width_mm")
        if len(gkv_seat) == 1:
            a, b = envelope(gkv_seat[0]), envelope(manufacturer_seat)
            if a is not None and b is not None and a != b:
                secondary_flags.append({"field": "seat_width", "observation": "Reported seat-width bounds differ; versions/configurations not resolved", "gkv_bounds_mm": a, "manufacturer_bounds_mm": b})
        combined.append({"gkv_id": record["gkv_id"], "model": record["model"], "manufacturer": record["manufacturer"],
                         "status": status, "assessed_dimension": "overall_width", "assessment_method": "Manual comparison against primary manufacturer documents; automatic evidence join only",
                         "gkv_source_url": record["source_url"], "gkv_evidence_file": record["source_evidence"],
                         "gkv_record_added": record["source_record_added"], "gkv_record_changed": record["source_record_changed"],
                         "gkv_dimensions": record["dimensions"], "gkv_quality_flags": record["quality_flags"],
                         "manufacturer_verification": check,
                         "secondary_dimension_flags": secondary_flags,
                         "route_clearance_verified": False})
    counts = dict(Counter(row["status"] for row in combined))
    summary = {"models": len(combined), "overall_width_parsed": sum(any(value["kind"] != "unparsed" for value in row["gkv_dimensions"]["overall_width"]) for row in combined),
               "comparison_counts": {status: counts.get(status, 0) for status in ["match", "conflict", "insufficient"]},
               "assessed_dimension": "overall_width", "other_dimension_flags_count": sum(len(row["secondary_dimension_flags"]) for row in combined),
               "not_a_population_accuracy_estimate": True, "manual_comparison": True,
               "physical_chairs_measured": 0, "route_clearance_verified": False}
    write_json("comparison.json", {"summary": summary, "records": combined})
    with (ROOT / "comparison.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        fields = ["gkv_id", "model", "status", "model_match", "gkv_overall_width_raw", "manufacturer_evidence", "reasoning", "manufacturer_source_url", "gkv_source_url"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in combined:
            check = row["manufacturer_verification"]
            writer.writerow({"gkv_id": row["gkv_id"], "model": row["model"], "status": row["status"], "model_match": check.get("model_match"),
                             "gkv_overall_width_raw": " | ".join(value["source_line"] for value in row["gkv_dimensions"]["overall_width"]),
                             "manufacturer_evidence": check.get("evidence_text"), "reasoning": check["reasoning"],
                             "manufacturer_source_url": check.get("source_url"), "gkv_source_url": row["gkv_source_url"]})
    lines = ["# Wynik testu 13 modeli", "", f"Szerokość całkowita wyodrębniona: {summary['overall_width_parsed']}/{summary['models']}. To wynik parsera na dobranej próbie, nie ocena poprawności katalogu.", "",
             f"Porównanie szerokości całkowitej z dokumentami producentów: **{counts.get('match', 0)} match, {counts.get('conflict', 0)} conflict, {counts.get('insufficient', 0)} insufficient**. Statusy dotyczą wyłącznie tego wymiaru.", "",
             "Weryfikacja dokumentacji była ręczna i niezależna od ekstrakcji; skrypt automatycznie łączy zapisane dowody. Nie wykonywaliśmy pomiarów fizycznych wózków ani prób przejazdu.", "",
             "| Model / GKV | Zapis GKV | Ocena | Powód i źródło producenta |", "| --- | --- | --- | --- |"]
    def cell(value):
        return str(value).replace("|", "\\|").replace("\n", " ")
    for row in combined:
        check = row["manufacturer_verification"]
        raw = " / ".join(value["raw_expression"] for value in row["gkv_dimensions"]["overall_width"])
        source = f" [Dokument]({check['source_url']})" if check.get("source_url") else ""
        lines.append(f"| {cell(row['model'])}<br>{row['gkv_id']} | {cell(raw)} | {row['status']} | {cell(check['reasoning'])}{source} |")
    lines += ["", "Pełne cytaty, rozróżnienie wersji i dodatkowe źródła znajdują się w `manufacturer-verification.json` oraz `manufacturer-notes.md`. `comparison.json` zachowuje także wszystkie wyodrębnione wymiary i ścieżkę do dowodu XML.", "",
              "Dodatkowo zapisaliśmy rozbieżne zakresy szerokości siedziska dla Avanti, Avantgarde DV i Motus 2 CV. Są w `secondary_dimension_flags` w JSON; nie rozstrzygaliśmy tam różnic wersji i konfiguracji. Zgodność szerokości całkowitej nie potwierdza pozostałych pól karty.", "",
              "Każdy rekord ma `route_clearance_verified: false`. Nawet `match` dotyczy wyłącznie katalogowego parametru w opisanej konfiguracji.", ""]
    (ROOT / "RESULTS.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
