#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(source_type, name, url):
    return {
        "source_type": source_type,
        "source_name": name,
        "source_url": url,
        "verified_at": "2026-09-06",
    }


updates = [
    {
        "vehicle_id": "WEB_NIS_PAO_PK10",
        "maker": "日産",
        "model": "パオ",
        "generation": "PK10",
        "model_codes": ["PK10"],
        "year_from": "1989-01",
        "year_to": "1991-02",
        "pcd": 100,
        "holes": 4,
        "hub_bore": 59,
        "fastener": "M12×P1.25",
        "fastener_details": {"method": "nut", "thread_diameter": "M12", "thread_pitch": 1.25},
        "oem_inch": "12",
        "oem_tire": "155SR12",
        "confidence": "A",
        "notes": "車名・型式・純正タイヤは日産公式ヘリテージコレクション、取付基本規格はKSP公式適合表のPK10行で照合。",
        "sources": [
            source("vehicle_manufacturer_official", "NISSAN HERITAGE COLLECTION PAO PK10", "https://www.nissan.co.jp/HERITAGE/DETAIL/128.html"),
            source("parts_manufacturer_official", "KSP 080319適合表 パオ PK10", "https://www.ksp-eng.co.jp/web/080319.pdf"),
        ],
    },
    {
        "vehicle_id": "WEB_NIS_BLUEBIRD_HU14",
        "maker": "日産",
        "model": "ブルーバード",
        "generation": "HU14",
        "model_codes": ["HU14"],
        "year_from": "1996-01",
        "year_to": "2001-08",
        "pcd": 114.3,
        "holes": 4,
        "hub_bore": 66,
        "fastener": "M12×P1.25",
        "fastener_details": {"method": "nut", "thread_diameter": "M12", "thread_pitch": 1.25},
        "oem_inch": "15",
        "oem_tire": "195/60R15",
        "confidence": "A",
        "notes": "車名・型式・純正タイヤは日産公式ヘリテージコレクション、取付基本規格はKSP公式適合表のU14行で照合。",
        "sources": [
            source("vehicle_manufacturer_official", "NISSAN HERITAGE COLLECTION ブルーバード HU14", "https://www.nissan.co.jp/HERITAGE/DETAIL/283.html"),
            source("parts_manufacturer_official", "KSP 080319適合表 ブルーバード U14", "https://www.ksp-eng.co.jp/web/080319.pdf"),
        ],
    },
]

output = ROOT / "app/data/vehicle-updates/nissan-legacy-official-2026-09-06.json"
output.write_text(json.dumps({"schema_version": "1.0.0", "updates": updates}, ensure_ascii=False, indent=2) + "\n")
print(output)
