#!/usr/bin/env python3
import json
import re
from collections import defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app" / "data"
UPDATES = DATA / "vehicle-updates"
REPORTS = ROOT / "reports"
REGISTRY = UPDATES / "source_registry.json"
EVIDENCE = UPDATES / "research-evidence.json"
FITMENT = DATA / "vehicles_2012_2026.json"
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


def value_is_sane(field, value):
    if field == "wheel_torque_nm":
        return isinstance(value, int) and not isinstance(value, bool) and 50 <= value <= 250
    if field == "thread_diameter":
        return isinstance(value, str) and re.fullmatch(r"M\d+(?:\.\d+)?", value) is not None
    if field == "thread_pitch":
        return isinstance(value, (int, float)) and not isinstance(value, bool) and 0.5 <= float(value) <= 2.5
    if field == "pcd":
        return isinstance(value, (int, float)) and not isinstance(value, bool) and 80 <= float(value) <= 200
    if field == "holes":
        return isinstance(value, int) and not isinstance(value, bool) and 3 <= value <= 8
    if field == "hub_bore":
        return isinstance(value, (int, float)) and not isinstance(value, bool) and 40 <= float(value) <= 130
    return True


def valid_verified_at(value):
    try:
        return date.fromisoformat(value) <= date.today()
    except (TypeError, ValueError):
        return False


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


def evaluate_records(records, registry, valid_vehicle_ids=None):
    policies = registry.get("policy", {})
    grouped = defaultdict(list)
    invalid = []
    seen = set()

    for rec in records:
        vehicle_id = rec.get("vehicle_id")
        field = rec.get("field")
        url = rec.get("source_url")
        if not vehicle_id or not field or "value" not in rec or not url:
            invalid.append({**rec, "invalid_reason": "missing_required_field"})
            continue
        if valid_vehicle_ids is not None and vehicle_id not in valid_vehicle_ids:
            invalid.append({**rec, "invalid_reason": "unknown_vehicle_id"})
            continue
        if not value_is_sane(field, rec.get("value")):
            invalid.append({**rec, "invalid_reason": "implausible_field_value"})
            continue
        if not valid_verified_at(rec.get("verified_at")):
            invalid.append({**rec, "invalid_reason": "invalid_verified_at"})
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

        duplicate_key = (
            vehicle_id, field,
            json.dumps(rec.get("value"), ensure_ascii=False, sort_keys=True),
            url,
        )
        if duplicate_key in seen:
            invalid.append({**rec, "invalid_reason": "duplicate_evidence"})
            continue
        seen.add(duplicate_key)

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
    fitment = load(FITMENT)
    valid_vehicle_ids = {x.get("vehicle_id") for x in fitment.get("vehicles", []) if x.get("vehicle_id")}
    accepted, review, pending, invalid = evaluate_records(
        evidence.get("records", []), registry, valid_vehicle_ids=valid_vehicle_ids
    )

    result = {
        "schema_version": "1.0.2",
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
    REVIEW.write_text(json.dumps({"schema_version": "1.0.2", "dataset": "vehicle_review_queue", "records": review + pending}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    CHANGE.write_text(json.dumps({"schema_version": "1.0.2", "dataset": "vehicle_change_plan", "production_master_write": False, "records": accepted}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"accepted": len(accepted), "review": len(review), "pending": len(pending), "invalid": len(invalid)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
