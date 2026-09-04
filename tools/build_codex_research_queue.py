#!/usr/bin/env python3
"""Build a Codex-only fallback research queue for PCD gaps.

This queue is intentionally API-free: Codex should use direct browser/web access to
registered official manufacturer / wheel-manufacturer sites and must not call
Tavily or Brave. Existing official evidence is reused and one-source vehicles are
prioritized because they only need one independent corroborating domain.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
CANDIDATES = REPORTS / "research-candidates.json"
FITMENT = ROOT / "app/data/vehicles_2012_2026.json"
POOL = ROOT / "app/data/vehicle-updates/auto-research-candidates.json"
REGISTRY = ROOT / "app/data/vehicle-updates/source_registry.json"
OUT = ROOT / "app/data/vehicle-updates/codex-research-queue.json"
MD = REPORTS / "codex-research-queue.md"
JST = timezone(timedelta(hours=9))


def load(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def main() -> int:
    try:
        max_tasks = max(1, min(int(os.getenv("CODEX_MAX_TASKS", "30")), 100))
    except ValueError:
        max_tasks = 30
    try:
        session_minutes = max(30, min(int(os.getenv("CODEX_SESSION_MINUTES", "120")), 720))
    except ValueError:
        session_minutes = 120

    fitment = load(FITMENT, {"vehicles": []})
    pcd_by_id = {v.get("vehicle_id"): v.get("pcd") for v in fitment.get("vehicles", [])}
    candidates = load(CANDIDATES, {"records": []}).get("records", [])
    pool = load(POOL, {"records": []}).get("records", [])
    registry = load(REGISTRY, {"domains": []})

    official_domains = [
        d.get("domain") for d in registry.get("domains", [])
        if d.get("source_type") in {"manufacturer_official", "wheel_manufacturer_official"} and d.get("domain")
    ]

    evidence_by_vehicle: dict[str, list[dict]] = {}
    for item in pool:
        if item.get("field") == "pcd" and item.get("vehicle_id"):
            evidence_by_vehicle.setdefault(item["vehicle_id"], []).append(item)

    tasks = []
    for c in candidates:
        vid = c.get("vehicle_id")
        if not vid or pcd_by_id.get(vid) is not None:
            continue
        if not any(q.get("field") == "pcd" for q in c.get("research_queries", [])):
            continue

        existing = evidence_by_vehicle.get(vid, [])
        values = {str(x.get("candidate_value")) for x in existing if x.get("candidate_value") is not None}
        domains = {x.get("source_domain") for x in existing if x.get("source_domain")}
        one_source = len(values) == 1 and len(domains) == 1
        target_domains = [d for d in official_domains if d not in domains]
        queries = [q.get("query") for q in c.get("research_queries", []) if q.get("field") == "pcd" and q.get("query")]

        tasks.append({
            "vehicle_id": vid,
            "search_id": c.get("search_id"),
            "maker": c.get("maker"),
            "model": c.get("model"),
            "generation": c.get("generation"),
            "year_from": c.get("year_from"),
            "year_to": c.get("year_to"),
            "priority_score": c.get("priority_score", 0),
            "priority_class": "one_source_needs_second" if one_source else "needs_first_official_source",
            "existing_official_evidence": [
                {
                    "candidate_value": x.get("candidate_value"),
                    "domain": x.get("source_domain"),
                    "url": x.get("source_url"),
                    "title": x.get("source_title"),
                }
                for x in existing
            ],
            "target_domains": target_domains,
            "search_queries": queries[:8],
            "completion": {
                "preferred": "same PCD value from a second independent registered official domain",
                "minimum": "one new registered official source with exact vehicle identity and exact PCD value",
                "conflict": "record conflict and do not auto-apply",
            },
        })

    tasks.sort(key=lambda x: (0 if x["priority_class"] == "one_source_needs_second" else 1, -int(x.get("priority_score") or 0)))
    tasks = tasks[:max_tasks]
    now = datetime.now(JST).isoformat(timespec="seconds")
    payload = {
        "schema_version": "1.0.0",
        "dataset": "codex_pcd_research_queue",
        "updated_at": now,
        "mode": "codex_fallback_api_free",
        "session_budget_minutes": session_minutes,
        "task_count": len(tasks),
        "policy": {
            "do_not_use_tavily": True,
            "do_not_use_brave": True,
            "registered_official_domains_only": True,
            "reuse_existing_evidence": True,
            "two_independent_official_domains_required_for_auto_apply": True,
            "never_guess": True,
            "never_overwrite_existing_pcd": True,
            "conflicts_require_human_review": True,
        },
        "result_file": "app/data/vehicle-updates/codex-research-results.json",
        "tasks": tasks,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORTS.mkdir(exist_ok=True)
    lines = [
        "# Codex fallback research queue",
        "",
        f"- tasks: {len(tasks)}",
        f"- session budget: {session_minutes} min",
        "- Tavily/Brave: DO NOT USE",
        "- official registered domains only",
        "- one-source vehicles are first",
        "",
    ]
    for t in tasks[:30]:
        lines.append(f"- {t['priority_class']} | {t['maker']} {t['model']} {t.get('generation') or ''} | {t['vehicle_id']}")
    MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"task_count": len(tasks), "session_minutes": session_minutes, "out": str(OUT)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
