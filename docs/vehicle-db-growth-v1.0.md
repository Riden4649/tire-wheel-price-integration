# Vehicle DB Growth v1.0

## 目的
GitHubを正本とする車種DBを、安全に継続育成する。自動処理は不足検出・優先順位付け・調査候補作成・証拠評価まで行い、本番マスターへの反映はPRまたは人間確認を経る。

## パイプライン
1. `vehicle_db_health.py` — DB健康診断
2. `build_missing_data_queue.py` — 不足車種/不足項目を優先度付きでキュー化
3. `build_research_candidates.py` — 上位100件を調査クエリへ変換
4. `research-evidence.json` — ChatGPT/人間/外部収集から証拠を投入
5. `evaluate_vehicle_evidence.py` — 出典と値を評価
6. `change-plan.json` — A/B確定候補のみを出力。本番DBは直接書き換えない
7. `review-queue.json` — 矛盾・証拠不足を人間確認へ
8. `change_log.json` — 本番反映後の変更履歴を保存

## 確定ルール
- メーカー公式: 1件で自動確定候補（Confidence A）
- メーカー公式以外: 信頼ソース2件以上、独立ドメイン、同一値で自動確定候補（Confidence B）
- 値が競合: 人間確認
- 1ソースのみ/証拠不足: 保留し不足キューへ残す
- 推測値は禁止

## 数値精度
- hub_bore: 店頭運用向けに小数部を切り捨てて正規化
- pcd: 114.3等、意味のある小数は保持
- thread_pitch: 1.25/1.5等を必ず保持
- wheel_torque_nm: 公式値または公式レンジを保持

## 更新ポリシー
- 旧世代は原則削除しない
- 新型/MCは差分追加
- 年式は年月単位
- グレードは適合条件が変わる場合のみ分離
- 本番適合判定ではメーカー/ホイールメーカー/現車確認を最終確認として残す

## 自動実行
GitHub Actions `Vehicle DB Growth v1.0` が以下で実行される。
- 手動
- DB/ツール変更PR
- mainへのDB/ツール変更
- 毎週日曜 07:15 JST

## 外部投入フォーマット
`app/data/vehicle-updates/research-evidence.json` の `records` に以下を追加する。

```json
{
  "vehicle_id": "TOY_LC250",
  "field": "wheel_torque_nm",
  "value": 140,
  "source_url": "https://...",
  "source_name": "TOYOTA 取扱説明書",
  "source_type": "manufacturer_official",
  "checked_at": "2026-09-01",
  "note": "任意"
}
```

`source_type` は省略可能。登録済みドメインなら自動分類する。

## v1.0 完了条件
- 健康診断が自動実行できる
- 不足キューを生成できる
- 優先順位付き調査候補を生成できる
- ChatGPT/人間/外部収集の証拠を共通形式で受け取れる
- 公式1件または独立2ソース一致を自動判定できる
- 矛盾/証拠不足をレビューへ振り分けられる
- 本番DBを直接壊さない
- 変更履歴用ストアがある
