#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app" / "data"
UPDATES = DATA / "vehicle-updates"
FITMENT = DATA / "vehicles_2012_2026.json"
SERVICE = DATA / "vehicle_service_specs.json"
EVIDENCE = UPDATES / "research-evidence.json"

ALLOWED = {
    ("TOY_LC250", "wheel_torque_nm"),
    ("TOY_BZ4X_XEAM11_XEAM15", "wheel_torque_nm"),
    ("HON_FREED_GT", "wheel_torque_nm"),
    ("HON_FREED_GT", "thread_diameter"),
    ("HON_FREED_GT", "thread_pitch"),
}


def load(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def append_source(rec, ev):
    sources = rec.setdefault("sources", [])
    src = {
        "source_type": ev.get("source_type"),
        "source_name": ev.get("source_name"),
        "source_url": ev.get("source_url"),
        "verified_at": ev.get("verified_at"),
    }
    if not any(s.get("source_url") == src["source_url"] and s.get("source_name") == src["source_name"] for s in sources):
        sources.append(src)


def upsert_service(service, fitment_rec, ev):
    maker, model = fitment_rec.get("maker"), fitment_rec.get("model")
    records = service.setdefault("records", [])
    existing = next((r for r in records if r.get("maker") == maker and r.get("model") == model), None)
    year_from = int(str(fitment_rec.get("year_from"))[:4])
    year_to = int(str(fitment_rec.get("year_to"))[:4])
    payload = {
        "maker": maker,
        "model": model,
        "year_from": year_from,
        "year_to": year_to,
        "wheel_torque_nm": ev["value"],
        "torque_label": f"{ev['value']} N・m",
        "source_name": ev.get("source_name"),
        "source_url": ev.get("source_url"),
        "verified_at": ev.get("verified_at"),
    }
    if existing:
        existing.update(payload)
    else:
        records.append(payload)


def main():
    fitment = load(FITMENT)
    service = load(SERVICE)
    evidence = load(EVIDENCE).get("records", [])

    vehicles = fitment.get("vehicles", [])
    by_id = {v.get("vehicle_id"): v for v in vehicles}
    applied = []

    for ev in evidence:
        key = (ev.get("vehicle_id"), ev.get("field"))
        if key not in ALLOWED:
            continue
        rec = by_id.get(ev.get("vehicle_id"))
        if rec is None:
            raise SystemExit(f"vehicle_id not found: {ev.get('vehicle_id')}")
        if ev.get("source_type") != "manufacturer_official":
            raise SystemExit(f"non-official evidence not allowed for production sync: {key}")

        field = ev.get("field")
        if field == "wheel_torque_nm":
            rec["wheel_torque_nm"] = ev["value"]
            upsert_service(service, rec, ev)
        elif field in {"thread_diameter", "thread_pitch"}:
            details = rec.setdefault("fastener_details", {})
            details[field] = ev["value"]
        else:
            raise SystemExit(f"unsupported field: {field}")

        append_source(rec, ev)
        applied.append({"vehicle_id": ev.get("vehicle_id"), "field": field, "value": ev.get("value")})

    freed = by_id.get("HON_FREED_GT")
    if freed:
        d = freed.get("fastener_details") or {}
        if d.get("thread_diameter") == "M12" and d.get("thread_pitch") == 1.5:
            seat = d.get("seat")
            if seat in (None, "", "unknown"):
                freed["fastener"] = "ナット締結（M12×1.5、座面要確認）"
            else:
                freed["fastener"] = f"ナット締結（M12×1.5、{seat}）"

    service["updated_at"] = "2026-09-01"
    save(FITMENT, fitment)
    save(SERVICE, service)
    print(json.dumps({"applied_count": len(applied), "applied": applied, "service_record_count": len(service.get('records', []))}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
