#!/usr/bin/env python3
"""Join exact Weds PDF rows with exact KSP chassis rows for remaining models."""
import hashlib,json,re,sys,unicodedata
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from approve_fitment_research import ksp_rows,URL as KSP_URL
from research_all_fitment import ROOT,norm

PDF=Path('/tmp/matching-files.kaWx49/マッチング/【ウェッズ】2025_MATCHING_BOOK_0826.pdf')
MAP={
 ('日産','シルビア'):('シルビア','シルビア'),
 ('ホンダ','S2000'):('S 2000','S2000'),
 ('ホンダ','シビックセダン'):('シビック','シビック'),
 ('ホンダ','シビック タイプR'):('シビックタイプR','シビック Type-R'),
}
def codes(s):return re.findall(r'[A-Z]{2,}\d*|[A-Z]\d+|\d+系',unicodedata.normalize('NFKC',str(s)).upper())
def main():
 rows=json.load(open('/tmp/tire-weds-pdf-rows.json'));ks=ksp_rows();out=[];evidence=[];sha=hashlib.sha256(PDF.read_bytes()).hexdigest()
 existing={x['vehicle_id'] for x in json.loads((ROOT/'app/data/vehicles_2012_2026.json').read_text())['vehicles']};seen=set(existing)
 for (maker,model),(pdfname,kname) in MAP.items():
  prs=[r for r in rows if r['maker']==maker and norm(r['model'])==norm(pdfname)]
  for pr in prs:
   gp=unicodedata.normalize('NFKC',str(pr['generation_period']));dm=re.search(r'((?:19|20)\d{2})/(\d{2})\s*[~〜～]',gp)
   tm=re.search(r'(\d{3}/\d{2})[-R](\d{2})',unicodedata.normalize('NFKC',str(pr['tire'])).upper())
   if not(dm and tm):continue
   gen=gp[:dm.start()].strip();gc=codes(gen)
   match=[k for k in ks if k['maker']==maker and norm(k['model'])==norm(kname) and k['pcd']==float(pr['pcd']) and k['holes']==int(pr['holes'])
          and gc and any(c in codes(k['code']) or any(c.startswith(z) or z.startswith(c) for z in codes(k['code'])) for c in gc)]
   if len({(k['hub_bore'],k['diameter'],k['pitch']) for k in match})!=1:continue
   hub,diam,pitch=next(iter({(k['hub_bore'],k['diameter'],k['pitch']) for k in match}))
   tire=tm[1]+'R'+tm[2];vid='WK_'+hashlib.sha256(f'{sha}:{maker}:{model}:{gen}:{tire}'.encode()).hexdigest()[:12].upper()
   if vid in seen:continue
   seen.add(vid)
   ev=dict(id=vid,source_file=PDF.name,sha256=sha,page=pr['page'],raw=pr,checked_at='2026-09-06');evidence.append(ev)
   out.append(dict(vehicle_id=vid,maker=maker,model=model,generation=gen,model_codes=gc or [gen],year_from=f'{dm[1]}-{dm[2]}',year_to='2025-12',
    pcd=float(pr['pcd']),holes=int(pr['holes']),hub_bore=hub,fastener=f'M{diam}×P{pitch:g}',fastener_details=dict(method='nut',thread_diameter=f'M{diam}',thread_pitch=pitch),
    oem_inch=tm[2],oem_tire=tire,confidence='B',notes='ユーザー指定の公式Weds適合表の年式・型式・純正サイズ・基本規格を、同型式のKSP公式適合表のハブ径・ねじ規格と照合。',
    sources=[dict(source_type='user_designated_official_matching_document',source_name=f'{PDF.name} p.{pr["page"]}',source_url='https://tire-wheel-price-navi.hide718283.chatgpt.site/data/vehicle-updates/weds-source-excerpts-2026-09-06.json#'+vid,verified_at='2026-09-06',document_sha256=sha,document_page=pr['page']),
             dict(source_type='parts_manufacturer_official',source_name='KSP REAL 国産車適合表',source_url=KSP_URL,verified_at='2026-09-06')],source_document=ev))
 dest=ROOT/'app/data/vehicle-updates/supplied-weds-ksp-2026-09-06.json';dest.write_text(json.dumps(dict(schema_version='1.0.0',updates=out),ensure_ascii=False,indent=2)+'\n')
 (ROOT/'app/data/vehicle-updates/weds-source-excerpts-2026-09-06.json').write_text(json.dumps(dict(source_file=PDF.name,sha256=sha,rows=evidence),ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(dict(records=len(out),models=len({x['model'] for x in out})),ensure_ascii=False));print(' / '.join(sorted({x['model'] for x in out})))
if __name__=='__main__':main()
