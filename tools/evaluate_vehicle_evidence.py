#!/usr/bin/env python3
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
UPDATES = ROOT / "app" / "data" / "vehicle-updates"
REPORTS = ROOT / "reports"
REGISTRY = UPDATES / "source_registry.json"
EVIDENCE = UPDATES / "research-evidence.json"
OUT = REPORTS / "evidence-evaluation.json"
REVIEW = REPORTS / "review-queue.json"
CHANGE = REPORTS / "change-plan.json"


def load(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def domain_of(url):
    try:
        return urlparse(url).netloc.lower().removeprefix("www.")
    except Exception:
        return ""


def classify_source(url, explicit_type, registry):
    if explicit_type:
        return explicit_type
    domain = domain_of(url)
    for item in registry.get("domains", []):
        known = item.get("domain", "").lower()
        if domain == known or domain.endswith("." + known):
            return item.get("source_type", "unknown")
    return "unknown"


def normalize_value(field, value):
    if field == "hub_bore" and isinstance(value, (int, float)):
        return int(value)
    return value


def main():
    REPORTS.mkdir(exist_ok=True)
    registry = load(REGISTRY)
    evidence = load(EVIDENCE)
    policies = registry.get("policy", {})
    records = evidence.get("records", [])

    grouped = defaultdict(list)
    invalid = []
    for rec in records:
        vehicle_id = rec.get("vehicle_id")
        field = rec.get("field")
        if not vehicle_id or not field or "value" not in rec or not rec.get("source_url"):
            invalid.append(rec)
            continue
        source_type = classify_source(rec.get("source_url"), rec.get("source_type"), registry)
        weight = policies.get(source_type, {}).get("weight", 0)
        grouped[(vehicle_id, field)].append({
            **rec,
            "source_type": source_type,
            "source_weight": weight,
            "normalized_value": normalize_value(field, rec.get("value")),
            "source_domain": domain_of(rec.get("source_url")),
        })

    accepted = []
    review = []
    pending = []
    for (vehicle_id, field), items in grouped.items():
        by_value = defaultdict(list)
        for item in items:
            key = json.dumps(item["normalized_value"], ensure_ascii=False, sort_keys=True)
            by_value[key].append(item)

        if len(by_value) > 1:
            review.append({
                "vehicle_id": vehicle_id,
                "field": field,
                "reason": "conflicting_values",
                "evidence": items,
            })
            continue

        same = next(iter(by_value.values()))
        value = same[0]["normalized_value"]
        official = [x for x in same if x["source_type"] == "manufacturer_official"]
        independent_domains = {x["source_domain"] for x in same if x["source_weight"] >= 70 and x["source_domain"]}

        if official:
            accepted.append({
                "vehicle_id": vehicle_id,
                "field": field,
                "value": value,
                "decision": "auto_confirm_official",
                "confidence": "A",
                "evidence": same,
            })
        elif len(independent_domains) >= 2:
            accepted.append({
                "vehicle_id": vehicle_id,
                "field": field,
                "value": value,
                "decision": "auto_confirm_cross_checked",
                "confidence": "B",
                "evidence": same,
            })
        else:
            pending.append({
                "vehicle_id": vehicle_id,
                "field": field,
                "value": value,
                "reason": "insufficient_independent_evidence",
                "evidence": same,
            })

    result = {
        "schema_version": "1.0.0",
        "accepted_count": len(accepted),
        "review_count": len(review),
        "pending_count": len(pending),
        "invalid_count": len(invalid),
        "accepted": accepted,
        "review": review,
        "pending": pending,
        "invalid": invalid,
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REVIEW.write_text(json.dumps({"schema_version": "1.0.0", "dataset": "vehicle_review_queue", "records": review + pending}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    CHANGE.write_text(json.dumps({"schema_version": "1.0.0", "dataset": "vehicle_change_plan", "production_master_write": False, "records": accepted}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"accepted": len(accepted), "review": len(review), "pending": len(pending), "invalid": len(invalid)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
