#!/usr/bin/env python3
"""Extract literal complete, closed-period rows from the user-supplied workbook.

Retain source file hash, cell locations and notes; do not infer OEM equivalents,
open-ended model years, missing hub bores, or missing fastener specifications.
"""
import json, re, hashlib, argparse, unicodedata
from pathlib import Path
from collections import Counter
from openpyxl import load_workbook
from compile_researched_fitment import parse, ALIASES, date_range
from research_all_fitment import ROOT, MAKERS, norm, workbook_rows

# The supplied tables use family headings for these separately searchable labels.
# This is an explicit heading map only; it does not infer unrelated OEM siblings.
FAMILY_SOURCES = {
 'アベンシスセダン':['アベンシス'],
 'アルファードV':['アルファード'],
 'エスティマL':['エスティマ'], 'エスティマT':['エスティマ'], 'カローラワゴン':['カローラ'],
 'グランドハイエース':['グランドハイエース（レジアス）'], 'クルーガーL':['クルーガー'], 'クルーガーV':['クルーガー'],
 'クレスタ':['マークⅡ（クレスタ・チェイサー）'], 'チェイサー':['マークⅡ（クレスタ・チェイサー）'], 'マークII':['マークⅡ（クレスタ・チェイサー）'],
 'タウンエースバン':['タウンエース'], 'タウンエースノア':['タウンエースノア（ライトエースノア）'],
 'ライトエースノア':['タウンエースノア（ライトエースノア）'], 'ライトエースバン':['ライトエース'],
 'ハイエースバン':['ハイエース'], 'レジアスエース':['ハイエース'], 'レジアスエースバン':['ハイエース'],
 'ビスタアルデオ':['ビスタ'], 'UX EV':['UX'],
 'AD':['ADバン/エキスパート'], 'ADエキスパート':['ADバン/エキスパート'], 'ADバン':['ADバン/エキスパート'],
 'NV150 AD':['ADバン/エキスパート'], 'NV200バネットバン':['NV200バネット'], 'アベニールカーゴ':['アベニール'],
 'エキスパート':['ADバン/エキスパート'], 'キックス e-POWER':['キックス'],
 'キャラバンコーチ':['キャラバン'], 'キャラバンバン':['キャラバン'], 'クリッパートラック':['クリッパー'], 'クリッパーバン':['クリッパー'],
 'エリシオン プレステージ':['エリシオン'], 'ゼストスパーク':['ゼスト'], 'フィットシャトル':['フィットシャトル/ハイブリッド'],
 'アテンザ':['アテンザ セダン','アテンザ ワゴン'], 'スクラム':['スクラムバン'], 'ボンゴトラック':['ボンゴ'], 'ボンゴバン':['ボンゴ'],
 'アルトターボRS':['アルト'], 'アルトラパンLC':['ラパン'], 'アルトラパンショコラ':['ラパン'], 'ワゴンR RR':['ワゴンR/スティングレー'],
 'グランマックスカーゴ':['グランマックス'], 'グランマックストラック':['グランマックス'],
 'ミニキャブ':['ミニキャブ'], 'ミニキャブバン':['ミニキャブ'],
}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('workbook');ap.add_argument('--linked',required=True);ap.add_argument('--complete-rows',action='store_true');ap.add_argument('--user-official',action='store_true');args=ap.parse_args()
    path=Path(args.workbook);sha=hashlib.sha256(path.read_bytes()).hexdigest()
    wb=load_workbook(path,data_only=True,read_only=True)
    rows=workbook_rows(path)
    # Retain all source-column values, including fitment restrictions in N.
    originals={(s.title,i):list(row) for s in wb for i,row in enumerate(s.iter_rows(values_only=True),1)}
    master=json.loads((ROOT/'app/data/jp_vehicle_search_master_2000_2026_v1.json').read_text())['vehicles']
    linked=set(json.loads(Path(args.linked).read_text()))
    suffix='official' if args.user_official else ('complete' if args.complete_rows else 'strict')
    excerpt_name=f'topy-source-excerpts-{suffix}-2026-09-06.json'
    out=[];evidence=[];reasons=Counter()
    for model in master:
        if model['search_id'] in linked:continue
        names={norm(model['model']),*(norm(x) for x in model.get('aliases',[])),*(norm(x) for x in ALIASES.get(model['model'],[])),*(norm(x) for x in FAMILY_SOURCES.get(model['model'],[]))}
        for row in rows:
            if row['maker']!=model['maker'] or norm(row['model']) not in names:continue
            p=parse(row)
            if not p and args.user_official:
                tire_raw=unicodedata.normalize('NFKC',str(row['tire'])).upper().replace('RF','R')
                tire_raw=re.sub(r'^[FR][：:]','',tire_raw).strip().replace('/80-','/80R')
                tire_match=re.search(r'(\d{3}/\d{2}R\d{2}|\d{3}R\d{2}(?:-\d+(?:PR?)?)?)',tire_raw)
                pcd_match=re.fullmatch(r'([4568])[-‐−](\d+(?:\.\d+)?)',unicodedata.normalize('NFKC',str(row['pcd'])).strip())
                fast_match=re.search(r'(12|14)\s*[X×]\s*(1\.25|1\.5)',unicodedata.normalize('NFKC',str(row['fastener'])),re.I)
                dates=date_range(str(row['period']))
                if not dates:
                    dm=re.fullmatch(r'\s*(\d{1,4})/(\d{1,2})\s*[~〜～]\s*(?:(\d{1,4})/(\d{1,2}))?\s*',str(row['period']))
                    if dm:
                        def dy(v):
                            y=int(v);return y if y>=100 else (1900+y if y>=70 else 2000+y)
                        dates=(f'{dy(dm[1]):04d}-{int(dm[2]):02d}',f'{dy(dm[3]):04d}-{int(dm[4]):02d}' if dm[3] else '2025-12')
                if not dates:
                    announced=re.search(r'(20\d{2})/(\d{1,2})\s*発売予定',str(row['period']))
                    if announced: dates=(f'{announced[1]}-{int(announced[2]):02d}','2025-12')
                try: hub=float(row['hub'])
                except (ValueError,TypeError): hub=None
                if tire_match and pcd_match and fast_match and dates and hub is not None and str(row['code']).strip():
                    pcd=float(pcd_match[2]);pcd={114:114.3,139:139.7}.get(pcd,pcd)
                    p=dict(year_from=dates[0],year_to=dates[1],pcd=pcd,holes=int(pcd_match[1]),hub_bore=hub,
                           diameter=int(fast_match[1]),pitch=float(fast_match[2]),tire=tire_match[1],code=unicodedata.normalize('NFKC',str(row['code'])).strip())
            if not p:reasons['incomplete_or_complex_format']+=1;continue
            if not args.complete_rows and not args.user_official and not re.search(r'[~〜～]\s*\d{2,4}/\d{1,2}\s*$',row['period']):reasons['open_period']+=1;continue
            if not args.user_official and not re.fullmatch(r'\d{3}/\d{2}R\d{2}',row['tire'].strip()):reasons['load_or_other_tire_notation']+=1;continue
            code=unicodedata.normalize('NFKC',row['code']).strip()
            if not args.complete_rows and not args.user_official and not re.fullmatch(r'[A-Z]{1,5}\d{1,4}[A-Z]{0,2}',code):reasons['abbreviated_code']+=1;continue
            original=originals[(row['sheet'],row['row'])]
            note=str(original[13] or '')
            # Rows with unresolved exclusions or special-wheel conditions stay pending.
            restriction=' / '.join(x for x in [note.strip(),str(original[10] or '').strip()] if x and x!='-')
            if not args.complete_rows and not args.user_official and restriction:reasons['restriction_requires_review']+=1;continue
            key=f"{sha}:{row['sheet']}:{row['row']}:{model['search_id']}"
            vid='DOC_'+hashlib.sha256(key.encode()).hexdigest()[:12].upper()
            entry=dict(id=vid,source_file=path.name,sha256=sha,sheet=row['sheet'],row=row['row'],
                       raw_columns=original,interpreted_period=row['period'],interpreted_model_code=row['code'],
                       source_kind='user_supplied_manufacturer_matching_workbook',checked_at='2026-09-06')
            evidence.append(entry)
            out.append(dict(vehicle_id=vid,maker=model['maker'],model=model['model'],generation=code,model_codes=[code],
                year_from=p['year_from'],year_to=p['year_to'],pcd=p['pcd'],holes=p['holes'],hub_bore=p['hub_bore'],
                fastener=f"M{p['diameter']}×P{p['pitch']:g}",fastener_details=dict(method='nut',thread_diameter=f"M{p['diameter']}",thread_pitch=p['pitch']),
                oem_inch=re.search(r'R(\d{2})',p['tire'])[1],oem_tire=p['tire'],confidence='C',
                notes=('ユーザー提供TOPY 2025–2026資料の純正データ欄を転記。Web同型式の二重照合は未実施。'
                       +('終了月なしの年式は資料収録期限2025-12までを検索範囲として登録。' if not re.search(r'[~〜～]\s*\d{2,4}/\d{1,2}\s*$',row['period']) else '')
                       +('原文注意: '+restriction+'。' if restriction else '')
                       +'記載サイズは当該型式の一例で、全グレードの交換互換性を保証しません。装着前に現車・荷重・キャリパーを確認。'),
                sources=[dict(source_type='user_provided_matching_document',source_name=path.name+' '+row['sheet']+f" 行{row['row']}",
                    source_url='https://tire-wheel-price-navi.hide718283.chatgpt.site/data/vehicle-updates/'+excerpt_name+'#'+vid,
                    verified_at='2026-09-06',document_sha256=sha,document_sheet=row['sheet'],document_row=row['row'])],
                source_document=entry))
    # A row is a specific OEM size; consolidate only identical code/spec/date rows.
    groups={}
    for record in out:
        key=tuple(record[x] for x in ['maker','model','generation','year_from','year_to','pcd','holes','hub_bore','fastener'])
        if key not in groups:groups[key]=record;continue
        g=groups[key];g['oem_tire']=';'.join(sorted(set(g['oem_tire'].split(';')+[record['oem_tire']])))
        g['oem_inch']='/'.join(sorted(set(g['oem_inch'].split('/')+[record['oem_inch']]),key=int));g['sources']+=record['sources']
    destination=ROOT/f'app/data/vehicle-updates/supplied-topy-{suffix}-2026-09-06.json'
    destination.write_text(json.dumps(dict(schema_version='1.0.0',updates=list(groups.values())),ensure_ascii=False,indent=2)+'\n')
    (ROOT/f'app/data/vehicle-updates/topy-source-excerpts-{suffix}-2026-09-06.json').write_text(json.dumps(dict(source_file=path.name,sha256=sha,rows=evidence),ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(records=len(groups),models=len({(r['maker'],r['model']) for r in groups.values()}),source_rows=len(evidence),held=reasons),ensure_ascii=False))
    print(' / '.join(sorted({r['model'] for r in groups.values()})))
if __name__=='__main__':main()
