#!/usr/bin/env python3
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
CANDIDATES = REPORTS / "research-candidates.json"
REGISTRY = ROOT / "app" / "data" / "vehicle-updates" / "source_registry.json"
OUT_JSON = REPORTS / "tavily-search-results.json"
OUT_MD = REPORTS / "tavily-search-results.md"

API_URL = "https://api.tavily.com/search"
DEFAULT_MAX_QUERIES = 12
PCD_PATTERNS = [
    re.compile(r"(?:PCD|P\.C\.D\.?|H/P\.C\.D)[^0-9]{0,18}(\d{2,3}(?:\.\d+)?)", re.I),
    re.compile(r"\b[3-8]\s*[-/]\s*(\d{2,3}(?:\.\d+)?)\b"),
]


def load(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def registered_source(url, registry):
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower()
    except Exception:
        return "unknown"
    best = None
    for item in registry.get("domains", []):
        domain = str(item.get("domain", "")).lower().strip(".")
        if domain and (host == domain or host.endswith("." + domain)):
            if best is None or len(domain) > len(best[0]):
                best = (domain, item.get("source_type", "unknown"))
    return best[1] if best else "unknown"


def source_domains(registry):
    allowed_types = {"manufacturer_official", "wheel_manufacturer_official"}
    return [
        d["domain"] for d in registry.get("domains", [])
        if d.get("source_type") in allowed_types and d.get("domain")
    ]


def extract_pcd(text):
    values = []
    for pattern in PCD_PATTERNS:
        for match in pattern.finditer(text or ""):
            try:
                value = float(match.group(1))
            except (TypeError, ValueError):
                continue
            if 80 <= value <= 200:
                values.append(int(value) if value.is_integer() else value)
    unique = []
    for value in values:
        if value not in unique:
            unique.append(value)
    return unique


def tavily_search(api_key, query, domains, max_results=5):
    payload = {
        "query": query,
        "search_depth": "basic",
        "max_results": max_results,
        "include_answer": False,
        "include_raw_content": False,
        "include_domains": domains,
        "country": "japan",
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "vehicle-db-growth/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    api_key = os.environ.get("TAVILY_API_KEY", "").strip()
    if not api_key:
        print("TAVILY_API_KEY is not configured", file=sys.stderr)
        return 2

    if not CANDIDATES.exists():
        print("research-candidates.json not found; run build_research_candidates.py first", file=sys.stderr)
        return 2

    max_queries = max(1, min(int(os.environ.get("TAVILY_MAX_QUERIES", DEFAULT_MAX_QUERIES)), 50))
    candidates = load(CANDIDATES).get("records", [])
    registry = load(REGISTRY)
    domains = source_domains(registry)

    queue = []
    # PCD is the current top mission. Other fields remain queued for later parsers.
    for vehicle in candidates:
        for rq in vehicle.get("research_queries", []):
            if rq.get("field") != "pcd":
                continue
            queue.append((vehicle, rq))
    queue.sort(key=lambda x: x[0].get("priority_score", 0), reverse=True)
    queue = queue[:max_queries]

    searches = []
    evidence_candidates = []
    errors = []
    for index, (vehicle, rq) in enumerate(queue, start=1):
        query = rq.get("query", "").strip()
        if not query:
            continue
        try:
            response = tavily_search(api_key, query, domains)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")[:500]
            errors.append({"query": query, "status": exc.code, "error": body})
            continue
        except Exception as exc:
            errors.append({"query": query, "error": str(exc)})
            continue

        result_items = []
        for result in response.get("results", []):
            url = result.get("url", "")
            source_type = registered_source(url, registry)
            if source_type not in {"manufacturer_official", "wheel_manufacturer_official"}:
                continue
            text = " ".join([str(result.get("title", "")), str(result.get("content", ""))])
            pcd_values = extract_pcd(text)
            normalized = {
                "title": result.get("title"),
                "url": url,
                "score": result.get("score"),
                "source_type": source_type,
                "snippet": result.get("content"),
                "pcd_values_found": pcd_values,
            }
            result_items.append(normalized)
            for value in pcd_values:
                evidence_candidates.append({
                    "vehicle_id": vehicle.get("vehicle_id"),
                    "search_id": vehicle.get("search_id"),
                    "maker": vehicle.get("maker"),
                    "model": vehicle.get("model"),
                    "generation": vehicle.get("generation"),
                    "field": "pcd",
                    "candidate_value": value,
                    "source_type": source_type,
                    "source_url": url,
                    "source_title": result.get("title"),
                    "search_score": result.get("score"),
                    "status": "candidate_only_needs_evidence_qa",
                })

        searches.append({
            "vehicle_id": vehicle.get("vehicle_id"),
            "maker": vehicle.get("maker"),
            "model": vehicle.get("model"),
            "generation": vehicle.get("generation"),
            "field": "pcd",
            "query": query,
            "results": result_items,
        })
        if index < len(queue):
            time.sleep(0.15)

    payload = {
        "schema_version": "1.0.0",
        "dataset": "tavily_vehicle_research",
        "production_master_write": False,
        "policy": {
            "pcd_first": True,
            "official_domains_only": True,
            "search_depth": "basic",
            "max_queries_per_run": max_queries,
            "candidate_values_are_not_confirmed": True,
            "manufacturer_official_requires_evidence_qa": True,
            "wheel_manufacturer_official_requires_independent_agreement": True,
            "no_guessing": True,
        },
        "query_count": len(queue),
        "search_success_count": len(searches),
        "candidate_value_count": len(evidence_candidates),
        "error_count": len(errors),
        "searches": searches,
        "evidence_candidates": evidence_candidates,
        "errors": errors,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Web自動検索（Tavily）",
        "",
        f"- 検索実行: {len(queue)}件",
        f"- 正常検索: {len(searches)}件",
        f"- PCD候補値: {len(evidence_candidates)}件",
        f"- エラー: {len(errors)}件",
        "- 候補値はまだ本番DBへ反映しません。QAと独立根拠確認後に確定します。",
        "",
        "## PCD候補",
    ]
    for item in evidence_candidates[:30]:
        lines.append(
            f"- {item.get('maker')} {item.get('model')} {item.get('generation') or ''}: "
            f"PCD {item.get('candidate_value')} / {item.get('source_type')} / {item.get('source_title') or item.get('source_url')}"
        )
    if not evidence_candidates:
        lines.append("- 今回は抽出可能なPCD候補なし")
    if errors:
        lines.extend(["", "## エラー"])
        for err in errors[:10]:
            lines.append(f"- {err.get('query')}: {err.get('status', '')} {err.get('error', '')}")
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(json.dumps({
        "query_count": len(queue),
        "search_success_count": len(searches),
        "candidate_value_count": len(evidence_candidates),
        "error_count": len(errors),
    }, ensure_ascii=False, indent=2))
    # API/query failures are visible in the report; fail only when every attempted query failed.
    if queue and not searches:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
