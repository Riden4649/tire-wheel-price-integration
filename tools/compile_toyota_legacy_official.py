#!/usr/bin/env python3
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
updates=[{
  'vehicle_id':'WEB_TOY_SPRINTER_TRUENO_AE111','maker':'トヨタ','model':'スプリンタートレノ',
  'generation':'AE111','model_codes':['AE111'],'year_from':'1995-05','year_to':'2000-08',
  'pcd':100,'holes':4,'hub_bore':54,'fastener':'M12×P1.5',
  'fastener_details':{'method':'nut','thread_diameter':'M12','thread_pitch':1.5},
  'oem_inch':'15','oem_tire':'195/55R15','confidence':'A',
  'notes':'車名・型式・純正タイヤはトヨタ公式認定中古車カタログ、取付基本規格はKSP公式適合表のAE111行で照合。',
  'sources':[{
    'source_type':'vehicle_manufacturer_official','source_name':'トヨタ認定中古車 スプリンタートレノ AE111',
    'source_url':'https://toyota.jp/ucar/catalog/brand-TOYOTA/car-SPRINTER_TRUENO/199505/1002298/','verified_at':'2026-09-06'
  },{
    'source_type':'parts_manufacturer_official','source_name':'KSP REAL 国産車適合表 スプリンタートレノ AE111',
    'source_url':'https://ksp-eng.co.jp/ksp/real/domestic.html','verified_at':'2026-09-06'
  }]
}]
out=ROOT/'app/data/vehicle-updates/toyota-legacy-official-2026-09-06.json';out.write_text(json.dumps({'schema_version':'1.0.0','updates':updates},ensure_ascii=False,indent=2)+'\n');print(out)
