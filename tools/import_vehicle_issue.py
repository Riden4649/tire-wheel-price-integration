#!/usr/bin/env python3
"""Import owner-submitted app candidates from a GitHub issue into the research queue."""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app/data/vehicle-updates/app-submitted-missing-vehicles.json"
MARKER = re.compile(r"<!--\s*VEHICLE_RESEARCH_JSON\s*\n(.*?)\n-->", re.DOTALL)


def clean(value, limit=160):
    return str(value or "").strip()[:limit]


def normalized(value):
    return re.sub(r"[^a-z0-9ぁ-んァ-ヶ一-龯]", "", clean(value).lower())


def candidate_key(item):
    supplied = clean(item.get("key"), 240)
    return supplied or "|".join(normalized(item.get(key)) for key in ("maker", "model", "model_code"))


def main(event_path):
    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    issue = event.get("issue") or {}
    owner = clean((event.get("repository") or {}).get("owner", {}).get("login"))
    sender = clean((event.get("sender") or {}).get("login"))
    if not owner or sender != owner:
        raise SystemExit("Only repository-owner submissions are accepted.")
    if not clean(issue.get("title")).startswith("[vehicle-research]"):
        raise SystemExit("Not a vehicle-research issue.")
    match = MARKER.search(str(issue.get("body") or ""))
    if not match:
        raise SystemExit("Vehicle research JSON marker not found.")
    payload = json.loads(match.group(1))
    if payload.get("schema_version") != "1.0.0" or payload.get("source") != "tire-wheel-price-navi":
        raise SystemExit("Unsupported submission schema or source.")
    incoming = payload.get("candidates")
    if not isinstance(incoming, list) or not 1 <= len(incoming) <= 30:
        raise SystemExit("Candidate count must be between 1 and 30.")

    if OUT.exists():
        saved = json.loads(OUT.read_text(encoding="utf-8"))
    else:
        saved = {"schema_version": "1.0.0", "dataset": "app_submitted_missing_vehicles", "records": []}
    records = {item["key"]: item for item in saved.get("records", []) if item.get("key")}
    now = datetime.now(timezone.utc).isoformat()
    accepted = 0
    for raw in incoming:
        if not isinstance(raw, dict):
            continue
        maker, model = clean(raw.get("maker"), 80), clean(raw.get("model"), 120)
        if not model:
            continue
        key = candidate_key(raw)
        current = records.get(key, {})
        records[key] = {
            **current,
            "key": key,
            "maker": maker,
            "model": model,
            "year": clean(raw.get("year"), 12),
            "model_code": clean(raw.get("model_code"), 80),
            "grade": clean(raw.get("grade"), 120),
            "tire_size": clean(raw.get("tire_size"), 120).upper(),
            "memo": clean(raw.get("memo"), 300),
            "store_search_count": max(int(raw.get("count") or 1), int(current.get("store_search_count") or 0)),
            "first_submitted_at": current.get("first_submitted_at") or now,
            "last_submitted_at": now,
            "submission_count": int(current.get("submission_count") or 0) + 1,
            "github_issue_number": issue.get("number"),
            "github_issue_url": clean(issue.get("html_url"), 300),
            "submitted_by": sender,
            "status": "queued_for_research",
        }
        accepted += 1
    if not accepted:
        raise SystemExit("No valid vehicle candidates found.")
    saved.update({"updated_at": now, "record_count": len(records), "records": sorted(records.values(), key=lambda item: item["key"])})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(saved, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"accepted": accepted, "total": len(records)}, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: import_vehicle_issue.py GITHUB_EVENT_PATH")
    main(sys.argv[1])
