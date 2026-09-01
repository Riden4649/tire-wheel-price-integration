#!/usr/bin/env python3
import importlib.util
import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPDATES = ROOT / "app" / "data" / "vehicle-updates"
EVIDENCE = UPDATES / "research-evidence.json"
REGISTRY = UPDATES / "source_registry.json"
FITMENT = ROOT / "app" / "data" / "vehicles_2012_2026.json"
EVALUATOR = ROOT / "tools" / "evaluate_vehicle_evidence.py"

spec = importlib.util.spec_from_file_location("evaluator", EVALUATOR)
ev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ev)

failures = []
checks = 0


def check(condition, message):
    global checks
    checks += 1
    if not condition:
        failures.append(message)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def field_sane(field, value):
    return ev.value_is_sane(field, value)


def test_live_evidence():
    evidence = load(EVIDENCE).get("records", [])
    registry = load(REGISTRY)
    fitment_ids = {x.get("vehicle_id") for x in load(FITMENT).get("vehicles", [])}
    seen = set()

    for rec in evidence:
        vid = rec.get("vehicle_id")
        field = rec.get("field")
        value = rec.get("value")
        url = rec.get("source_url", "")
        key = (vid, field, json.dumps(value, ensure_ascii=False, sort_keys=True), url)

        check(vid in fitment_ids, f"Unknown vehicle_id in evidence: {vid}")
        check(field_sane(field, value), f"Implausible value: {vid} {field}={value!r}")
        check(key not in seen, f"Duplicate evidence record: {key}")
        seen.add(key)

        detected = ev.registry_source_type(url, registry)
        check(detected != "unknown", f"Evidence source domain is not registered: {url}")
        check(rec.get("source_type") == detected, f"Declared source type mismatch: {url}")
        check(ev.domain_of(url) != "", f"Source URL must be HTTPS: {url}")
        check(ev.valid_verified_at(rec.get("verified_at")), f"Invalid verified_at: {rec.get('verified_at')}")

    anchors = {
        ("TOY_LC250", "wheel_torque_nm"): 131,
        ("TOY_BZ4X_XEAM11_XEAM15", "wheel_torque_nm"): 103,
        ("HON_FREED_GT", "wheel_torque_nm"): 108,
        ("HON_FREED_GT", "thread_diameter"): "M12",
        ("HON_FREED_GT", "thread_pitch"): 1.5,
    }
    live = {(x.get("vehicle_id"), x.get("field")): x.get("value") for x in evidence}
    for key, expected in anchors.items():
        check(live.get(key) == expected, f"Official regression anchor changed: {key} expected {expected}, got {live.get(key)}")

    accepted, review, pending, invalid = ev.evaluate_records(evidence, registry, valid_vehicle_ids=fitment_ids)
    accepted_keys = {(x.get("vehicle_id"), x.get("field")) for x in accepted}
    official_keys = {
        (x.get("vehicle_id"), x.get("field"))
        for x in evidence
        if x.get("source_type") == "manufacturer_official"
    }
    pending_keys = {(x.get("vehicle_id"), x.get("field")) for x in pending}
    single_wheel_keys = {
        (x.get("vehicle_id"), x.get("field"))
        for x in evidence
        if x.get("source_type") == "wheel_manufacturer_official"
    }

    check(official_keys <= accepted_keys, "Manufacturer-official evidence must be accepted")
    check(single_wheel_keys <= pending_keys | accepted_keys, "Wheel-maker evidence must remain pending until corroborated, or be accepted after corroboration")
    check(not review, "Current evidence unexpectedly entered review")
    check(not invalid, "Current evidence unexpectedly became invalid")


def synthetic_registry():
    return {
        "policy": {
            "manufacturer_official": {"weight": 100},
            "wheel_manufacturer_official": {"weight": 90},
            "trusted_secondary": {"weight": 70},
            "unknown": {"weight": 0},
        },
        "domains": [
            {"domain": "toyota.example", "source_type": "manufacturer_official"},
            {"domain": "trusted-a.example", "source_type": "trusted_secondary"},
            {"domain": "trusted-b.example", "source_type": "trusted_secondary"},
        ],
    }


def rec(url, value=100, source_type=None, field="wheel_torque_nm", vehicle_id="TEST", verified_at="2026-09-01"):
    out = {
        "vehicle_id": vehicle_id,
        "field": field,
        "value": value,
        "source_url": url,
        "verified_at": verified_at,
    }
    if source_type is not None:
        out["source_type"] = source_type
    return out


def test_adversarial_decisions():
    registry = synthetic_registry()
    valid = {"TEST"}

    a, r, p, i = ev.evaluate_records([rec("https://toyota.example/manual", 131, "manufacturer_official")], registry, valid)
    check(len(a) == 1 and a[0]["confidence"] == "A", "Official source must yield confidence A")

    a, r, p, i = ev.evaluate_records([rec("https://evil.example/fake", 131, "manufacturer_official")], registry, valid)
    check(not a and len(i) == 1 and i[0]["invalid_reason"] == "source_type_domain_mismatch", "Spoofed official source must be rejected")

    a, r, p, i = ev.evaluate_records([
        rec("https://trusted-a.example/a", 108, "trusted_secondary"),
        rec("https://trusted-b.example/b", 108, "trusted_secondary"),
    ], registry, valid)
    check(len(a) == 1 and a[0]["confidence"] == "B", "Two independent trusted sources must yield confidence B")

    a, r, p, i = ev.evaluate_records([rec("https://trusted-a.example/a", 108, "trusted_secondary")], registry, valid)
    check(len(p) == 1 and not a, "One non-official source must remain pending")

    a, r, p, i = ev.evaluate_records([
        rec("https://trusted-a.example/a", 103, "trusted_secondary"),
        rec("https://trusted-b.example/b", 108, "trusted_secondary"),
    ], registry, valid)
    check(len(r) == 1 and r[0]["reason"] == "conflicting_values", "Conflicting values must require review")

    a, r, p, i = ev.evaluate_records([rec("http://toyota.example/manual", 131, "manufacturer_official")], registry, valid)
    check(len(i) == 1 and i[0]["invalid_reason"] == "invalid_or_non_https_source_url", "Non-HTTPS evidence must be invalid")

    a, r, p, i = ev.evaluate_records([rec("https://toyota.example/manual", 999, "manufacturer_official")], registry, valid)
    check(len(i) == 1 and i[0]["invalid_reason"] == "implausible_field_value", "Absurd torque must be rejected")

    a, r, p, i = ev.evaluate_records([rec("https://toyota.example/manual", 131, "manufacturer_official", vehicle_id="UNKNOWN")], registry, valid)
    check(len(i) == 1 and i[0]["invalid_reason"] == "unknown_vehicle_id", "Unknown vehicle_id must be rejected")

    future = (datetime.now(ev.JST).date() + timedelta(days=1)).isoformat()
    a, r, p, i = ev.evaluate_records([rec("https://toyota.example/manual", 131, "manufacturer_official", verified_at=future)], registry, valid)
    check(len(i) == 1 and i[0]["invalid_reason"] == "invalid_verified_at", "Future verification date must be rejected")

    duplicate = rec("https://toyota.example/manual", 131, "manufacturer_official")
    a, r, p, i = ev.evaluate_records([duplicate, dict(duplicate)], registry, valid)
    check(len(a) == 1 and len(i) == 1 and i[0]["invalid_reason"] == "duplicate_evidence", "Duplicate evidence must be rejected without losing the valid original")

    check(ev.normalize_value("hub_bore", 54.1) == 54, "hub_bore precision rule must truncate fraction")
    check(ev.normalize_value("pcd", 114.3) == 114.3, "PCD 114.3 must preserve decimal")
    check(ev.normalize_value("thread_pitch", 1.5) == 1.5, "Thread pitch must preserve decimal")

    check(ev.value_is_sane("wheel_torque_nm", 108), "Normal torque must be sane")
    check(not ev.value_is_sane("wheel_torque_nm", 999), "999 N.m must be insane")
    check(ev.value_is_sane("thread_diameter", "M12"), "M12 must be sane")
    check(not ev.value_is_sane("thread_diameter", "12mm"), "Malformed thread diameter must be rejected")
    check(ev.value_is_sane("thread_pitch", 1.5), "1.5 thread pitch must be sane")
    check(ev.value_is_sane("pcd", 114.3), "PCD 114.3 must be sane")


def main():
    test_live_evidence()
    test_adversarial_decisions()
    print(json.dumps({"checks": checks, "failures": len(failures), "failure_messages": failures}, ensure_ascii=False, indent=2))
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
