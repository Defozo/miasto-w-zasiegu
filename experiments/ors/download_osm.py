"""Download the full Geofabrik Malopolskie PBF and verify the published MD5."""
import hashlib
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
URL = "https://download.geofabrik.de/europe/poland/malopolskie-latest.osm.pbf"


def main():
    dest = ROOT / "input" / "malopolskie-latest.osm.pbf"
    dest.parent.mkdir(parents=True, exist_ok=True)
    evidence = ROOT / "evidence"
    evidence.mkdir(exist_ok=True)
    started = datetime.now(timezone.utc).isoformat()
    begin = time.perf_counter()
    partial = dest.with_suffix(".pbf.part")
    digest = hashlib.md5()
    sha = hashlib.sha256()
    size = 0
    with urllib.request.urlopen(URL, timeout=120) as response, partial.open("wb") as out:
        headers = dict(response.headers)
        while chunk := response.read(1024 * 1024):
            out.write(chunk)
            digest.update(chunk)
            sha.update(chunk)
            size += len(chunk)
    with urllib.request.urlopen(URL + ".md5", timeout=60) as response:
        checksum_text = response.read().decode("ascii")
    expected = checksum_text.split()[0].lower()
    metadata = {
        "url": URL,
        "started_at_utc": started,
        "downloaded_at_utc": datetime.now(timezone.utc).isoformat(),
        "download_seconds": round(time.perf_counter() - begin, 3),
        "bytes": size,
        "md5": digest.hexdigest(),
        "sha256": sha.hexdigest(),
        "published_md5": expected,
        "checksum_valid": digest.hexdigest() == expected,
        "http_headers": headers,
    }
    (evidence / "osm-download.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    (evidence / "malopolskie-latest.osm.pbf.md5").write_text(checksum_text, encoding="ascii")
    if not metadata["checksum_valid"]:
        raise RuntimeError("Published MD5 does not match. Do not import the partial file.")
    partial.replace(dest)
    print(json.dumps(metadata, indent=2), flush=True)


if __name__ == "__main__":
    main()
