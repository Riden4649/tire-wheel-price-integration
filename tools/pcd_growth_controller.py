#!/usr/bin/env python3
"""Adaptive controller for PCD DB growth.

Uses current PCD coverage and the previous run snapshot to choose how aggressively
research should search on the next run. The controller never weakens the final
2-independent-official-domain confirmation rule; it only changes research breadth.
"""

from __future__ import annotations
import json, os
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FITMENT = ROOT / "app/data/vehicles_2012_2026.json"
STATUS = ROOT / "dashboard/api-status.json"
STRATEGY = ROOT / "app/data/vehicle-updates/pcd-growth-strategy.json"
REPORT_JSON = ROOT / "reports/pcd-growth-controller.json"
REPORT_MD = ROOT / "reports/pcd-growth-controller.md"
JST = timezone(timedelta(hours=9))


def load(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def export_env(values: dict[str, str]) -> None:
    env_path = os.getenv("GITHUB_ENV")
    if not env_path:
        return
    with open(env_path, "a", encoding="utf-8") as f:
        for k, v in values.items():
            f.write(f"{k}={v}\n")


def choose_mode(coverage: float, prev_applied: int, prev_skipped: int, prev_mode: str) -> tuple[str, int, int, str]:
    # Keep normal mode while the easy majority remains.
    if coverage < 90.0:
        return "normal", 15, 0, "coverage_below_90"

    # Around the last 10%, broaden aliases/queries but keep the same evidence gate.
    if coverage < 97.0:
        if prev_applied == 0 and prev_skipped >= 3:
            return "focused", 22, 1, "high_coverage_and_previous_run_added_nothing"
        return "focused", 18, 1, "coverage_90_to_97"

    # Final tail: old generations, PDFs, archives, alternate model notation.
    if prev_applied == 0 and prev_skipped >= 3:
        return "tail", 30, 2, "last_mile_stalled"
    return "tail", 24, 2, "coverage_97_plus"


def main() -> int:
    fitment = load(FITMENT, {"vehicles": []})
    vehicles = fitment.get("vehicles", [])
    total = len(vehicles)
    with_pcd = sum(1 for v in vehicles if v.get("pcd") is not None)
    missing = total - with_pcd
    coverage = round((with_pcd / total * 100.0), 1) if total else 0.0

    status = load(STATUS, {})
    production = status.get("production_apply") or {}
    prev_applied = int(production.get("applied_count") or 0)
    prev_skipped = int(production.get("skipped_count") or 0)

    old = load(STRATEGY, {})
    prev_mode = old.get("mode", "normal")
    mode, limit, variant_level, reason = choose_mode(coverage, prev_applied, prev_skipped, prev_mode)

    now = datetime.now(JST).isoformat(timespec="seconds")
    payload = {
        "schema_version": "1.0.0",
        "dataset": "pcd_growth_strategy",
        "updated_at": now,
        "coverage": {
            "total_records": total,
            "pcd_filled": with_pcd,
            "pcd_missing": missing,
            "pcd_fill_rate": coverage,
        },
        "previous_run": {
            "applied_count": prev_applied,
            "skipped_count": prev_skipped,
            "run_id": (status.get("run") or {}).get("id"),
        },
        "mode": mode,
        "query_limit": limit,
        "query_variant_level": variant_level,
        "reason": reason,
        "safety": {
            "confirmation_rule_unchanged": True,
            "requires_two_independent_official_domains": True,
            "never_overwrite_existing_pcd": True,
            "conflicts_block_auto_apply": True,
        },
    }

    STRATEGY.parent.mkdir(parents=True, exist_ok=True)
    STRATEGY.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_MD.write_text(
        "\n".join([
            "# PCD Growth Controller",
            "",
            f"- PCD登録率: {coverage}% ({with_pcd}/{total})",
            f"- 未登録: {missing}",
            f"- 前回反映: {prev_applied}",
            f"- 前回スキップ: {prev_skipped}",
            f"- 次回モード: **{mode}**",
            f"- 検索上限: {limit}",
            f"- 検索バリエーション: level {variant_level}",
            f"- 判定理由: {reason}",
            "- 確定条件（独立公式2ドメイン一致）は変更しません。",
            "",
        ]) + "\n",
        encoding="utf-8",
    )

    export_env({
        "PCD_RESEARCH_MODE": mode,
        "PCD_QUERY_VARIANT_LEVEL": str(variant_level),
        "TAVILY_MAX_QUERIES": str(limit),
        "BRAVE_MAX_QUERIES": str(limit),
        "GEMINI_PLAN_MAX_VEHICLES": str(limit),
        "GEMINI_MAX_URLS": str(limit),
    })
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
