#!/usr/bin/env python3
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FITMENT = ROOT / "app" / "data" / "vehicles_2012_2026.json"
CONFIRMED = ROOT / "app" / "data" / "vehicle-updates" / "auto-confirmed-pcd.json"
CHANGE_LOG = ROOT / "app" / "data" / "vehicle-updates" / "change_log.json"
REPORT = ROOT / "reports" / "auto-pcd-apply.json"
JST = timezone(timedelta(hours=9))


def load(path, default=None):
    if not path.exists():
        return default if default is not None else {}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def confidence_at_least_b(value):
    order = {"D": 0, "C": 1, "B": 2, "A": 3}
    return order.get(value, 0) >= 2


def main():
    fitment = load(FITMENT)
    plan = load(CONFIRMED, {"records": []})
    change_log = load(CHANGE_LOG, {"schema_version": "1.0.0", "dataset": "vehicle_change_log", "records": []})
    vehicles = fitment.get("vehicles", [])
    by_id = {x.get("vehicle_id"): x for x in vehicles}
    now = datetime.now(JST).isoformat(timespec="seconds")

    applied = []
    skipped = []
    for item in plan.get("records", []):
        vid = item.get("vehicle_id")
        value = item.get("value")
        sources = item.get("sources") or []
        distinct_domains = {x.get("domain") for x in sources if x.get("domain")}

        if item.get("field") != "pcd":
            skipped.append({"vehicle_id": vid, "reason": "not_pcd"})
            continue
        if item.get("status") != "auto_confirmed_two_independent_official_domains":
            skipped.append({"vehicle_id": vid, "reason": "not_auto_confirmed"})
            continue
        if len(distinct_domains) < 2:
            skipped.append({"vehicle_id": vid, "reason": "insufficient_independent_domains"})
            continue
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not 80 <= float(value) <= 200:
            skipped.append({"vehicle_id": vid, "reason": "invalid_pcd_value"})
            continue
        vehicle = by_id.get(vid)
        if not vehicle:
            skipped.append({"vehicle_id": vid, "reason": "unknown_vehicle_id"})
            continue

        current = vehicle.get("pcd")
        if current is not None:
            if current == value:
                skipped.append({"vehicle_id": vid, "reason": "already_same_value"})
            else:
                skipped.append({
                    "vehicle_id": vid,
                    "reason": "existing_value_conflict_never_overwrite",
                    "current": current,
                    "candidate": value,
                })
            continue

        vehicle["pcd"] = value
        if not confidence_at_least_b(vehicle.get("confidence")):
            vehicle["confidence"] = "B"
        change = {
            "vehicle_id": vid,
            "field": "pcd",
            "old": None,
            "new": value,
            "reason": "auto_confirmed_two_independent_official_domains",
            "confidence": "B",
            "sources": sources,
            "applied_at": now,
            "actor": "github_actions_auto_pcd",
        }
        change_log.setdefault("records", []).append(change)
        applied.append(change)

    if applied:
        fitment["record_count"] = len(vehicles)
        FITMENT.write_text(json.dumps(fitment, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        CHANGE_LOG.write_text(json.dumps(change_log, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        "schema_version": "1.0.0",
        "dataset": "auto_pcd_apply_report",
        "applied_at": now,
        "applied_count": len(applied),
        "skipped_count": len(skipped),
        "applied": applied,
        "skipped": skipped,
        "policy": {
            "fills_missing_pcd_only": True,
            "never_overwrite_existing_pcd": True,
            "requires_two_independent_official_domains": True,
            "conflicts_require_human_review": True,
        },
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"applied_count": len(applied), "skipped_count": len(skipped)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
