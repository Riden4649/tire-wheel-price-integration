#!/usr/bin/env python3
from __future__ import annotations
import json,re,unicodedata
from pathlib import Path
from collections import defaultdict,Counter
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'app/data/official-matching/topy-2025'
FIT=ROOT/'app/data/vehicles_2012_2026.json'
SEARCH=ROOT/'app/data/jp_vehicle_search_master_2000_2026_v1.json'
OUT=ROOT/'app/data/vehicle-updates/official-matching-proposals.json'
RJSON=ROOT/'reports/official-matching-import.json'
RMD=ROOT/'reports/official-matching-import.md'

def load(p): return json.loads(p.read_text(encoding='utf-8'))
def nm(x):
 s=unicodedata.normalize('NFKC',str(x or '')).strip(); return {'SUBARU':'スバル','LEXUS':'レクサス'}.get(s.upper(),s)
def nmodel(x):
 s=unicodedata.normalize('NFKC',str(x or '')).upper().strip()
 s=re.sub(r'[（(][^)）]*(?:系|型|MODEL|MC)[^)）]*[)）]','',s)
 return re.sub(r'[\s・_‐‑‒–—―-]+','',s)
def codes(x):
 vals=x if isinstance(x,list) else re.split(r'[\s,/・]+|\n+',str(x or ''))
 out=set()
 for v in vals:
  v=re.sub(r'[^A-Z0-9-]','',unicodedata.normalize('NFKC',str(v)).upper())
  if v and any(c.isdigit() for c in v): out.add(v)
 return out
def uniqnum(a):
 z=[]
 for v in a or []:
  try:
   f=float(v); z.append(int(f) if f.is_integer() else f)
  except: pass
 u=sorted(set(z)); return u[0] if len(u)==1 else None
def joined(a):
 out=[]
 for v in a or []:
  s=str(v).strip()
  if s and s not in ('-','×') and s not in out: out.append(s)
 return ';'.join(out) if out else None
def inch(a):
 out=[]
 for v in a or []:
  m=re.match(r'[^0-9]*(1[2-9]|2[0-4])',str(v))
  if m and m.group(1) not in out: out.append(m.group(1))
 return '/'.join(out) if out else None
def fastener(a):
 ds,ps=set(),set(); method=None; raw=[]
 for v in a or []:
  s=str(v).strip()
  if not s or s in ('-','×'): continue
  raw.append(s); m=re.search(r'(?:M)?(\d{2})\s*[x×]\s*(\d(?:\.\d+)?)',s,re.I)
  if m: ds.add(int(m.group(1))); ps.add(float(m.group(2)))
  if 'ボルト' in s: method='bolt'
 o={}
 if len(ds)==1:o['thread_diameter']=next(iter(ds))
 if len(ps)==1:o['thread_pitch']=next(iter(ps))
 if method:o['method']=method
 if raw:o['raw']=sorted(set(raw))
 return o
def fieldset(k,v):
 if v in (None,'',[],{}): return set()
 parts=re.split(r'[;/]',str(v))
 out=set()
 for x in parts:
  x=unicodedata.normalize('NFKC',x).upper().strip()
  if k=='oem_tire': x=re.sub(r'^(?:F:|R:|F|R|標|オ)','',x)
  x=re.sub(r'\s+','',x)
  if x: out.add(x)
 return out
def status(k,a,b):
 if a in (None,'',[],{}): return 'fill'
 if b in (None,'',[],{}): return 'none'
 if k in ('oem_tire','oem_inch'):
  aa,bb=fieldset(k,a),fieldset(k,b)
  if aa==bb:return 'same'
  if aa and aa < bb:return 'extension'
  return 'conflict'
 try:
  if float(a)==float(b): return 'same'
 except: pass
 na=re.sub(r'\s+','',str(a)).upper(); nb=re.sub(r'\s+','',str(b)).upper()
 return 'same' if na==nb else 'conflict'

def main():
 docs=[load(p) for p in sorted(SRC.glob('*.json'))]
 if not docs: raise SystemExit('official matching source not found')
 groups=defaultdict(list); maker_items=defaultdict(list); source_rows=0
 for d in docs:
  cols=d['columns']; ix={k:i for i,k in enumerate(cols)}; source_rows+=sum(int(r[ix['row_count']]) for r in d['models'])
  for r in d['models']:
   rec={k:r[i] for k,i in ix.items()}; mk=(nm(rec['maker']),nmodel(rec['model'])); groups[mk].append(rec); maker_items[mk[0]].append(rec)
 def merge(items):
  o={}
  for k in ('model_codes','oem_tires','oem_wheels','holes','pcd','hub_bore','fasteners'):
   z=[]
   for x in items:
    for v in x.get(k,[]) or []:
     if v not in z:z.append(v)
   o[k]=z
  return o
 fit=load(FIT); vehicles=fit.get('vehicles',[])
 search=load(SEARCH); search_keys={(nm(x.get('maker')),nmodel(x.get('model'))) for x in search.get('vehicles',[])}
 proposals=[]; conflicts=[]; matched=0; code_hits=0; maker_hits=Counter()
 for v in vehicles:
  key=(nm(v.get('maker')),nmodel(v.get('model'))); items=groups.get(key,[])
  vc=codes(v.get('model_codes') or v.get('generation'))
  if items and vc:
   hit=[x for x in items if codes(x.get('model_codes')) & vc]
   if hit: items=hit; code_hits+=1
  if not items and vc:
   items=[x for x in maker_items.get(key[0],[]) if codes(x.get('model_codes')) & vc]
   if items: code_hits+=1
  if not items: continue
  matched+=1; maker_hits[key[0]]+=1; s=merge(items)
  cand={'pcd':uniqnum(s['pcd']),'holes':uniqnum(s['holes']),'hub_bore':uniqnum(s['hub_bore']),'oem_tire':joined(s['oem_tires']),'oem_inch':inch(s['oem_wheels'])}
  f=fastener(s['fasteners']); fd=v.get('fastener_details') or {}
  fmap={'thread_diameter':'thread_diameter','thread_pitch':'thread_pitch','method':'method'}
  changes={}; bad={}; extensions={}
  for k,val in cand.items():
   st=status(k,v.get(k),val)
   if st=='fill': changes[k]=val
   elif st=='extension': extensions[k]={'current':v.get(k),'official':val}
   elif st=='conflict': bad[k]={'current':v.get(k),'official':val}
  for sk,dk in fmap.items():
   val=f.get(sk); st=status(sk,fd.get(dk),val)
   if st=='fill' and val is not None: changes.setdefault('fastener_details',{})[dk]=val
   elif st=='conflict': bad[f'fastener_details.{dk}']={'current':fd.get(dk),'official':val}
  base={'vehicle_id':v.get('vehicle_id'),'maker':v.get('maker'),'model':v.get('model'),'model_codes':v.get('model_codes',[]),'source_type':'official_supplied_matching_file','source_received':'2026-09-03'}
  if changes: proposals.append(base|{'changes':changes})
  if extensions: proposals.append(base|{'coverage_extensions':extensions,'requires_human_review':True})
  if bad: conflicts.append(base|{'conflicts':bad,'requires_human_review':True})
 result={'schema_version':'1.0.0','generated_at':'2026-09-03','source_rows':source_rows,'source_files':[p.name for p in sorted(SRC.glob('*.json'))],'fitment_records':len(vehicles),'fitment_matched':matched,'model_code_hits':code_hits,'search_base_records':search.get('record_count'),'search_model_matches':sum(1 for k in groups if k in search_keys),'proposal_records':len(proposals),'conflict_records':len(conflicts),'maker_fitment_matches':dict(maker_hits),'proposals':proposals,'conflicts':conflicts,'policy':'audit_only_no_production_mutation; existing A conflicts require human review'}
 OUT.parent.mkdir(parents=True,exist_ok=True); RJSON.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps({'schema_version':'1.0.0','generated_at':'2026-09-03','proposals':proposals,'conflicts':conflicts},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 RJSON.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 lines=['# 公式マッチング資料 差分監査','',f'- 公式原票行数: **{source_rows}**',f'- 適合DB: **{len(vehicles)}件**',f'- 適合DB一致: **{matched}件**',f'- 型式コード一致: **{code_hits}件**',f'- 自動補完候補: **{len(proposals)}件**',f'- 競合・要確認: **{len(conflicts)}件**','','## 安全ルール','- 本番DBは自動上書きしない。','- 既存A判定と公式原票の競合は human review。','- TOPY省略PCD 114/139は114.3/139.7へ補正済み。','- 締め付けトルクはこの資料では確定しない。']
 RMD.write_text('\n'.join(lines)+'\n',encoding='utf-8'); print('\n'.join(lines[:8]))
if __name__=='__main__': main()
