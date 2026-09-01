#!/usr/bin/env python3
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app" / "data"
SEARCH = DATA / "jp_vehicle_search_master_2000_2026_v1.json"
FITMENT = DATA / "vehicles_2012_2026.json"
SERVICE = DATA / "vehicle_service_specs.json"
GENERATION_REVIEW_MONTHS = 60


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def pct(n, d):
    return round((n / d * 100), 1) if d else 0.0


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


def generation_review(rec):
    start = ym_to_month(rec.get("year_from"))
    end = ym_to_month(rec.get("year_to"))
    if start is None or end is None or end < start:
        return None
    span = end - start + 1
    if span < GENERATION_REVIEW_MONTHS:
        return None
    return {
        "vehicle_id": rec.get("vehicle_id"),
        "maker": rec.get("maker"),
        "model": rec.get("model"),
        "generation": rec.get("generation"),
        "model_codes": rec.get("model_codes") or [],
        "year_from": rec.get("year_from"),
        "year_to": rec.get("year_to"),
        "span_months": span,
        "reason": "generation_span_5y_or_more",
        "action": "Confirm full-model-change dates and model-code boundaries from reliable sources. Do not auto-split; genuine long generations are allowed."
    }


def main():
    search = load_json(SEARCH)
    fitment = load_json(FITMENT)
    service = load_json(SERVICE)

    search_records = search.get("vehicles") or search.get("records") or []
    fitment_records = fitment.get("vehicles") or []
    service_records = service.get("records") or []

    fitment_ids = [r.get("vehicle_id") for r in fitment_records if r.get("vehicle_id")]
    duplicate_ids = sorted([k for k, v in Counter(fitment_ids).items() if v > 1])

    tracked_fields = [
        "pcd", "holes", "hub_bore", "fastener", "oem_inch", "oem_tire",
        "year_from", "year_to", "generation"
    ]
    missing = {field: 0 for field in tracked_fields}
    for rec in fitment_records:
        for field in tracked_fields:
            value = rec.get(field)
            if value is None or value == "" or value == []:
                missing[field] += 1

    fastener_detail_missing = 0
    for rec in fitment_records:
        details = rec.get("fastener_details") or {}
        method = details.get("method")
        if method in {"nut", "bolt"}:
            if details.get("thread_diameter") is None or details.get("thread_pitch") is None:
                fastener_detail_missing += 1

    generation_reviews = [x for x in (generation_review(r) for r in fitment_records) if x]
    generation_reviews.sort(key=lambda x: (-x["span_months"], str(x.get("maker")), str(x.get("model"))))

    fitment_model_keys = {
        (str(r.get("maker", "")).strip(), str(r.get("model", "")).strip())
        for r in fitment_records
    }
    service_unlinked = []
    for rec in service_records:
        key = (str(rec.get("maker", "")).strip(), str(rec.get("model", "")).strip())
        if key not in fitment_model_keys:
            service_unlinked.append({"maker": key[0], "model": key[1]})

    summary = {
        "search_records": len(search_records),
        "fitment_records": len(fitment_records),
        "service_records": len(service_records),
        "fitment_coverage_vs_search_pct": pct(len(fitment_records), len(search_records)),
        "duplicate_vehicle_ids": duplicate_ids,
        "missing_fitment_fields": missing,
        "missing_thread_spec_records": fastener_detail_missing,
        "generation_boundary_review_count": len(generation_reviews),
        "generation_boundary_review_policy": "5 years is a review trigger only; confirm actual generation/model-code boundaries and allow exceptions.",
        "generation_boundary_reviews": generation_reviews,
        "service_records_without_fitment_match": service_unlinked,
    }

    print(json.dumps(summary, ensure_ascii=False, indent=2))

    report_dir = ROOT / "reports"
    report_dir.mkdir(exist_ok=True)
    report = report_dir / "vehicle-db-health.json"
    report.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    md = [
        "# Vehicle DB Health Report",
        "",
        f"- Search master: {len(search_records)} records",
        f"- Fitment master: {len(fitment_records)} records",
        f"- Service specs: {len(service_records)} records",
        f"- Fitment coverage vs search: {summary['fitment_coverage_vs_search_pct']}%",
        f"- Duplicate vehicle_id: {len(duplicate_ids)}",
        f"- Thread spec incomplete: {fastener_detail_missing}",
        f"- Generation-boundary review: {len(generation_reviews)}",
        f"- Service specs without fitment match: {len(service_unlinked)}",
        "",
        "## Missing fitment fields",
    ]
    for field, count in missing.items():
        md.append(f"- {field}: {count}")
    if generation_reviews:
        md += ["", "## Generation-boundary review", "", "5 years is a review trigger only; it is not an automatic model-change boundary."]
        for x in generation_reviews[:50]:
            md.append(f"- {x['maker']} {x['model']} {x.get('generation') or ''} | {x['year_from']}–{x['year_to']} | {x['span_months']} months | model codes: {', '.join(x.get('model_codes') or [])}")
    if duplicate_ids:
        md += ["", "## Duplicate vehicle_id", *[f"- {x}" for x in duplicate_ids]]
    if service_unlinked:
        md += ["", "## Service specs without fitment match", *[f"- {x['maker']} {x['model']}" for x in service_unlinked]]
    (report_dir / "vehicle-db-health.md").write_text("\n".join(md) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
