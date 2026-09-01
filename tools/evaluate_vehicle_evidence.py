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
        parsed = urlparse(url)
        if parsed.scheme != "https":
            return ""
        return parsed.netloc.lower().removeprefix("www.")
    except Exception:
        return ""


def registry_source_type(url, registry):
    domain = domain_of(url)
    if not domain:
        return "unknown"
    for item in registry.get("domains", []):
        known = item.get("domain", "").lower()
        if domain == known or domain.endswith("." + known):
            return item.get("source_type", "unknown")
    return "unknown"


def normalize_value(field, value):
    if field == "hub_bore" and isinstance(value, (int, float)):
        return int(value)
    return value


def decide_group(vehicle_id, field, items):
    by_value = defaultdict(list)
    for item in items:
        key = json.dumps(item["normalized_value"], ensure_ascii=False, sort_keys=True)
        by_value[key].append(item)

    if len(by_value) > 1:
        return "review", {
            "vehicle_id": vehicle_id,
            "field": field,
            "reason": "conflicting_values",
            "evidence": items,
        }

    same = next(iter(by_value.values()))
    value = same[0]["normalized_value"]
    official = [x for x in same if x["source_type"] == "manufacturer_official"]
    independent_domains = {
        x["source_domain"] for x in same
        if x["source_weight"] >= 70 and x["source_domain"]
    }

    if official:
        return "accepted", {
            "vehicle_id": vehicle_id,
            "field": field,
            "value": value,
            "decision": "auto_confirm_official",
            "confidence": "A",
            "evidence": same,
        }
    if len(independent_domains) >= 2:
        return "accepted", {
            "vehicle_id": vehicle_id,
            "field": field,
            "value": value,
            "decision": "auto_confirm_cross_checked",
            "confidence": "B",
            "evidence": same,
        }
    return "pending", {
        "vehicle_id": vehicle_id,
        "field": field,
        "value": value,
        "reason": "insufficient_independent_evidence",
        "evidence": same,
    }


def evaluate_records(records, registry):
    policies = registry.get("policy", {})
    grouped = defaultdict(list)
    invalid = []

    for rec in records:
        vehicle_id = rec.get("vehicle_id")
        field = rec.get("field")
        url = rec.get("source_url")
        if not vehicle_id or not field or "value" not in rec or not url:
            invalid.append({**rec, "invalid_reason": "missing_required_field"})
            continue

        domain = domain_of(url)
        detected_type = registry_source_type(url, registry)
        declared_type = rec.get("source_type")
        if not domain:
            invalid.append({**rec, "invalid_reason": "invalid_or_non_https_source_url"})
            continue
        if declared_type and declared_type != detected_type:
            invalid.append({
                **rec,
                "invalid_reason": "source_type_domain_mismatch",
                "declared_source_type": declared_type,
                "detected_source_type": detected_type,
            })
            continue

        source_type = detected_type
        weight = policies.get(source_type, {}).get("weight", 0)
        grouped[(vehicle_id, field)].append({
            **rec,
            "source_type": source_type,
            "source_weight": weight,
            "normalized_value": normalize_value(field, rec.get("value")),
            "source_domain": domain,
        })

    accepted, review, pending = [], [], []
    for (vehicle_id, field), items in grouped.items():
        bucket, result = decide_group(vehicle_id, field, items)
        if bucket == "accepted":
            accepted.append(result)
        elif bucket == "review":
            review.append(result)
        else:
            pending.append(result)

    return accepted, review, pending, invalid


def main():
    REPORTS.mkdir(exist_ok=True)
    registry = load(REGISTRY)
    evidence = load(EVIDENCE)
    accepted, review, pending, invalid = evaluate_records(evidence.get("records", []), registry)

    result = {
        "schema_version": "1.0.1",
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
    REVIEW.write_text(json.dumps({"schema_version": "1.0.1", "dataset": "vehicle_review_queue", "records": review + pending}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    CHANGE.write_text(json.dumps({"schema_version": "1.0.1", "dataset": "vehicle_change_plan", "production_master_write": False, "records": accepted}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"accepted": len(accepted), "review": len(review), "pending": len(pending), "invalid": len(invalid)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
