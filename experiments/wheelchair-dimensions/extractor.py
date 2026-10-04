"""Reproducible GKV wheelchair dimension extraction. Python standard library only."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE_URL = "https://www.gkv-datenaustausch.de/media/dokumente/leistungserbringer_1/sonstige_leistungserbringer/positionsnummernverzeichnisse/20260928_HMV.zip"
SOURCE_DATE = "2026-09-28"
SELECTED_IDS = [
    "18.50.02.2128", "18.46.06.0014", "18.50.03.0211", "18.50.03.0224",
    "18.50.03.0257", "18.50.03.5025", "18.50.03.0160", "18.99.06.1158",
    "18.50.04.0193", "18.50.04.0194", "18.50.04.0192", "18.50.04.0217",
    "18.50.03.1089",
]
LABELS = {
    "overall_width": ("Gesamtbreite", "Gesamt-Breite"),
    "seat_width": ("Sitzbreite",),
    "base_width": ("Fahrgestellbreite", "Basisbreite"),
    "overall_length": ("Gesamtlänge", "Gesamt-Länge"),
    "length_unspecified": ("Länge",),
    "turning_diameter": ("Wendekreisdurchmesser", "Wendedurchmesser"),
    "turning_radius": ("Wenderadius",),
    "turning_measure_unspecified": ("Wendekreis",),
}
NUMBER = r"\d+(?:[.,]\d+)?"
UNIT = r"(?:Millimeter|Zentimeter|mm|cm)"
UNITS = {"millimeter": ("mm", 1), "mm": ("mm", 1), "zentimeter": ("cm", 10), "cm": ("cm", 10)}


def save_json(path: Path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def number(text):
    return float(text.replace(",", "."))


def numeric_expression(raw: str):
    """Parse the primary expression; never treat modifiers/steps as range endpoints."""
    result = {"raw_expression": raw, "kind": "unparsed", "unit": None, "unit_normalized": "mm"}
    value = raw.strip()
    formula = re.match(rf"^(?:Sitzbreite|SB)\s*\+\s*({NUMBER})\s*({UNIT})\b", value, re.I)
    if formula:
        unit, factor = UNITS[formula[2].lower()]
        result.update(kind="formula", unit=unit, formula={"variable": "seat_width_mm", "operator": "+", "offset_mm": number(formula[1]) * factor}, qualifier=value[formula.end():].strip())
        return result
    value_no_prefix = re.sub(r"^(?:max\.?|min\.?|ab|ca\.?)\s*", "", value, flags=re.I)
    prefix = value[:len(value)-len(value_no_prefix)]
    range_match = re.match(rf"^({NUMBER})\s*({UNIT})?\s*(?:bis|[-–—])\s*({NUMBER})\s*({UNIT})\b", value_no_prefix, re.I)
    if range_match:
        right_unit, right_factor = UNITS[range_match[4].lower()]
        left_unit, left_factor = UNITS[(range_match[2] or range_match[4]).lower()]
        bounds = [number(range_match[1]) * left_factor, number(range_match[3]) * right_factor]
        if bounds[0] > bounds[1]:
            return result | {"parse_issue": "reversed_range"}
        result.update(kind="range", unit=left_unit if left_unit == right_unit else "mixed", min_mm=bounds[0], max_mm=bounds[1], qualifier=(prefix + value_no_prefix[range_match.end():]).strip())
        return result
    # A comma followed by whitespace separates discrete choices; decimal commas do not.
    choices = re.match(rf"^({NUMBER}(?:\s*,\s+{NUMBER})+)\s*({UNIT})\b", value_no_prefix, re.I)
    if choices:
        unit, factor = UNITS[choices[2].lower()]
        values = [number(v) * factor for v in re.split(r",\s+", choices[1])]
        return result | {"kind": "set", "unit": unit, "values_mm": values, "qualifier": (prefix + value_no_prefix[choices.end():]).strip()}
    scalar = re.match(rf"^({NUMBER})\s*({UNIT})\b", value_no_prefix, re.I)
    if scalar:
        unit, factor = UNITS[scalar[2].lower()]
        return result | {"kind": "scalar", "unit": unit, "value_mm": number(scalar[1]) * factor, "qualifier": (prefix + value_no_prefix[scalar.end():]).strip()}
    return result


def extract_dimensions(text: str):
    dimensions = {}
    for field, labels in LABELS.items():
        found = []
        for line in text.splitlines():
            match = re.match(r"^\s*(" + "|".join(re.escape(label) for label in labels) + r")\s*:\s*(.*)$", line, re.I)
            if not match:
                continue
            # A second named field on the same line cannot become part of this value.
            expression = re.split(r"\s{2,}[\wÄÖÜäöüß /-]+:\s*", match[2], maxsplit=1)[0]
            found.append({"source_label": match[1], "source_line": line, "semantics": field, **numeric_expression(expression)})
        dimensions[field] = found
    return dimensions


def record_id(d):
    return f"{int(d['GRUPPE']):02}.{int(d['ORT']):02}.{int(d['UNTERGRUPPE']):02}.{int(d['ART'])}{int(d['PRODUKT']):03}"


def download_and_unpack(refresh=False):
    source = ROOT / "source"
    source.mkdir(exist_ok=True)
    archive = source / "20260928_HMV.zip"
    if refresh or not archive.exists():
        with urllib.request.urlopen(SOURCE_URL, timeout=60) as response:
            archive.write_bytes(response.read())
    # Extract only the four exact expected paths, never arbitrary paths from a ZIP.
    names = ["20260928_HMV.xml", "Dokumentation/ESOL-HMV-1.0.0.xsd", "Dokumentation/GI4X-basis-2.0.0.xsd", "Dokumentation/gkvsv_hmv_schema_infomodell_v101.docx"]
    with zipfile.ZipFile(archive) as z:
        for name in names:
            target = source / name
            if refresh or not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(name))
    return archive, source / names[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-source", action="store_true", help="Download the same dated archive again")
    args = parser.parse_args()
    archive, xml = download_and_unpack(args.refresh_source)
    evidence_dir = ROOT / "evidence"
    evidence_dir.mkdir(exist_ok=True)
    selected = {}
    selected_raw = {}
    all_count = group_count = descriptions = width_count = 0
    for element in ET.parse(xml).getroot():
        if element.tag.rsplit("}", 1)[-1] != "HMV_PRODUKT":
            continue
        all_count += 1
        d = {child.tag.rsplit("}", 1)[-1]: child.text or "" for child in element}
        if d["GRUPPE"] != "18":
            continue
        group_count += 1
        descriptions += bool(d.get("MERKMALE"))
        width_count += "gesamtbreite" in d.get("MERKMALE", "").lower()
        ident = record_id(d)
        if ident not in SELECTED_IDS:
            continue
        selected_raw[ident] = {"gkv_id": ident, **d}
        raw = d.get("MERKMALE", "")
        dimensions = extract_dimensions(raw)
        issues = []
        for measure in dimensions["overall_width"]:
            if measure["kind"] == "formula" and measure["formula"]["offset_mm"] < 100:
                issues.append("small_width_offset_requires_manufacturer_verification")
            if measure["kind"] == "unparsed":
                issues.append("overall_width_not_parsed")
        evidence_path = evidence_dir / f"{ident}.xml"
        ET.indent(element)
        evidence_path.write_bytes(ET.tostring(element, encoding="utf-8", xml_declaration=True))
        selected[ident] = {
            "gkv_id": ident, "model": d["BEZEICHNUNG"], "manufacturer": d["HERSTELLER"],
            "source_url": SOURCE_URL, "source_snapshot_date": SOURCE_DATE,
            "source_record_added": d.get("AUFNAHMEDATUM"), "source_record_changed": d.get("AENDERUNGSDATUM"),
            "source_evidence": str(evidence_path.relative_to(ROOT)).replace("\\", "/"),
            "raw_attributes_text": raw, "dimensions": dimensions, "quality_flags": issues,
            "interpretation": "Catalog parameters for the named version, not a measurement of a user's configured chair. No route clearance derived.",
        }
    missing = set(SELECTED_IDS) - set(selected)
    if missing:
        raise RuntimeError(f"Missing selected IDs: {sorted(missing)}")
    records = [selected[ident] for ident in SELECTED_IDS]
    save_json(ROOT / "selected-models.json", [selected_raw[ident] for ident in SELECTED_IDS])
    save_json(ROOT / "extracted.json", records)
    with (ROOT / "extracted.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        fields = ["gkv_id", "model", "manufacturer", "dimension", "source_label", "source_line", "kind", "unit", "normalized_mm_json", "qualifier", "source_record_added", "source_record_changed", "source_url"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in records:
            for dimension, values in row["dimensions"].items():
                for value in values:
                    normalized = {key: value[key] for key in ["value_mm", "min_mm", "max_mm", "values_mm", "formula"] if key in value}
                    writer.writerow({**{key: row.get(key) for key in ["gkv_id", "model", "manufacturer", "source_record_added", "source_record_changed", "source_url"]}, "dimension": dimension, **{key: value.get(key) for key in ["source_label", "source_line", "kind", "unit", "qualifier"]}, "normalized_mm_json": json.dumps(normalized, ensure_ascii=False)})
    manifest = {"source_url": SOURCE_URL, "source_snapshot_date": SOURCE_DATE,
                "zip_bytes": archive.stat().st_size, "xml_bytes": xml.stat().st_size,
                "zip_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                "xml_sha256": hashlib.sha256(xml.read_bytes()).hexdigest(),
                "products_all": all_count, "group_18_records": group_count,
                "group_18_with_description": descriptions, "group_18_with_gesamtbreite_text": width_count,
                "selected_count": len(records), "selected_ids": SELECTED_IDS,
                "parsed_overall_width_count": sum(any(m["kind"] != "unparsed" for m in row["dimensions"]["overall_width"]) for row in records),
                "license_status": "Redistribution license not verified. Local research download only.",
                "scope": "Purposive sample, not a random sample or population accuracy estimate."}
    save_json(ROOT / "manifest.json", manifest)
    print(json.dumps({key: manifest[key] for key in ["selected_count", "parsed_overall_width_count", "group_18_records", "zip_sha256"]}, indent=2))


if __name__ == "__main__":
    main()
