#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app" / "data"
SEARCH = DATA / "jp_vehicle_search_master_2000_2026_v1.json"
FITMENT = DATA / "vehicles_2012_2026.json"
SERVICE = DATA / "vehicle_service_specs.json"
APP_SUBMITTED = DATA / "vehicle-updates" / "app-submitted-missing-vehicles.json"
REPORTS = ROOT / "reports"

# A five-year span is a RESEARCH TRIGGER only. It never auto-splits a generation.
GENERATION_REVIEW_MONTHS = 60


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


def ym_to_month(value):
    try:
        year, month = str(value).split("-", 1)
        y = int(year)
        m = int(month)
        if not 1 <= m <= 12:
            return None
        return y * 12 + (m - 1)
    except (TypeError, ValueError):
        return None


def generation_review_reason(rec):
    start = ym_to_month(rec.get("year_from"))
    end = ym_to_month(rec.get("year_to"))
    if start is None or end is None or end < start:
        return None
    span = end - start + 1
    if span < GENERATION_REVIEW_MONTHS:
        return None
    return {
        "span_months": span,
        "reason": "generation_span_5y_or_more",
        "rule": "Research trigger only; confirm full-model-change dates/model-code boundaries from reliable sources before splitting. Exceptions are allowed."
    }


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


def merge_app_submissions(queue):
    if not APP_SUBMITTED.exists():
        return
    payload = load_json(APP_SUBMITTED)
    known = {(norm(item.get("maker")), norm(item.get("model")), norm(item.get("generation"))) for item in queue}
    for item in payload.get("records") or []:
        identity = (norm(item.get("maker")), norm(item.get("model")), norm(item.get("model_code")))
        matching = next((row for row in queue if (norm(row.get("maker")), norm(row.get("model")), norm(row.get("generation"))) == identity), None)
        search_count = max(int(item.get("store_search_count") or 1), 1)
        if matching:
            matching["priority_score"] = max(int(matching.get("priority_score") or 0), 90 + min(search_count, 20))
            matching.setdefault("priority_components", {})["store_usage"] = search_count
            matching["app_submission_key"] = item.get("key")
            matching["github_issue_url"] = item.get("github_issue_url")
            continue
        if identity in known or not item.get("model"):
            continue
        queue.append({
            "submission_key": item.get("key"),
            "maker": item.get("maker"),
            "model": item.get("model"),
            "generation": item.get("model_code") or None,
            "model_codes": [item.get("model_code")] if item.get("model_code") else [],
            "year_from": f"{item.get('year')}-01" if str(item.get("year") or "").isdigit() else None,
            "year_to": None,
            "status": "app_submitted_missing",
            "missing_fields": ["generation", "year_from", "year_to", "pcd", "holes", "hub_bore", "fastener", "thread_diameter", "thread_pitch", "oem_tire"],
            "needs_year_discovery": True,
            "priority_score": 90 + min(search_count, 20),
            "priority_components": {"fitment_gap": 50, "store_usage": search_count, "app_submission": 40},
            "next_action": "web_research",
            "human_review_required": True,
            "submitted_context": {"grade": item.get("grade"), "tire_size": item.get("tire_size"), "memo": item.get("memo")},
            "github_issue_url": item.get("github_issue_url"),
        })
        known.add(identity)


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
            generation_review = generation_review_reason(f)
            if generation_review:
                missing.append("generation_boundary_review")

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

                missing_unique = sorted(set(missing))
                generation_score = 15 if generation_review else 0
                queue.append({
                    "vehicle_id": f.get("vehicle_id"),
                    "search_id": s.get("search_id"),
                    "maker": f.get("maker"),
                    "model": f.get("model"),
                    "generation": f.get("generation"),
                    "model_codes": f.get("model_codes") or [],
                    "year_from": f.get("year_from"),
                    "year_to": f.get("year_to"),
                    "status": "fitment_incomplete_or_generation_review",
                    "missing_fields": missing_unique,
                    "generation_review": generation_review,
                    "needs_year_discovery": False,
                    "priority_score": 50 + recency_score + min(len(missing_unique) * 2, 20) + generation_score,
                    "priority_components": {
                        "fitment_gap": 50,
                        "recency": recency_score,
                        "missing_data": min(len(missing_unique) * 2, 20),
                        "generation_integrity": generation_score,
                        "market_popularity": None,
                        "store_usage": None
                    },
                    "next_action": "web_research_generation_and_fitment" if generation_review else "web_research",
                    "human_review_required": True
                })

    merge_app_submissions(queue)
    queue.sort(key=lambda x: (-x["priority_score"], str(x.get("maker")), str(x.get("model"))))
    output = {
        "schema_version": "0.3.0",
        "dataset": "missing_vehicle_data_queue",
        "policy": {
            "auto_confirm": "Only high-confidence values from manufacturer official or corroborated trusted sources may be promoted automatically.",
            "conflict": "Conflicting or unresolved values stay in this queue for human review.",
            "precision": "Preserve functional decimals such as PCD 114.3 and thread pitch 1.5.",
            "generation_integrity": "A fitment record spanning 5 years or more is flagged for research, not automatically split. Confirm full-model-change dates and model-code boundaries; allow genuine long-generation exceptions.",
            "priority": "recency + fitment gap + missing-data depth + generation-integrity review; popularity/store usage are reserved until those signals are available."
        },
        "record_count": len(queue),
        "generation_review_count": sum(1 for x in queue if x.get("generation_review")),
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
        f"- Generation-boundary review: {output['generation_review_count']}",
        "- 5 years is a review trigger only; never an automatic generation split.",
        "",
        "## Top 30 priority",
    ]
    for item in queue[:30]:
        span = (item.get("generation_review") or {}).get("span_months")
        span_text = f" | generation span {span}m" if span else ""
        md.append(
            f"- {item.get('priority_score')} | {item.get('maker')} {item.get('model')} "
            f"{item.get('generation') or ''} | {', '.join(item.get('missing_fields') or [])}{span_text}"
        )
    (REPORTS / "missing-data-queue.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(json.dumps({"queue_records": len(queue), "generation_review": output["generation_review_count"], "top_priority": queue[:5]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
