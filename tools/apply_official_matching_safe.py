#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FITMENT = ROOT / "app/data/vehicles_2012_2026.json"
LOG = ROOT / "app/data/vehicle-updates/official-matching-applied-20260903.json"

# 2026-09-03 official TOPY source: only values already isolated and reviewed.
# Coverage extensions (OEM tire/inch additions) are intentionally excluded.
SAFE = {
    "LEX_LC_Z100": {"thread_diameter": 14, "thread_pitch": 1.5},
    "LEX_RZ_E10": {"thread_diameter": 14, "thread_pitch": 1.5},
    "LEX_NX_AZ20": {"thread_pitch": 1.5},
    "LEX_RX_AL30": {"thread_pitch": 1.5},
    "LEX_LBX_MAYH": {"thread_diameter": 14, "thread_pitch": 1.5},
    "LEX_GX_550_JP": {"thread_diameter": 14, "thread_pitch": 1.5},
    "LEX_UX_AA10": {"thread_diameter": 12, "thread_pitch": 1.5},
}

SOURCE = {
    "source_type": "official_supplied_matching_file",
    "source_name": "TOPY 2025年 国産車用マッチングデータ.xlsx",
    "verified_at": "2026-09-03",
}


def main():
    data = json.loads(FITMENT.read_text(encoding="utf-8"))
    by_id = {v.get("vehicle_id"): v for v in data.get("vehicles", [])}
    applied, already = [], []

    missing = sorted(set(SAFE) - set(by_id))
    if missing:
        raise SystemExit(f"Safe target vehicle_id missing: {missing}")

    for vehicle_id, fields in SAFE.items():
        vehicle = by_id[vehicle_id]
        details = vehicle.setdefault("fastener_details", {})
        changed = {}
        for key, expected in fields.items():
            current = details.get(key)
            if current in (None, ""):
                details[key] = expected
                changed[key] = expected
            elif current == expected:
                already.append({"vehicle_id": vehicle_id, "field": key, "value": expected})
            else:
                raise SystemExit(
                    f"Refusing overwrite: {vehicle_id}.fastener_details.{key} "
                    f"current={current!r} official={expected!r}"
                )

        if changed:
            sources = vehicle.setdefault("sources", [])
            if not any(
                s.get("source_type") == SOURCE["source_type"]
                and s.get("source_name") == SOURCE["source_name"]
                and s.get("verified_at") == SOURCE["verified_at"]
                for s in sources if isinstance(s, dict)
            ):
                sources.append(dict(SOURCE))
            applied.append({"vehicle_id": vehicle_id, "changes": changed})

    FITMENT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    LOG.write_text(json.dumps({
        "schema_version": "1.0.0",
        "applied_at": "2026-09-03",
        "source": SOURCE,
        "policy": "whitelist_missing_fields_only_no_overwrite",
        "applied": applied,
        "already_present": already,
        "coverage_extensions_applied": 0,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"applied_records": len(applied), "already_present": len(already)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
