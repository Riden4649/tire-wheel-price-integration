#!/usr/bin/env python3
"""Adaptive controller for PCD DB growth.

Chooses a conservative research budget from current PCD coverage and cached
official evidence. The final 2-independent-official-domain confirmation rule
is never weakened.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FITMENT = ROOT / "app/data/vehicles_2012_2026.json"
STATUS = ROOT / "dashboard/api-status.json"
STRATEGY = ROOT / "app/data/vehicle-updates/pcd-growth-strategy.json"
AUTO_POOL = ROOT / "app/data/vehicle-updates/auto-research-candidates.json"
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


def one_source_vehicle_count() -> int:
    pool = load(AUTO_POOL, {"records": []}).get("records", [])
    by_vehicle: dict[str, set[str]] = {}
    by_value: dict[str, set[str]] = {}
    for item in pool:
        if item.get("field") != "pcd":
            continue
        vid = item.get("vehicle_id")
        domain = item.get("source_domain")
        value = item.get("candidate_value")
        if not vid or not domain or value is None:
            continue
        by_vehicle.setdefault(vid, set()).add(domain)
        by_value.setdefault(vid, set()).add(str(value))
    return sum(
        1
        for vid, domains in by_vehicle.items()
        if len(domains) == 1 and len(by_value.get(vid, set())) == 1
    )


def choose_mode(coverage: float, prev_applied: int, prev_skipped: int) -> tuple[str, int, int, int, int, str]:
    """Return mode, Tavily, Brave, Gemini limits, variant level and reason."""
    if coverage < 90.0:
        return "economy", 6, 2, 6, 0, "coverage_below_90_budgeted"
    if coverage < 97.0:
        if prev_applied == 0 and prev_skipped >= 3:
            return "focused", 5, 2, 5, 1, "high_coverage_stalled_keep_budget_capped"
        return "focused", 4, 2, 4, 1, "coverage_90_to_97_budgeted"
    if prev_applied == 0 and prev_skipped >= 3:
        return "tail", 4, 1, 4, 2, "last_mile_stalled_no_api_spike"
    return "tail", 3, 1, 3, 2, "coverage_97_plus_minimum_web_budget"


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

    mode, tavily_limit, brave_limit, gemini_limit, variant_level, reason = choose_mode(
        coverage, prev_applied, prev_skipped
    )
    one_source_count = one_source_vehicle_count()

    run_tavily = missing > 0
    run_brave = missing > 0 and one_source_count > 0
    run_gemini = missing > 0

    now = datetime.now(JST).isoformat(timespec="seconds")
    payload = {
        "schema_version": "2.0.0",
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
        "cached_evidence": {
            "vehicles_with_exactly_one_official_pcd_source": one_source_count,
        },
        "mode": mode,
        "query_variant_level": variant_level,
        "budgets": {
            "tavily_max_queries": tavily_limit,
            "brave_max_queries": brave_limit,
            "gemini_max_targets": gemini_limit,
            "run_tavily": run_tavily,
            "run_brave": run_brave,
            "run_gemini": run_gemini,
        },
        "reason": reason,
        "safety": {
            "confirmation_rule_unchanged": True,
            "requires_two_independent_official_domains": True,
            "never_overwrite_existing_pcd": True,
            "conflicts_block_auto_apply": True,
            "brave_reserved_for_second_source_when_possible": True,
            "no_api_budget_spike_when_stalled": True,
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
            f"- 公式1ソース保有車: {one_source_count}",
            f"- 次回モード: **{mode}**",
            f"- Tavily上限: {tavily_limit} / run={run_tavily}",
            f"- Brave上限: {brave_limit} / run={run_brave}",
            f"- Gemini対象上限: {gemini_limit} / run={run_gemini}",
            f"- 検索バリエーション: level {variant_level}",
            f"- 判定理由: {reason}",
            "- Braveは原則、既存の公式1ソース候補に対する第2公式ソース探索に限定します。",
            "- 確定条件（独立公式2ドメイン一致）は変更しません。",
            "",
        ]) + "\n",
        encoding="utf-8",
    )

    export_env({
        "PCD_RESEARCH_MODE": mode,
        "PCD_QUERY_VARIANT_LEVEL": str(variant_level),
        "TAVILY_MAX_QUERIES": str(tavily_limit),
        "BRAVE_MAX_QUERIES": str(brave_limit),
        "GEMINI_PLAN_MAX_VEHICLES": str(gemini_limit),
        "GEMINI_MAX_URLS": str(gemini_limit),
        "RUN_TAVILY": "1" if run_tavily else "0",
        "RUN_BRAVE": "1" if run_brave else "0",
        "RUN_GEMINI": "1" if run_gemini else "0",
    })
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
