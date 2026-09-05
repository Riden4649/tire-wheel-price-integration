#!/usr/bin/env python3
"""Add conservative, same-chassis, cross-source fitments; preserve existing rows."""
import json, re, hashlib, unicodedata
from pathlib import Path
from collections import Counter
from research_all_fitment import ROOT, fetch, plain, norm
from compile_researched_fitment import ALIASES, parse, date_range

URL='https://ksp-eng.co.jp/ksp/real/domestic.html'
TABLES={'1':'レクサス','2':'トヨタ','3':'日産','4':'ホンダ','5':'マツダ','6':'三菱','7':'SUBARU','8':'スズキ','29':'ダイハツ'}
def ksp_rows():
    result=[]
    for tid,body in re.findall(r'<table id="tablepress-(\d+)"[^>]*>(.*?)</table>',fetch(URL),re.S):
        if tid not in TABLES:continue
        model=''
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>',body,re.S):
            cells={int(n):unicodedata.normalize('NFKC',plain(v)) for n,v in re.findall(r'<td[^>]*class="column-(\d+)"[^>]*>(.*?)</td>',row,re.S)}
            if not cells:continue
            if 1 in cells:model=cells[1]
            if not all(n in cells for n in range(2,8)):continue
            if '未確認' in cells.get(8,'') or 'ボルト車' in cells.get(8,''):continue
            try:
                f=re.fullmatch(r'M(12|14)-(1\.25|1\.5)',cells[7])
                if not f:continue
                result.append(dict(maker=TABLES[tid],model=model,period=cells[2],code=cells[3],
                    pcd=float(cells[4]),holes=int(cells[5].replace('H','')),hub_bore=float(re.sub('[Φφ]','',cells[6])),
                    diameter=int(f[1]),pitch=float(f[2]),remarks=cells.get(8,'')))
            except ValueError:continue
    return result

def codes(value):
    return re.findall(r'[A-Z0-9#]+',unicodedata.normalize('NFKC',value).upper())
def same_code(a,b):
    # Require literal full chassis codes, never infer a whole model family.
    aa=codes(a);bb=codes(b)
    return bool(aa) and all(len(x)>=3 and any(re.fullmatch(re.escape(y).replace(r'\#','[A-Z0-9]'),x) for y in bb) for x in aa)
def closed(period):
    return bool(re.search(r'[~〜～]\s*\d{2,4}/\d{1,2}\s*$',period))

def main():
    raw=json.loads(Path('/tmp/tire-all-fitment-research.json').read_text())
    master=json.loads((ROOT/'app/data/jp_vehicle_search_master_2000_2026_v1.json').read_text())['vehicles']
    dbpath=ROOT/'app/data/vehicles_2012_2026.json';db=json.loads(dbpath.read_text())
    existing_ids={r['vehicle_id'] for r in db['vehicles']}
    linked=set(json.loads(Path('/tmp/tire-linked-search-ids.json').read_text()))
    ksp=ksp_rows(); added=[];rejects=Counter()
    for model in master:
        if model['search_id'] in linked:continue
        names={norm(model['model']),*(norm(x) for x in model.get('aliases',[])),*(norm(x) for x in ALIASES.get(model['model'],[]))}
        groups={}
        for row in raw['topy']:
            if row['maker']!=model['maker'] or norm(row['model']) not in names:continue
            p=parse(row)
            if not p:continue
            # Keep load-rated, staggered, and qualified rows pending detailed review.
            if not re.fullmatch(r'\d{3}/\d{2}R\d{2}',row['tire'].strip()):continue
            ks=[k for k in ksp if k['maker']==model['maker'] and norm(k['model']) in names and same_code(row['code'],k['code'])
                and all(k[x]==p[x] for x in ['pcd','holes','hub_bore','diameter','pitch'])]
            ws=[w for w in raw['weds'] if w['maker']==model['maker'] and norm(w['model']) in names and same_code(row['code'],w['generation'])
                and all(w.get(x)==p[x] for x in ['pcd','holes','hub_bore']) and w.get('thread_diameter')==p['diameter']
                and w.get('thread_pitch')==p['pitch'] and w.get('method')=='ナット']
            if not ks and not ws:rejects['same_chassis_evidence_missing']+=1;continue
            if not closed(row['period']):
                ends=[date_range(k['period']) for k in ks if closed(k['period']) and date_range(k['period'])]
                ends=[d for d in ends if d[0]<=p['year_from']<=d[1]]
                if len(set(ends))!=1:rejects['end_date_unconfirmed']+=1;continue
                p['year_to']=ends[0][1]
            # Exclude explicit date conflicts; no broadening of either source.
            if ks:
                ranges=[date_range(k['period']) for k in ks if date_range(k['period'])]
                ranges=[d for d in ranges if d[0]<=p['year_to'] and d[1]>=p['year_from']]
                if not ranges:rejects['date_conflict']+=1;continue
                p['year_from']=max(p['year_from'],min(d[0] for d in ranges))
                p['year_to']=min(p['year_to'],max(d[1] for d in ranges))
            if p['year_from'] >= p['year_to']:
                rejects['boundary_only_overlap']+=1;continue
            key=(p['code'],p['year_from'],p['year_to'],p['pcd'],p['holes'],p['hub_bore'])
            g=groups.setdefault(key,dict(p=p,rows=[],tires=set(),sources=[],raw=[]))
            g['rows'].append(row['row']);g['tires'].add(p['tire']);g['raw'].append(row)
            if ks:g['sources'].append(dict(source_type='parts_manufacturer_official',source_name='KSP REAL 国産車適合表（基本規格・型式・年式）',source_url=URL,verified_at='2026-09-06'))
            if ws:g['sources'].append(dict(source_type='wheel_manufacturer_official',source_name='Weds '+ws[0]['model']+' '+ws[0]['generation'],source_url=ws[0]['source_url'],verified_at='2026-09-06'))
        for key,g in groups.items():
            p=g['p'];vid='RESEARCH_'+hashlib.sha256((model['search_id']+str(key)).encode()).hexdigest()[:12].upper()
            if vid in existing_ids:continue
            tires=sorted(g['tires']);drive=g['raw'][0]['drive']
            added.append(dict(vehicle_id=vid,maker=model['maker'],model=model['model'],generation=p['code'].replace('\n',' / '),
                model_codes=codes(p['code']),year_from=p['year_from'],year_to=p['year_to'],pcd=p['pcd'],holes=p['holes'],hub_bore=p['hub_bore'],
                fastener=f"M{p['diameter']}×P{p['pitch']:g}",fastener_details=dict(method='nut',thread_diameter=f"M{p['diameter']}",thread_pitch=p['pitch']),
                oem_inch='/'.join(sorted({t.split('R')[1] for t in tires},key=int)),oem_tire=';'.join(tires),confidence='B',
                notes='提供TOPY資料の純正サイズ。取付規格は同型式のメーカー適合表と照合。記載サイズはグレード別候補であり相互交換を保証しません。荷重・キャリパー・純正径は実車確認。',
                sources=list({s['source_url']:s for s in g['sources']}.values()),
                source_document=dict(file=raw['workbook'],sha256=raw['workbook_sha256'],sheet=g['raw'][0]['sheet'],rows=g['rows'],original_rows=g['raw'])))
    out=ROOT/'app/data/vehicle-updates/researched-2026-09-06.json'
    out.write_text(json.dumps(dict(schema_version='1.0.0',updates=added),ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(ksp_rows=len(ksp),records=len(added),models=len({(r['maker'],r['model']) for r in added}),rejected=rejects),ensure_ascii=False))
    print(' / '.join(sorted({r['model'] for r in added})))
if __name__=='__main__':main()
