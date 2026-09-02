#!/usr/bin/env python3
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
OUT = ROOT / "dashboard" / "api-status.json"
JST = timezone(timedelta(hours=9))


def load(name):
    path = REPORTS / name
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def service(name, data, attempted_key, success_key, error_key="error_count", extra=None):
    if not data:
        return {
            "name": name,
            "status": "not_run",
            "attempted": 0,
            "success": 0,
            "errors": 0,
            "success_rate": None,
        }
    attempted = int(data.get(attempted_key, 0) or 0)
    success = int(data.get(success_key, 0) or 0)
    errors = int(data.get(error_key, 0) or 0)
    if errors:
        status = "error" if success == 0 and attempted > 0 else "warning"
    else:
        status = "ok" if attempted > 0 else "idle"
    result = {
        "name": name,
        "status": status,
        "attempted": attempted,
        "success": success,
        "errors": errors,
        "success_rate": round(success / attempted * 100, 1) if attempted else None,
    }
    if extra:
        result.update(extra(data))
    return result


def main():
    tavily = load("tavily-search-results.json")
    brave = load("brave-search-results.json")
    gemini = load("gemini-structured-extraction.json")
    applied = load("auto-pcd-apply.json") or {}

    services = [
        service(
            "Tavily", tavily, "query_count", "search_success_count",
            extra=lambda d: {
                "candidates": int(d.get("candidate_value_count", 0) or 0),
                "confirmed": int(d.get("auto_confirmed_count", 0) or 0),
                "conflicts": int(d.get("conflict_count", 0) or 0),
            },
        ),
        service(
            "Brave", brave, "query_count", "search_success_count",
            extra=lambda d: {
                "candidates": int(d.get("candidate_value_count", 0) or 0),
                "confirmed": int(d.get("auto_confirmed_count", 0) or 0),
                "conflicts": int(d.get("conflict_count", 0) or 0),
            },
        ),
        service(
            "Gemini", gemini, "url_count", "successful_extractions",
            extra=lambda d: {
                "identity_confirmed": int(d.get("identity_confirmed_count", 0) or 0),
                "pcd_candidates": int(d.get("pcd_candidates_added", 0) or 0),
                "confirmed": int(d.get("auto_confirmed_pcd_count", 0) or 0),
                "conflicts": int(d.get("pcd_conflict_count", 0) or 0),
                "retries": int(d.get("retry_attempt_count", 0) or 0),
                "fallback_success": int(d.get("fallback_success_count", 0) or 0),
                "model": d.get("model"),
                "fallback_model": d.get("fallback_model"),
            },
        ),
    ]

    total_attempted = sum(x["attempted"] for x in services)
    total_success = sum(x["success"] for x in services)
    total_errors = sum(x["errors"] for x in services)
    if any(x["status"] == "error" for x in services):
        overall = "error"
    elif any(x["status"] == "warning" for x in services):
        overall = "warning"
    elif total_attempted:
        overall = "ok"
    else:
        overall = "idle"

    payload = {
        "schema_version": "1.0.0",
        "dataset": "vehicle_db_api_run_status",
        "updated_at": datetime.now(JST).isoformat(timespec="seconds"),
        "run": {
            "id": os.environ.get("GITHUB_RUN_ID"),
            "number": os.environ.get("GITHUB_RUN_NUMBER"),
            "event": os.environ.get("GITHUB_EVENT_NAME"),
            "sha": os.environ.get("GITHUB_SHA"),
            "repository": os.environ.get("GITHUB_REPOSITORY"),
        },
        "overall_status": overall,
        "totals": {
            "attempted": total_attempted,
            "success": total_success,
            "errors": total_errors,
            "success_rate": round(total_success / total_attempted * 100, 1) if total_attempted else None,
        },
        "services": services,
        "production_apply": {
            "applied_count": int(applied.get("applied_count", 0) or 0),
            "skipped_count": int(applied.get("skipped_count", 0) or 0),
        },
        "note": "APIキーや秘密情報は保存しません。表示値は直近の車種DB育成Runで生成された公開可能な実行統計のみです。",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
