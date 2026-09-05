#!/usr/bin/env python3
"""Complete the reviewed legacy fitment rows from official matching data."""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FITMENT = ROOT / "app" / "data" / "vehicles_2012_2026.json"
CHANGE_LOG = ROOT / "app" / "data" / "vehicle-updates" / "change_log.json"
VERIFIED_AT = "2026-09-05"

WEDS_CATALOG = {
    "source_type": "wheel_manufacturer_official",
    "source_name": "Weds WHEEL MATCHING BOOK 2025-2026（前回共有PDF）",
    "source_url": "https://www.weds.co.jp/catalog/winter_2026/",
    "verified_at": VERIFIED_AT,
}
TOPY_MATCHING = {
    "source_type": "wheel_manufacturer_official",
    "source_name": "TOPY 2025年国産車用マッチングデータ（前回共有Excel）",
    "source_url": "https://www.topy-ep.co.jp/product/automotive/wheels/",
    "verified_at": VERIFIED_AT,
}


def spec(pcd, holes, hub_bore, diameter="M12", pitch=1.5, source=WEDS_CATALOG):
    return {
        "pcd": pcd,
        "holes": holes,
        "hub_bore": hub_bore,
        "fastener": f"{diameter}×P{pitch}",
        "fastener_details": {
            "method": "nut",
            "thread_diameter": diameter,
            "thread_pitch": pitch,
        },
        "source": source,
    }


UPDATES = {
    "TOY_PRIUS_NHW20": spec(100, 5, 54, source=TOPY_MATCHING),
    "TOY_ALPHARD_10": spec(114.3, 5, 60, source=TOPY_MATCHING),
    "HON_FIT_GD": spec(100, 4, 56),
    "HON_STEPWGN_RG": spec(114.3, 5, 64),
    "HON_ODYSSEY_RB12": spec(114.3, 5, 64),
    "HON_STREAM_RN15": spec(114.3, 5, 64, source=TOPY_MATCHING),
    "HON_STREAM_RN69": spec(114.3, 5, 64),
    "HON_ACCORD_CL": spec(114.3, 5, 64),
    "HON_ELYSION_RR": spec(114.3, 5, 64),
    "HON_INSIGHT_ZE1": spec(100, 4, 56, source=TOPY_MATCHING),
    "HON_LEGEND_KB1": spec(120, 5, 64, diameter="M14"),
    "LEX_LS_USF40": spec(120, 5, 60, diameter="M14"),
    "TOY_ISIS_10_2007": spec(114.3, 5, 60, source=TOPY_MATCHING),
    "TOY_BB_QNC_2008": spec(100, 4, 54, source=TOPY_MATCHING),
    "TOY_IQ_KGJ_NGJ_2009": spec(100, 4, 54, source=TOPY_MATCHING),
    "TOY_IST_NCP110_2010": spec(100, 5, 54, source=TOPY_MATCHING),
    "TOY_RACTIS_120_2010": spec(100, 5, 54, source=TOPY_MATCHING),
}

LEXUS_THREAD_UPDATES = {
    "LEX_LC_Z100": ("M14", 1.5, "https://search.weds.co.jp/maker/lexus/lc-100kei-236--a-d/kranze-all/?size=18inch"),
    "LEX_RZ_E10": ("M14", 1.5, "https://search.weds.co.jp/maker/lexus/rz-m10kei-a-d/novaris-all/"),
    "LEX_LS_XF50": ("M14", 1.5, "https://search.weds.co.jp/brand/adventure/mudvancex-typem/lexus/ls-50kei-2310-fsportnozoku-a-d/"),
    "LEX_NX_AZ20": ("M14", 1.5, "https://search.weds.co.jp/brand/maverick/1613m/lexus/nx-20keinx350h-nx350-nx250-opushonorenjikyaripaafukumu-a-d/index.html"),
    "LEX_RX_AL30": ("M14", 1.5, "https://search.weds.co.jp/brand/kranze/versam030evo/lexus/rx-a10-h10keifsport-a-d/"),
    "LEX_LBX_MAYH": ("M14", 1.5, "https://search.weds.co.jp/maker/lexus/lbx-h10keimorizorrnozoku-a-d/wedssport-tc105xforged/"),
    "LEX_GX_550_JP": ("M14", 1.5, "https://search.weds.co.jp/brand/adventure/mudvancex-typem/lexus/gx-250keigx550verl-a/"),
    "LEX_LX_300_CURRENT": ("M14", 1.5, "https://search.weds.co.jp/brand/kranze/versam030evo/lexus/lx-300keilx700-7ninnorinozoku-a/"),
    "LEX_UX_AA10": ("M12", 1.5, "https://search.weds.co.jp/brand/kranze/versam030evo/lexus/ux-10keiux300e-a/"),
}


def load(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    payload = load(FITMENT)
    change_log = load(CHANGE_LOG)
    by_id = {row["vehicle_id"]: row for row in payload["vehicles"]}
    missing_ids = sorted(set(UPDATES) - set(by_id))
    if missing_ids:
        raise SystemExit(f"vehicle_id not found: {', '.join(missing_ids)}")

    applied = []
    for vehicle_id, update in UPDATES.items():
        row = by_id[vehicle_id]
        old = {key: row.get(key) for key in ("pcd", "holes", "hub_bore", "fastener", "fastener_details")}
        for key in ("pcd", "holes", "hub_bore", "fastener", "fastener_details"):
            row[key] = update[key]
        row["confidence"] = "B"
        note = "PCD・穴数・ハブ径・ねじ規格を型式一致のホイールメーカー適合資料で確認。"
        previous_note = str(row.get("notes") or "").strip()
        if "ホイール取付条件" in previous_note:
            previous_note = previous_note.replace("ホイール取付条件は未確認のためタイヤ検索専用。", "").replace("ホイール取付条件未確認。タイヤ検索専用。", "").strip()
        row["notes"] = f"{previous_note} {note}".strip()
        if not any(source.get("source_name") == update["source"]["source_name"] for source in row.setdefault("sources", [])):
            row["sources"].append(dict(update["source"]))

        new = {key: row.get(key) for key in ("pcd", "holes", "hub_bore", "fastener", "fastener_details")}
        change_key = (vehicle_id, "fitment_core_fields", VERIFIED_AT)
        exists = any((item.get("vehicle_id"), item.get("field"), item.get("verified_at")) == change_key for item in change_log.get("records", []))
        if not exists:
            change_log.setdefault("records", []).append({
                "vehicle_id": vehicle_id,
                "field": "fitment_core_fields",
                "old": old,
                "new": new,
                "reason": "model_code_matched_in_previous_vendor_files_and_official_matching_data",
                "confidence": "B",
                "sources": [dict(update["source"])],
                "verified_at": VERIFIED_AT,
                "applied_at": datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds"),
                "actor": "codex_manual_completion",
            })
        applied.append(vehicle_id)

    for vehicle_id, (diameter, pitch, url) in LEXUS_THREAD_UPDATES.items():
        row = by_id[vehicle_id]
        details = row["fastener_details"]
        old = {
            "fastener": row.get("fastener"),
            "thread_diameter": details.get("thread_diameter"),
            "thread_pitch": details.get("thread_pitch"),
        }
        details["thread_diameter"] = diameter
        details["thread_pitch"] = pitch
        method_label = "ボルト締結" if details.get("method") == "bolt" else "ナット締結"
        seat_label = "球面座" if details.get("seat") == "spherical" else "座面要確認"
        row["fastener"] = f"{method_label}（{diameter}×P{pitch}、{seat_label}）"
        source = {
            "source_type": "wheel_manufacturer_official",
            "source_name": f"Weds ホイール装着マッチング {row['model']} {row['generation']}",
            "source_url": url,
            "verified_at": VERIFIED_AT,
        }
        if not any(item.get("source_url") == url for item in row.setdefault("sources", [])):
            row["sources"].append(source)
        note = "ねじ径・ピッチを型式一致のWeds公式適合情報で確認。"
        if note not in str(row.get("notes") or ""):
            row["notes"] = f"{str(row.get('notes') or '').strip()} {note}".strip()
        new = {
            "fastener": row.get("fastener"),
            "thread_diameter": details.get("thread_diameter"),
            "thread_pitch": details.get("thread_pitch"),
        }
        change_key = (vehicle_id, "thread_spec", VERIFIED_AT)
        exists = any((item.get("vehicle_id"), item.get("field"), item.get("verified_at")) == change_key for item in change_log.get("records", []))
        if not exists:
            change_log.setdefault("records", []).append({
                "vehicle_id": vehicle_id,
                "field": "thread_spec",
                "old": old,
                "new": new,
                "reason": "model_code_matched_in_wheel_manufacturer_official_fitment",
                "confidence": "B",
                "sources": [source],
                "verified_at": VERIFIED_AT,
                "applied_at": datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds"),
                "actor": "codex_manual_completion",
            })
        applied.append(vehicle_id)

    save(FITMENT, payload)
    save(CHANGE_LOG, change_log)
    print(json.dumps({"applied_count": len(applied), "vehicle_ids": applied}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
