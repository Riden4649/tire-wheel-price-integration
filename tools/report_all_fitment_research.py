#!/usr/bin/env python3
"""Produce a review-only report. Never publish candidate fitments."""
import json
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[1]
audit = json.loads(Path('/tmp/tire-fitment-all-model-audit.json').read_text())
web = json.loads(Path('/tmp/tire-remaining-web-results.json').read_text())
searched = {m['search_id'] for batch in web for m in batch['models']}
labels = {'existing': '既存登録あり（全型式網羅の保証ではない）',
          'candidate_unapproved': '追加候補あり・未承認', 'needs_review': '追加情報の確認が必要'}
assert len(audit['models']) == 545
assert len({m['search_id'] for m in audit['models']}) == 545
lines = ['# 車両適合データ 全件検索結果（2026-09-06）', '',
         '対象は現在の検索マスター全545車種。全車種の提供資料・メーカー適合表照合に加え、未解決だった338車種を個別Web検索した。', '',
         '既存登録あり102車種／追加候補あり132車種／追加情報の確認が必要311車種。', '',
         '**追加候補は未承認。本番データベース・公開サイトには反映していない。** 年式の終期、グレード条件、前後異径、資料間の値の相違を確認する必要がある。421件は抽出候補行数であり、確定した型式数ではない。', '',
         '「検索済み」は「全型式・全項目を補完済み」ではない。また、検索マスター外の車種はこの全件数に含まれない。', '',
         '## 使用資料', '',
         '- 提供済みTOPY 2025国産車マッチングExcel',
         '- 提供済みWeds 2025マッチングPDF（純正欄のみ）',
         '- [Wedsメーカー適合検索](https://search.weds.co.jp/)',
         '- [KSPメーカー適合表](https://ksp-eng.co.jp/ksp/real/domestic.html)（追加照合先。候補の承認根拠にはまだ組み込んでいない）', '',
         '## 全545車種', '', '| メーカー | 車名 | 確認状況 | 資料照合 | 個別Web検索 | 候補行数 |',
         '|---|---|---|---|---|---:|']
for m in audit['models']:
    lines.append('| '+' | '.join([m['maker'], m['model'], labels[m['status']], '実施',
                                  '実施' if m['search_id'] in searched else '資料照合対象', str(len(m['added_ids']))])+' |')
out = root / 'docs/VEHICLE_ALL_SEARCH_2026_09_06.md'
out.write_text('\n'.join(lines)+'\n')
print(json.dumps({'report':str(out), 'models':len(audit['models']), 'individual_web_searches':len(searched),
                  'statuses':dict(Counter(m['status'] for m in audit['models']))}, ensure_ascii=False))
