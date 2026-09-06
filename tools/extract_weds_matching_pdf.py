#!/usr/bin/env python3
"""Extract only the OEM columns of the supplied Weds table (not inch-down)."""
import json
import sys
import re
from pathlib import Path
import pdfplumber
from research_all_fitment import MAKERS

def main():
    records=[];maker=''
    lookup={slug.upper():name for name,slug in MAKERS.items()}
    with pdfplumber.open(sys.argv[1]) as pdf:
        for page_no,page in enumerate(pdf.pages,1):
            for table in page.extract_tables():
                if len(table[0])!=14 or table[0][0]!='車名': continue
                context=[None]*9
                for i,row in enumerate(table[2:],3):
                    if row[0] in lookup:
                        maker=lookup[row[0]];context=[None]*9;continue
                    if row[0]: context=[None]*9
                    if row[1]:
                        context[1:]=[None]*8
                    for j in [0,1,2,3,6,7,8]:
                        if row[j] is not None:context[j]=row[j]
                    if not row[4] or not maker: continue
                    records.append(dict(maker=maker,model=context[0],generation_period=context[1],code=context[2],
                        remarks=context[3],tire=row[4],wheel=row[5],holes=context[6],pcd=context[7],hub=context[8],page=page_no,row=i))
    Path('/tmp/tire-weds-pdf-rows.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
    print('OEM rows',len(records))

if __name__=='__main__': main()
