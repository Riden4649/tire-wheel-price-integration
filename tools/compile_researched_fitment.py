#!/usr/bin/env python3
"""Compile complete, corroborated rows; emit a patch, never mutate live data."""
import json
import re
import unicodedata
import hashlib
from collections import Counter
from pathlib import Path
from research_all_fitment import ROOT, norm

# Reviewed spelling/combined-heading mappings, never OEM-equivalence assumptions.
ALIASES = {
 'CT':['CT200h'], 'Honda e':['ホンダe'], 'N-BOX SLASH':['N-BOXスラッシュ'],
 'アヴァンシア':['アバンシア'], 'ウイングロード':['ウィングロード'],
 'プリウスα':['プリウスアルファ'], 'マークIIブリット':['マークⅡブリッド'],
 'ムーヴ':['ムーブ'], 'ムーヴキャンバス':['ムーブキャンバス'], 'ムーヴコンテ':['ムーブコンテ'],
 'ムーヴラテ':['ムーブラテ'], 'クロスビー':['X bee'], 'エブリイ':['エブリ－'],
 'エブリイワゴン':['エブリ－ワゴン'], 'アルトラパン':['ラパン'],
 'ジャパンタクシー':['JPN TAXI'], 'N-BOX':['N-BOX/カスタム'], 'N-WGN':['N-WGN/カスタム'],
 'ヴェゼル':['ヴェゼル/ハイブリッド'], 'シャトル':['シャトル/シャトルHV'],
 'フレアワゴン':['フレアワゴン/カスタム'], 'シフォン':['シフォン/カスタム'],
 'ステラ':['ステラ/カスタム'], 'スペーシア':['スペーシア/カスタム'],
 'ソリオ':['ソリオ/バンディット'], 'ワゴンR':['ワゴンR/スティングレー'],
 'タントエグゼ':['タントエグゼ/カスタム'], 'ルクラ':['ルクラ/カスタム'],
 'レガシィツーリングワゴン':['レガシーツーリングワゴン'],
 'プリメーラ':['プリメーラ/プリメーラワゴン','プリメーラ/プレメーラワゴン'],
 'プリメーラワゴン':['プリメーラ/プリメーラワゴン','プリメーラ/プレメーラワゴン'],
 'カローラツーリング':['カローラ/カローラツーリング'],
 'ランサーエボリューション':['ランサーEVO X','ランサーEVO Ⅸ','ランサーEVO Ⅷ','ランサーEVO Ⅶ','ランサーEVO Ⅵ','ランサーEVO Ⅴ'],
}

def date_range(value):
    s=unicodedata.normalize('NFKC',value)
    if any(x in s for x in ['予定','MC','MC','以降','以前']): return None
    m=re.fullmatch(r'\s*(\d{2}|20\d{2})/(\d{1,2})\s*[~〜～]\s*(?:(\d{2}|20\d{2})/(\d{1,2}))?\s*',s)
    if not m: return None
    def y(x):
        n=int(x); return n if n>=100 else (1900+n if n>=70 else 2000+n)
    if not 1<=int(m[2])<=12 or (m[4] and not 1<=int(m[4])<=12): return None
    start=f'{y(m[1]):04}-{int(m[2]):02}';end=f'{y(m[3]):04}-{int(m[4]):02}' if m[3] else '2025-12'
    if end<'2000-01' or start>end: return None
    return max(start,'2000-01'),end

def parse(row):
    s=lambda k:unicodedata.normalize('NFKC',str(row[k])).strip()
    dates=date_range(row['period'])
    tire=re.fullmatch(r'(\d{3}/\d{2}R\d{2})(?:\s+[\d/]+(?:[A-Z]+)?)?',s('tire'))
    p=re.fullmatch(r'([4568])[-‐−](\d+(?:\.\d+)?)',s('pcd'))
    f=re.fullmatch(r'(12|14)[xX×](1\.(?:25|5))[-‐]\d+(?:\.\d+)?',s('fastener'))
    code=s('code')
    if not dates or not tire or not p or not f or not re.fullmatch(r'[A-Z0-9\s・.,/系]+',code) or not re.search(r'[A-Z]{2,}|\d+系',code): return None
    try: hub=float(row['hub'])
    except (ValueError,TypeError): return None
    pcd=float(p[2]);pcd={114:114.3,139:139.7}.get(pcd,pcd)
    if not 50<=hub<=120 or not 90<=pcd<=180: return None
    return dict(year_from=dates[0],year_to=dates[1],pcd=pcd,holes=int(p[1]),hub_bore=hub,
                diameter=int(f[1]),pitch=float(f[2]),tire=tire[1],code=code)

def main():
    raw=json.loads(Path('/tmp/tire-all-fitment-research.json').read_text())
    master=json.loads((ROOT/'app/data/jp_vehicle_search_master_2000_2026_v1.json').read_text())['vehicles']
    existing=json.loads((ROOT/'app/data/vehicles_2012_2026.json').read_text())['vehicles']
    linked=set(json.loads(Path('/tmp/tire-linked-search-ids.json').read_text()))
    pdf=json.loads(Path('/tmp/tire-weds-pdf-rows.json').read_text())
    records=[];audit=[]
    for model in master:
        names={norm(model['model']),*(norm(a) for a in model.get('aliases',[])),*(norm(a) for a in ALIASES.get(model['model'],[]))}
        tr=[r for r in raw['topy'] if r['maker']==model['maker'] and norm(r['model']) in names]
        wd=[r for r in raw['weds'] if r['maker']==model['maker'] and ({norm(r['model']),*(norm(a) for a in r['model'].split('/'))} & names)]
        # PDF supplies OEM sizes and dates. Public page supplies fastener.
        # Never read the inch-down/right-hand columns as OEM sizes.
        for pr in pdf:
            if pr['maker']!=model['maker'] or not ({norm(pr['model']),*(norm(a) for a in str(pr['model']).split('/'))} & names): continue
            gp=unicodedata.normalize('NFKC',str(pr['generation_period'] or ''))
            date=re.search(r'\d{4}/\d{2}\s*[~〜～]\s*(?:\d{4}/\d{2})?',gp)
            if not date:continue
            generation=gp[:date.start()].strip()
            def num(v):
                try:return float(re.sub(r'\s','',str(v)))
                except ValueError:return None
            matches=[w for w in wd if w.get('pcd')==num(pr['pcd']) and w.get('holes')==num(pr['holes']) and w.get('hub_bore')==num(pr['hub'])
                     and norm(generation) and norm(generation) in norm(w['generation']) and w.get('method')=='ナット' and w.get('thread_diameter') and w.get('thread_pitch')]
            fasteners={(w['thread_diameter'],w['thread_pitch']) for w in matches}
            if len(fasteners)!=1: continue
            diameter,pitch=next(iter(fasteners))
            tire=unicodedata.normalize('NFKC',pr['tire']).replace('-','R')
            # Detailed grade/code text is retained in provenance; use the
            # explicitly identified generation for this model.
            tr.append(dict(maker=model['maker'],model=model['model'],period=date[0],code=generation,
                tire=tire,wheel=pr['wheel'],pcd=f"{int(num(pr['holes']))}-{num(pr['pcd']):g}",hub=num(pr['hub']),
                fastener=f'{diameter}x{pitch:g}-21',sheet='PDF',row=pr['row'],block=f"PDF{pr['page']}-{generation}-{date[0]}",
                pdf_page=pr['page'],pdf_code=pr['code'],pdf_remarks=pr['remarks'],evidence=matches[0]))
        groups={}; rejects=Counter()
        for row in tr:
            p=parse(row)
            if not p: rejects['形式・年式・前後別など個別確認']+=1;continue
            # Only corroborate a model if ALL Weds generations have the same
            # tuple, or an exact alphanumeric chassis code identifies a page.
            candidates=[w for w in wd if all(w.get(k)==p[k] for k in ['pcd','holes','hub_bore']) and w.get('thread_diameter')==p['diameter'] and w.get('thread_pitch')==p['pitch'] and w.get('method')=='ナット']
            tuples={tuple(w.get(k) for k in ['pcd','holes','hub_bore','thread_diameter','thread_pitch','method']) for w in wd}
            exact=[w for w in candidates if any(len(c)>=3 and c.lower() in w['generation'].lower() for c in re.split(r'[\s・.,/]+',p['code']))]
            evidence=([row['evidence']] if 'evidence' in row else []) or exact or (candidates if len(tuples)==1 else [])
            if not evidence: rejects['Weds同型式の裏付け不足']+=1;continue
            key=(row['block'],p['code'],p['year_from'],p['year_to'],p['pcd'],p['holes'],p['hub_bore'],p['diameter'],p['pitch'])
            g=groups.setdefault(key,dict(parsed=p,rows=[],tires=set(),source=evidence[0],original=row))
            g['rows'].append(row['row']);g['tires'].add(p['tire'])
        # Don't expand an already registered model with overlapping generations
        # in this pass. Every model is still included in the audit.
        added=[]
        if model['search_id'] not in linked:
            for key,g in groups.items():
                p=g['parsed']; tires=sorted(g['tires']); inches=sorted({t.split('R')[1] for t in tires},key=int)
                vid='TOPY_'+hashlib.sha256((model['search_id']+str(key)).encode()).hexdigest()[:12].upper()
                code=p['code'].replace('\n',' / ')
                record=dict(vehicle_id=vid,maker=model['maker'],model=model['model'],generation=code,
                    model_codes=re.split(r'[\s\n/]+',p['code']),year_from=p['year_from'],year_to=p['year_to'],
                    pcd=p['pcd'],holes=p['holes'],hub_bore=p['hub_bore'],fastener=f"M{p['diameter']}×P{p['pitch']:g}",
                    fastener_details=dict(method='nut',thread_diameter=f"M{p['diameter']}",thread_pitch=p['pitch']),
                    oem_inch='/'.join(inches),oem_tire=';'.join(tires),confidence='B',
                    notes='純正タイヤ・年式・型式は提供マッチング資料。基本取付規格はWedsと照合。年式は資料の収録範囲。グレード・荷重・ブレーキ条件は実車で確認。',
                    sources=[dict(source_type='wheel_manufacturer_official',source_name='Weds '+g['source']['model']+' '+g['source']['generation'],source_url=g['source']['source_url'],verified_at='2026-09-05')],
                    source_document=dict(file='【ウェッズ】2025_MATCHING_BOOK_0826.pdf' if g['original']['sheet']=='PDF' else raw['workbook'],
                        sheet=g['original']['sheet'],rows=g['rows'],period=g['original']['period']))
                if g['original']['sheet']=='PDF': record['source_document']['page']=g['original']['pdf_page']
                else: record['source_document']['sha256']=raw['workbook_sha256']
                records.append(record);added.append(vid)
        audit.append(dict(search_id=model['search_id'],maker=model['maker'],model=model['model'],
            status='existing' if model['search_id'] in linked else 'candidate_unapproved' if added else 'needs_review',
            added_ids=added,topy_row_count=len(tr),weds_urls=[w.get('source_url',w['url']) for w in wd],reasons=dict(rejects)))
    Path('/tmp/tire-researched-patch.json').write_text(json.dumps(dict(schema_version='1.0.0',updates=records),ensure_ascii=False,indent=2)+'\n')
    Path('/tmp/tire-fitment-all-model-audit.json').write_text(json.dumps(dict(searched_models=len(audit),models=audit),ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(added_generations=len(records),model_statuses=Counter(a['status'] for a in audit)),ensure_ascii=False))
    print('REVIEW:', ' / '.join(a['maker']+' '+a['model'] for a in audit if a['status']=='needs_review'))

if __name__=='__main__': main()
