#!/usr/bin/env python3
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def src(t,n,u): return {'source_type':t,'source_name':n,'source_url':u,'verified_at':'2026-09-06'}
updates=[
 {'vehicle_id':'WEB_LEX_LFA_LFA10','maker':'レクサス','model':'LFA','generation':'LFA10','model_codes':['LFA10'],
  'year_from':'2010-12','year_to':'2012-12','pcd':114.3,'holes':5,'hub_bore':60,'fastener':'M14×P1.5 ボルト',
  'fastener_details':{'method':'bolt','thread_diameter':'M14','thread_pitch':1.5},'oem_inch':'20',
  'oem_tire':'265/35R20;305/30R20','front_rear_staggered':True,'confidence':'A',
  'notes':'純正タイヤはLEXUS公式取扱説明書、型式・取付基本規格はKSP公式適合表で照合。専用ホイールボルト車。',
  'sources':[src('vehicle_manufacturer_official','LEXUS LFA 取扱説明書','https://manual.lexus.jp/pdf/lfa/LFA_OM_JP_M77001J_1_1012.pdf'),src('parts_manufacturer_official','KSP REAL 国産車適合表','https://ksp-eng.co.jp/ksp/real/domestic.html')]},
 {'vehicle_id':'DOC_NIS_CEDRIC_Y34','maker':'日産','model':'セドリック','generation':'Y34系','model_codes':['Y34'],
  'year_from':'1999-06','year_to':'2004-10','pcd':114.3,'holes':5,'hub_bore':66,'fastener':'M12×P1.25',
  'fastener_details':{'method':'nut','thread_diameter':'M12','thread_pitch':1.25},'oem_inch':'17','oem_tire':'215/50R17','confidence':'B',
  'notes':'ユーザー指定の公式扱いMID資料の車名・年式・純正サイズを、同じY34系のKSP公式適合表で照合。',
  'sources':[src('user_designated_official_matching_document','MID 24-25 ニッサン 行116','https://tire-wheel-price-navi.hide718283.chatgpt.site/data/vehicle-updates/ksp-official-remaining-2026-09-06.json'),src('parts_manufacturer_official','KSP REAL 国産車適合表','https://ksp-eng.co.jp/ksp/real/domestic.html')]}
]
out=ROOT/'app/data/vehicle-updates/ksp-official-remaining-2026-09-06.json';out.write_text(json.dumps({'schema_version':'1.0.0','updates':updates},ensure_ascii=False,indent=2)+'\n');print(out)
