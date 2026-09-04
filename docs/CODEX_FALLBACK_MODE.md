# Codex 枯渇モード（API不使用）

## 目的
Tavily / Brave の月間枠が枯渇・逼迫した時に、Codexの直接Web調査だけでPCD候補を育てる。

## 重要ルール
- Tavily APIを使わない。
- Brave Search APIを使わない。
- `app/data/vehicle-updates/source_registry.json` に登録されたメーカー公式 / ホイールメーカー公式ドメインだけを証拠として採用する。
- 既存の `auto-research-candidates.json` を必ず先に再利用する。
- 公式1ソースが既にある車種を最優先し、第2の独立公式ドメインを探す。
- 車種・世代・型式の一致を確認できないページは証拠にしない。
- PCD値を推測しない。
- 値が競合したら自動反映しない。
- 自動確定は独立した公式2ドメインで同一PCDになった時だけ。
- 既存PCDは上書きしない。

## Codexに渡す指示
以下をそのまま使える。

> このリポジトリの車種DBを「Codex枯渇モード」で育成してください。まず `python tools/build_missing_data_queue.py`、`python tools/pcd_growth_controller.py`、`python tools/build_research_candidates.py`、`python tools/build_codex_research_queue.py` を実行してください。次に `app/data/vehicle-updates/codex-research-queue.json` を読み、優先順に調査してください。Tavily APIとBrave Search APIは一切使わず、Codexの直接Webアクセスだけを使ってください。`source_registry.json` 登録済みのメーカー公式またはホイールメーカー公式ドメインだけを証拠として採用してください。既に公式1ソースがある車種は、第2の独立公式ドメインから同じPCDを確認することを最優先にしてください。車種・世代・型式が一致していることを確認し、確認できた結果だけを `app/data/vehicle-updates/codex-research-results.json` に追加してください。各レコードは `vehicle_id`, `field:"pcd"`, `candidate_value`, `source_url`, `source_title`, `identity_confirmed:true`, `note` を含めてください。調査後に `python tools/import_codex_research_results.py`、`python tools/apply_auto_confirmed_pcd.py`、`python tests/vehicle_db_qa.py`、`python tools/vehicle_db_health.py` を順に実行してください。競合・不明・公式2ソース未達は反映せず保留してください。2時間を目安に、時間内で優先度の高い車種から進め、同じページや同じ証拠の再検索を避けてください。最後に、調査件数・新規公式候補・2公式一致件数・DB反映件数・保留理由を日本語で要約してください。

## 時間を長く回したい時
- 2時間: `CODEX_SESSION_MINUTES=120 CODEX_MAX_TASKS=30 python tools/build_codex_research_queue.py`
- 4時間: `CODEX_SESSION_MINUTES=240 CODEX_MAX_TASKS=60 python tools/build_codex_research_queue.py`
- 1日枠: `CODEX_SESSION_MINUTES=720 CODEX_MAX_TASKS=100 python tools/build_codex_research_queue.py`

時間は「強制終了時刻」ではなく、Codexへ渡す作業量の目安。終了条件は、時間・キュー完了・新規証拠が見つからない状態のいずれか。
