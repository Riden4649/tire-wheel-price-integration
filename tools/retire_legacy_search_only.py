#!/usr/bin/env python3
"""Retire explicitly approved legacy-only search entries with an audit trail."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app/data/jp_vehicle_search_master_2000_2026_v1.json"
FITMENT = ROOT / "app/data/vehicles_2012_2026.json"
CUMULATIVE = ROOT / "app/data/vehicle-updates/fitment-cumulative-2026-09-06.json"
AUDIT = ROOT / "app/data/vehicle-updates/search-master-retirements-2026-09-06.json"

RETIRE = {
    "トヨタ:オリジン": "生産終了した限定車。ユーザー承認により未登録検索候補から除外。",
    "トヨタ:スプリンター": "旧世代の生産終了車。ユーザー承認により未登録検索候補から除外。",
    "トヨタ:スプリンターカリブ": "旧世代の生産終了車。ユーザー承認により未登録検索候補から除外。",
    "トヨタ:スプリンターワゴン": "旧世代の生産終了車。ユーザー承認により未登録検索候補から除外。",
    "日産:インフィニティQ45": "国内販売終了から長期間経過した旧型車。ユーザー承認により未登録検索候補から除外。",
    "ホンダ:FCXクラリティ": "リース販売終了済みの旧型燃料電池車。ユーザー承認により未登録検索候補から除外。",
    "ホンダ:トルネオ": "生産終了した旧型車。ユーザー承認により未登録検索候補から除外。",
    "マツダ:トリビュート": "生産終了した旧型車。ユーザー承認により未登録検索候補から除外。",
    "マツダ:タイタンダッシュ": "生産終了した旧型商用車。ユーザー承認により未登録検索候補から除外。",
    "レクサス:HS": "2018年に販売終了した旧型車。ユーザーの明示承認により検索候補と適合データから除外。",
}

payload = json.loads(MASTER.read_text())
previous_audit = json.loads(AUDIT.read_text()) if AUDIT.exists() else {"retirements": []}
removed_by_id = {record["search_id"]: record for record in previous_audit.get("retirements", [])}
kept = []
for record in payload["vehicles"]:
    reason = RETIRE.get(record["search_id"])
    if reason:
        removed_by_id[record["search_id"]] = {
            "search_id": record["search_id"],
            "maker": record["maker"],
            "model": record["model"],
            "retired_at": "2026-09-06",
            "reason": reason,
            "previous_record": record,
        }
    else:
        kept.append(record)

missing = sorted(set(RETIRE) - set(removed_by_id))
if missing:
    raise SystemExit(f"retirement targets missing: {missing}")

fitment = json.loads(FITMENT.read_text())
hs_fitment = [record for record in fitment["vehicles"] if record["maker"] == "レクサス" and record["model"] == "HS"]
fitment["vehicles"] = [record for record in fitment["vehicles"] if not (record["maker"] == "レクサス" and record["model"] == "HS")]
fitment["record_count"] = len(fitment["vehicles"])
FITMENT.write_text(json.dumps(fitment, ensure_ascii=False, indent=2) + "\n")

if CUMULATIVE.exists():
    cumulative = json.loads(CUMULATIVE.read_text())
    cumulative["updates"] = [record for record in cumulative["updates"] if not (record["maker"] == "レクサス" and record["model"] == "HS")]
    CUMULATIVE.write_text(json.dumps(cumulative, ensure_ascii=False, indent=2) + "\n")

hs_audit = removed_by_id.get("レクサス:HS")
if hs_audit is not None and hs_fitment:
    hs_audit["previous_fitment_records"] = hs_fitment

payload["vehicles"] = kept
payload["record_count"] = len(kept)
payload["scope_note"] = "旧型・生産終了車10件はユーザー承認により2026-09-06に除外（レクサスHSは適合データも除外）。監査記録はvehicle-updates/search-master-retirements-2026-09-06.json。"
MASTER.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
removed = [removed_by_id[search_id] for search_id in RETIRE]
AUDIT.write_text(json.dumps({
    "schema_version": "1.0.0",
    "retired_at": "2026-09-06",
    "policy": "remove_legacy_search_only_with_user_approval",
    "count": len(removed),
    "retirements": removed,
}, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"remaining_search": len(kept), "retired_search": len(removed), "remaining_fitment": len(fitment["vehicles"]), "retired_fitment": len(hs_fitment)}, ensure_ascii=False))
