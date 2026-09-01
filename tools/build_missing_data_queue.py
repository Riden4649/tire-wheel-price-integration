#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app" / "data"
SEARCH = DATA / "jp_vehicle_search_master_2000_2026_v1.json"
FITMENT = DATA / "vehicles_2012_2026.json"
SERVICE = DATA / "vehicle_service_specs.json"
REPORTS = ROOT / "reports"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def norm(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[\s　・･_/\-]+", "", text)
    return text


def aliases(rec):
    values = [rec.get("model")] + list(rec.get("aliases") or [])
    return {norm(v) for v in values if v}


def fitment_missing_fields(rec):
    required = ["pcd", "holes", "hub_bore", "fastener", "year_from", "year_to"]
    missing = [k for k in required if rec.get(k) in (None, "", [])]
    details = rec.get("fastener_details") or {}
    if details.get("method") in {"nut", "bolt"}:
        if details.get("thread_diameter") is None:
            missing.append("thread_diameter")
        if details.get("thread_pitch") is None:
            missing.append("thread_pitch")
    return missing


def main():
    search = load_json(SEARCH)
    fitment = load_json(FITMENT)
    service = load_json(SERVICE)

    search_records = search.get("vehicles") or []
    fitment_records = fitment.get("vehicles") or []
    service_records = service.get("records") or []

    fitment_by_maker = {}
    for rec in fitment_records:
        fitment_by_maker.setdefault(norm(rec.get("maker")), []).append(rec)

    service_keys = {(norm(r.get("maker")), norm(r.get("model"))) for r in service_records}
    queue = []

    for s in search_records:
        maker_key = norm(s.get("maker"))
        search_aliases = aliases(s)
        matched = []
        for f in fitment_by_maker.get(maker_key, []):
            if search_aliases & aliases(f):
                matched.append(f)

        if not matched:
            queue.append({
                "search_id": s.get("search_id"),
                "maker": s.get("maker"),
                "model": s.get("model"),
                "aliases": s.get("aliases") or [],
                "status": "fitment_missing",
                "missing_fields": [
                    "generation_or_model_code", "year_from", "year_to", "pcd", "holes",
                    "hub_bore", "fastener", "thread_diameter", "thread_pitch", "oem_tire"
                ],
                "needs_year_discovery": True,
                "priority_score": 50,
                "priority_components": {
                    "fitment_gap": 50,
                    "recency": None,
                    "market_popularity": None,
                    "store_usage": None
                },
                "next_action": "web_research",
                "human_review_required": True
            })
            continue

        for f in matched:
            missing = fitment_missing_fields(f)
            service_missing = (norm(f.get("maker")), norm(f.get("model"))) not in service_keys
            if service_missing:
                missing.append("wheel_torque_nm")
            if missing:
                year_from = str(f.get("year_from") or "")
                recency_score = 0
                try:
                    start_year = int(year_from[:4])
                    if start_year >= 2024:
                        recency_score = 30
                    elif start_year >= 2021:
                        recency_score = 20
                    elif start_year >= 2018:
                        recency_score = 10
                except ValueError:
                    pass
                queue.append({
                    "vehicle_id": f.get("vehicle_id"),
                    "search_id": s.get("search_id"),
                    "maker": f.get("maker"),
                    "model": f.get("model"),
                    "generation": f.get("generation"),
                    "year_from": f.get("year_from"),
                    "year_to": f.get("year_to"),
                    "status": "fitment_incomplete",
                    "missing_fields": sorted(set(missing)),
                    "needs_year_discovery": False,
                    "priority_score": 50 + recency_score + min(len(set(missing)) * 2, 20),
                    "priority_components": {
                        "fitment_gap": 50,
                        "recency": recency_score,
                        "missing_data": min(len(set(missing)) * 2, 20),
                        "market_popularity": None,
                        "store_usage": None
                    },
                    "next_action": "web_research",
                    "human_review_required": True
                })

    queue.sort(key=lambda x: (-x["priority_score"], str(x.get("maker")), str(x.get("model"))))
    output = {
        "schema_version": "0.2.0",
        "dataset": "missing_vehicle_data_queue",
        "policy": {
            "auto_confirm": "Only high-confidence values from manufacturer official or corroborated trusted sources may be promoted automatically.",
            "conflict": "Conflicting or unresolved values stay in this queue for human review.",
            "precision": "Store PCD/hub bore using application precision policy; preserve functional decimals such as thread pitch.",
            "priority": "recency + fitment gap + missing-data depth; popularity/store usage are reserved until those signals are available."
        },
        "record_count": len(queue),
        "records": queue
    }
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "missing-data-queue.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    md = [
        "# Missing Vehicle Data Queue",
        "",
        f"- Queue records: {len(queue)}",
        f"- Fitment missing: {sum(1 for x in queue if x['status'] == 'fitment_missing')}",
        f"- Fitment incomplete: {sum(1 for x in queue if x['status'] == 'fitment_incomplete')}",
        "",
        "## Top 30 priority",
    ]
    for item in queue[:30]:
        md.append(
            f"- {item.get('priority_score')} | {item.get('maker')} {item.get('model')} "
            f"{item.get('generation') or ''} | {', '.join(item.get('missing_fields') or [])}"
        )
    (REPORTS / "missing-data-queue.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(json.dumps({"queue_records": len(queue), "top_priority": queue[:5]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
