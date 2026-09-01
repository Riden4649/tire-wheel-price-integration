#!/usr/bin/env python3
import importlib.util
import json
import re
import sys
from datetime import date
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
    if field == "wheel_torque_nm":
        return isinstance(value, int) and 50 <= value <= 250
    if field == "thread_diameter":
        return isinstance(value, str) and re.fullmatch(r"M\d+(?:\.\d+)?", value) is not None
    if field == "thread_pitch":
        return isinstance(value, (int, float)) and 0.5 <= float(value) <= 2.5
    if field == "pcd":
        return isinstance(value, (int, float)) and 80 <= float(value) <= 200
    if field == "holes":
        return isinstance(value, int) and 3 <= value <= 8
    if field == "hub_bore":
        return isinstance(value, (int, float)) and 40 <= float(value) <= 130
    return True


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

        try:
            verified = date.fromisoformat(rec.get("verified_at", ""))
            check(verified <= date.today(), f"verified_at is in future: {rec.get('verified_at')}")
        except ValueError:
            check(False, f"Invalid verified_at date: {rec.get('verified_at')}")

    # Regression anchors independently re-checked against manufacturer official pages on 2026-09-01.
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

    accepted, review, pending, invalid = ev.evaluate_records(evidence, registry)
    check(len(accepted) == len(evidence), "All current official evidence should be accepted")
    check(not review, "Current evidence unexpectedly entered review")
    check(not pending, "Current evidence unexpectedly became pending")
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


def rec(url, value=100, source_type=None, field="wheel_torque_nm"):
    out = {"vehicle_id": "TEST", "field": field, "value": value, "source_url": url}
    if source_type is not None:
        out["source_type"] = source_type
    return out


def test_adversarial_decisions():
    registry = synthetic_registry()

    a, r, p, i = ev.evaluate_records([rec("https://toyota.example/manual", 131, "manufacturer_official")], registry)
    check(len(a) == 1 and a[0]["confidence"] == "A", "Official source must yield confidence A")

    a, r, p, i = ev.evaluate_records([rec("https://evil.example/fake", 131, "manufacturer_official")], registry)
    check(not a and len(i) == 1 and i[0]["invalid_reason"] == "source_type_domain_mismatch", "Spoofed official source must be rejected")

    a, r, p, i = ev.evaluate_records([
        rec("https://trusted-a.example/a", 108, "trusted_secondary"),
        rec("https://trusted-b.example/b", 108, "trusted_secondary"),
    ], registry)
    check(len(a) == 1 and a[0]["confidence"] == "B", "Two independent trusted sources must yield confidence B")

    a, r, p, i = ev.evaluate_records([rec("https://trusted-a.example/a", 108, "trusted_secondary")], registry)
    check(len(p) == 1 and not a, "One non-official source must remain pending")

    a, r, p, i = ev.evaluate_records([
        rec("https://trusted-a.example/a", 103, "trusted_secondary"),
        rec("https://trusted-b.example/b", 108, "trusted_secondary"),
    ], registry)
    check(len(r) == 1 and r[0]["reason"] == "conflicting_values", "Conflicting values must require review")

    a, r, p, i = ev.evaluate_records([rec("http://toyota.example/manual", 131, "manufacturer_official")], registry)
    check(len(i) == 1 and i[0]["invalid_reason"] == "invalid_or_non_https_source_url", "Non-HTTPS evidence must be invalid")

    check(ev.normalize_value("hub_bore", 54.1) == 54, "hub_bore precision rule must truncate fraction")
    check(ev.normalize_value("pcd", 114.3) == 114.3, "PCD 114.3 must preserve decimal")
    check(ev.normalize_value("thread_pitch", 1.5) == 1.5, "Thread pitch must preserve decimal")


def main():
    test_live_evidence()
    test_adversarial_decisions()
    print(json.dumps({"checks": checks, "failures": len(failures), "failure_messages": failures}, ensure_ascii=False, indent=2))
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
