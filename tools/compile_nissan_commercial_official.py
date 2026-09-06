#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
updates = [{
    "vehicle_id": "WEB_NIS_CEDRIC_SEDAN_Y31",
    "maker": "日産",
    "model": "セドリックセダン",
    "generation": "Y31",
    "model_codes": ["Y31"],
    "year_from": "2010-09",
    "year_to": "2014-11",
    "pcd": 114.3,
    "holes": 5,
    "hub_bore": 73,
    "fastener": "M12×P1.25",
    "fastener_details": {"method": "nut", "thread_diameter": "M12", "thread_pitch": 1.25},
    "oem_inch": "15",
    "oem_tire": "195/65R15",
    "confidence": "A",
    "notes": "年式・純正タイヤ・PCD・穴数・ハブ径は日産公式FAQのY31営業車欄、ねじ規格はKSP公式適合表のY31行で照合。",
    "sources": [{
        "source_type": "vehicle_manufacturer_official",
        "source_name": "日産FAQ セドリック営業車 Y31 タイヤ・ホイール仕様",
        "source_url": "https://faq2.nissan.co.jp/faq/show/11871?site_domain=default",
        "verified_at": "2026-09-06"
    }, {
        "source_type": "parts_manufacturer_official",
        "source_name": "KSP 080319適合表 セドリック Y31",
        "source_url": "https://www.ksp-eng.co.jp/web/080319.pdf",
        "verified_at": "2026-09-06"
    }]
}]
output = ROOT / "app/data/vehicle-updates/nissan-commercial-official-2026-09-06.json"
output.write_text(json.dumps({"schema_version": "1.0.0", "updates": updates}, ensure_ascii=False, indent=2) + "\n")
print(output)
