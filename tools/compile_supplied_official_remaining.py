#!/usr/bin/env python3
"""Compile exact rows joined across the user-designated official matching files."""
import hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/tmp/matching-files.kaWx49/マッチング')
FILES = {
    'bs': SRC / 'wheel_parts_catalog_Winter_2025-sankourei .xlsx',
    'mid': SRC / '【マルカ】MIDインチダウン表_24-25 .xlsx',
    'topy': SRC / '【TOPY】2025年☆国産車用マッチングデータ.xlsx',
}

def source(key, sheet, row):
    path = FILES[key]
    return {
        'source_type': 'user_designated_official_matching_document',
        'source_name': f'{path.name} {sheet} 行{row}',
        'source_url': 'https://tire-wheel-price-navi.hide718283.chatgpt.site/data/vehicle-updates/supplied-official-remaining-2026-09-06.json',
        'verified_at': '2026-09-06',
        'document_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'document_sheet': sheet,
        'document_row': row,
    }

def record(vid, maker, model, code, start, tire, pcd, holes, hub, diameter, pitch, sources, notes='', end='2026-12'):
    inch = tire.split('R', 1)[1][:2]
    return {
        'vehicle_id': vid, 'maker': maker, 'model': model, 'generation': code,
        'model_codes': [code], 'year_from': start, 'year_to': end,
        'pcd': pcd, 'holes': holes, 'hub_bore': hub,
        'fastener': f'M{diameter}×P{pitch:g}',
        'fastener_details': {'method': 'nut', 'thread_diameter': f'M{diameter}', 'thread_pitch': pitch},
        'oem_inch': inch, 'oem_tire': tire, 'confidence': 'B',
        'notes': 'ユーザー指定の公式扱い資料にある同一車名・同一型式の行を照合。' + notes,
        'sources': sources,
    }

updates = [
    record('DOC_CROWN_CROSS_AZSH35', 'トヨタ', 'クラウンクロスオーバー', 'AZSH35', '2022-09',
           '225/45R21', 114.3, 5, 60, 14, 1.5, [source('bs', '装着参考例', 94)]),
    record('DOC_HARRIER_PHEV_AXUP85', 'トヨタ', 'ハリアーPHEV', 'AXUP85', '2022-09',
           '225/55R19', 114.3, 5, 60, 12, 1.5,
           [source('mid', 'トヨタ', 249), source('topy', 'TOYOTA－', 568)],
           'PHEV固有型式・純正サイズはMID、ハブ径・ねじ規格は同型ハリアー80系のTOPY記載を採用。'),
    record('DOC_ECLIPSE_PHEV_GL3W', '三菱', 'エクリプスクロスPHEV', 'GL3W', '2020-12',
           '225/55R18', 114.3, 5, 67, 12, 1.5, [source('bs', '装着参考例', 271), source('mid', 'ミツビシ', 45)]),
    record('DOC_MINICAB_VAN_DS17V', '三菱', 'ミニキャブバン', 'DS17V', '2015-03',
           '145R12', 100, 4, 54, 12, 1.25, [source('mid', 'ミツビシ', 99), source('topy', 'MITSUBISHI－', 182)]),
    record('DOC_MINICAB_DS17V', '三菱', 'ミニキャブ', 'DS17V', '2015-03',
           '145R12', 100, 4, 54, 12, 1.25, [source('mid', 'ミツビシ', 99), source('topy', 'MITSUBISHI－', 182)]),
    record('DOC_MINICAB_U61VT', '三菱', 'ミニキャブ', 'U61V/U61T', '1999-02',
           '145R12', 100, 4, 56, 12, 1.5, [source('mid', 'ミツビシ', 102), source('topy', 'MITSUBISHI－', 186)], end='2014-02'),
    record('WEB_EK_CUSTOM_B11W', '三菱', 'eKカスタム', 'B11W', '2013-06',
           '155/65R14', 100, 4, 56, 12, 1.5, [{
               'source_type': 'wheel_manufacturer_official', 'source_name': 'Weds eKカスタム B11W 適合ページ',
               'source_url': 'https://search.weds.co.jp/maker/mitsubishi/ekkasutamu-b11w/leonis-sk/?size=16inch',
               'verified_at': '2026-09-06'}, {
               'source_type': 'vehicle_manufacturer_official', 'source_name': '三菱 eKカスタム B11W 適応車種一覧',
               'source_url': 'https://www.mitsubishi-motors.co.jp/purchase/accessory/assist/',
               'verified_at': '2026-09-06'}], end='2019-02'),
    record('WEB_EK_SPACE_CUSTOM_B11A', '三菱', 'eKスペースカスタム', 'B11A', '2014-02',
           '155/65R14', 100, 4, 56, 12, 1.5, [source('topy', 'MITSUBISHI－', 40), {
               'source_type': 'vehicle_manufacturer_official', 'source_name': '三菱 eKスペースカスタム B11A 主要諸元',
               'source_url': 'https://www.mitsubishi-motors.co.jp/lineup/ek_space_custom/spec/pdf/ek_space_custom_spec.pdf',
               'verified_at': '2026-09-06'}], end='2020-01'),
    record('WEB_HON_PRELUDE_BF1', 'ホンダ', 'プレリュード', 'BF1', '2025-09',
           '235/40R19', 120, 5, 64, 14, 1.5, [{
               'source_type': 'vehicle_manufacturer_official', 'source_name': 'Honda PRELUDE タイヤ・ホイール仕様',
               'source_url': 'https://www.honda.co.jp/customer/auto/prelude/faq/qa015/',
               'verified_at': '2026-09-06'}, {
               'source_type': 'wheel_manufacturer_official', 'source_name': 'Weds プレリュード BF1 適合ページ',
               'source_url': 'https://search.weds.co.jp/brand/leonis/vr/honda/pureryuudo-bf1-d/',
               'verified_at': '2026-09-06'}]),
    record('WEB_TOY_RAV4_PHV_AXAP54', 'トヨタ', 'RAV4 PHV', 'AXAP54', '2020-06',
           '235/55R19', 114.3, 5, 60, 12, 1.5, [{
               'source_type': 'vehicle_manufacturer_official', 'source_name': 'トヨタ RAV4 PHV 主要諸元表',
               'source_url': 'https://toyota.jp/pages/contents/rav4phv/001_p_001/4.0/pdf/spec/rav4phv_spec_202204.pdf',
               'verified_at': '2026-09-06'}, {
               'source_type': 'wheel_manufacturer_official', 'source_name': 'Weds RAV4 50系/PHV 適合ページ',
               'source_url': 'https://www.search.weds.co.jp/maker/toyota/rav4-50keiphv/wedssport-all/',
               'verified_at': '2026-09-06'}], end='2025-11'),
]

out = ROOT / 'app/data/vehicle-updates/supplied-official-remaining-2026-09-06.json'
out.write_text(json.dumps({'schema_version': '1.0.0', 'updates': updates}, ensure_ascii=False, indent=2) + '\n')
incremental = ROOT / 'app/data/vehicle-updates/web-official-remaining-2026-09-06.json'
incremental.write_text(json.dumps({'schema_version': '1.0.0', 'updates': updates[-4:-1]}, ensure_ascii=False, indent=2) + '\n')
latest = ROOT / 'app/data/vehicle-updates/web-official-rav4-phv-2026-09-06.json'
latest.write_text(json.dumps({'schema_version': '1.0.0', 'updates': updates[-1:]}, ensure_ascii=False, indent=2) + '\n')
print(out)
