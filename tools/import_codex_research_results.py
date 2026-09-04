#!/usr/bin/env python3
"""Validate and import Codex research into the existing official candidate pool."""

from __future__ import annotations

import json
from pathlib import Path

from tavily_vehicle_research import (
    REGISTRY,
    build_confirmed,
    load,
    merge_candidate_pool,
    registered_domain,
    registered_source,
)

ROOT = Path(__file__).resolve().parents[1]
FITMENT = ROOT / "app/data/vehicles_2012_2026.json"
RESULTS = ROOT / "app/data/vehicle-updates/codex-research-results.json"
REPORT = ROOT / "reports/codex-import-report.json"
ALLOWED = {"manufacturer_official", "wheel_manufacturer_official"}


def main() -> int:
    registry = load(REGISTRY, {})
    fitment = load(FITMENT, {"vehicles": []})
    vehicles = {v.get("vehicle_id"): v for v in fitment.get("vehicles", [])}
    data = load(RESULTS, {"records": []})
    accepted, rejected = [], []

    for item in data.get("records", []):
        vid = item.get("vehicle_id")
        value = item.get("candidate_value")
        url = str(item.get("source_url") or "").strip()
        vehicle = vehicles.get(vid)
        source_type = registered_source(url, registry) if url else "unknown"
        domain = registered_domain(url, registry) if url else ""

        reason = None
        if not vehicle:
            reason = "unknown_vehicle_id"
        elif vehicle.get("pcd") is not None:
            reason = "pcd_already_filled"
        elif item.get("field") != "pcd":
            reason = "not_pcd"
        elif not isinstance(value, (int, float)) or isinstance(value, bool) or not 80 <= float(value) <= 200:
            reason = "invalid_pcd"
        elif not item.get("identity_confirmed"):
            reason = "vehicle_identity_not_confirmed"
        elif source_type not in ALLOWED:
            reason = "source_not_registered_official"
        elif not url:
            reason = "missing_source_url"

        if reason:
            rejected.append({"vehicle_id": vid, "reason": reason, "source_url": url})
            continue

        accepted.append({
            "vehicle_id": vid,
            "search_id": item.get("search_id"),
            "maker": vehicle.get("maker"),
            "model": vehicle.get("model"),
            "generation": vehicle.get("generation"),
            "field": "pcd",
            "candidate_value": value,
            "source_type": source_type,
            "source_domain": domain,
            "source_url": url,
            "source_title": item.get("source_title"),
            "search_engine": "codex_direct_web",
            "target_reason": item.get("target_reason") or "codex_fallback_research",
            "identity_validated": True,
            "note": item.get("note"),
        })

    pool = merge_candidate_pool(accepted, registry)
    confirmed, conflicts = build_confirmed(pool)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        "schema_version": "1.0.0",
        "dataset": "codex_research_import_report",
        "accepted_count": len(accepted),
        "rejected_count": len(rejected),
        "auto_confirmed_count": len(confirmed),
        "conflict_count": len(conflicts),
        "accepted": accepted,
        "rejected": rejected,
        "policy": {
            "registered_official_domains_only": True,
            "identity_confirmation_required": True,
            "two_independent_official_domains_required_for_auto_apply": True,
            "never_overwrite_existing_pcd": True,
        },
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "accepted": len(accepted),
        "rejected": len(rejected),
        "auto_confirmed": len(confirmed),
        "conflicts": len(conflicts),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
