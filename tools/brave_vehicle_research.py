#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from tavily_vehicle_research import (
    AUTO_POOL,
    CANDIDATES,
    REGISTRY,
    build_confirmed,
    extract_pcd,
    load,
    merge_candidate_pool,
    registered_domain,
    registered_source,
)

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
OUT_JSON = REPORTS / "brave-search-results.json"
OUT_MD = REPORTS / "brave-search-results.md"
API_URL = "https://api.search.brave.com/res/v1/web/search"
DEFAULT_MAX_QUERIES = 12
ALLOWED_TYPES = {"manufacturer_official", "wheel_manufacturer_official"}


def official_domains(registry):
    wheel = []
    maker = []
    for item in registry.get("domains", []):
        domain = str(item.get("domain", "")).strip().lower()
        source_type = item.get("source_type")
        if not domain or source_type not in ALLOWED_TYPES:
            continue
        if source_type == "wheel_manufacturer_official":
            wheel.append(domain)
        else:
            maker.append(domain)
    return wheel + maker


def brave_search(api_key, query, count=5):
    params = urllib.parse.urlencode({
        "q": query,
        "count": max(1, min(int(count), 20)),
        "country": "JP",
        "search_lang": "ja",
        "safesearch": "moderate",
    })
    req = urllib.request.Request(
        f"{API_URL}?{params}",
        headers={
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": api_key,
            "User-Agent": "vehicle-db-growth-brave/1.0",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        body = response.read()
        if response.headers.get("Content-Encoding", "").lower() == "gzip":
            import gzip
            body = gzip.decompress(body)
        return json.loads(body.decode("utf-8"))


def pool_by_vehicle(records):
    out = {}
    for item in records:
        if item.get("field") != "pcd":
            continue
        vid = item.get("vehicle_id")
        if not vid:
            continue
        out.setdefault(vid, []).append(item)
    return out


def base_query(vehicle):
    parts = [
        str(vehicle.get("maker") or "").strip(),
        str(vehicle.get("model") or "").strip(),
        str(vehicle.get("generation") or "").strip(),
        "PCD",
    ]
    return " ".join(p for p in parts if p)


def build_targets(pool_records, research_records, registry, max_queries):
    domains = official_domains(registry)
    by_vehicle = pool_by_vehicle(pool_records)
    targets = []

    # First priority: vehicles that already have one official PCD source.
    # Search only different official domains to obtain independent corroboration.
    for vid, items in by_vehicle.items():
        values = {item.get("candidate_value") for item in items if item.get("candidate_value") is not None}
        seen_domains = {item.get("source_domain") for item in items if item.get("source_domain")}
        if len(values) != 1 or len(seen_domains) >= 2:
            continue
        sample = items[0]
        for domain in domains:
            if domain in seen_domains:
                continue
            targets.append({
                "vehicle_id": vid,
                "maker": sample.get("maker"),
                "model": sample.get("model"),
                "generation": sample.get("generation"),
                "search_id": sample.get("search_id"),
                "expected_candidate": next(iter(values)),
                "target_domain": domain,
                "reason": "seek_independent_second_official_domain",
                "query": f"site:{domain} {base_query(sample)}",
            })
            if len(targets) >= max_queries:
                return targets

    # Second priority: PCD research candidates with no official candidate yet.
    known_ids = set(by_vehicle)
    sorted_research = sorted(
        research_records,
        key=lambda x: x.get("priority_score", 0),
        reverse=True,
    )
    for vehicle in sorted_research:
        vid = vehicle.get("vehicle_id")
        if not vid or vid in known_ids:
            continue
        has_pcd = any(q.get("field") == "pcd" for q in vehicle.get("research_queries", []))
        if not has_pcd:
            continue
        for domain in domains:
            targets.append({
                "vehicle_id": vid,
                "maker": vehicle.get("maker"),
                "model": vehicle.get("model"),
                "generation": vehicle.get("generation"),
                "search_id": vehicle.get("search_id"),
                "expected_candidate": None,
                "target_domain": domain,
                "reason": "discover_first_official_pcd_candidate",
                "query": f"site:{domain} {base_query(vehicle)}",
            })
            if len(targets) >= max_queries:
                return targets
    return targets


def main():
    api_key = os.environ.get("BRAVE_SEARCH_API_KEY", "").strip()
    if not api_key:
        print("BRAVE_SEARCH_API_KEY is not configured", file=sys.stderr)
        return 2

    max_queries = max(1, min(int(os.environ.get("BRAVE_MAX_QUERIES", DEFAULT_MAX_QUERIES)), 50))
    registry = load(REGISTRY, {})
    pool_records = load(AUTO_POOL, {"records": []}).get("records", [])
    research_records = load(CANDIDATES, {"records": []}).get("records", []) if CANDIDATES.exists() else []
    targets = build_targets(pool_records, research_records, registry, max_queries)

    searches = []
    evidence_candidates = []
    errors = []

    for index, target in enumerate(targets, start=1):
        query = target["query"]
        try:
            response = brave_search(api_key, query)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")[:500]
            errors.append({
                "vehicle_id": target.get("vehicle_id"),
                "target_domain": target.get("target_domain"),
                "query": query,
                "status": exc.code,
                "error": body,
            })
            continue
        except Exception as exc:
            errors.append({
                "vehicle_id": target.get("vehicle_id"),
                "target_domain": target.get("target_domain"),
                "query": query,
                "error": str(exc),
            })
            continue

        result_items = []
        for result in response.get("web", {}).get("results", []):
            url = str(result.get("url") or "")
            source_type = registered_source(url, registry)
            source_domain = registered_domain(url, registry)
            if source_type not in ALLOWED_TYPES:
                continue
            # The API search is domain-targeted, but validate the returned URL too.
            if source_domain != target.get("target_domain"):
                continue
            text = " ".join([
                str(result.get("title") or ""),
                str(result.get("description") or ""),
                " ".join(str(x) for x in (result.get("extra_snippets") or [])),
            ])
            pcd_values = extract_pcd(text)
            result_items.append({
                "title": result.get("title"),
                "url": url,
                "source_type": source_type,
                "source_domain": source_domain,
                "snippet": result.get("description"),
                "pcd_values_found": pcd_values,
            })
            for value in pcd_values:
                evidence_candidates.append({
                    "vehicle_id": target.get("vehicle_id"),
                    "search_id": target.get("search_id"),
                    "maker": target.get("maker"),
                    "model": target.get("model"),
                    "generation": target.get("generation"),
                    "field": "pcd",
                    "candidate_value": value,
                    "source_type": source_type,
                    "source_url": url,
                    "source_title": result.get("title"),
                    "source_domain": source_domain,
                    "search_engine": "brave",
                    "target_reason": target.get("reason"),
                })

        searches.append({
            **target,
            "results": result_items,
        })
        if index < len(targets):
            time.sleep(0.12)

    pool = merge_candidate_pool(evidence_candidates, registry)
    confirmed, conflicts = build_confirmed(pool)

    REPORTS.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": "1.0.0",
        "dataset": "brave_vehicle_research",
        "production_master_write": False,
        "policy": {
            "role": "independent_second_source_search",
            "official_registered_domains_only": True,
            "different_domain_priority": True,
            "search_engine_independence_does_not_count_as_source_independence": True,
            "auto_confirmation_requires_two_independent_registered_domains_same_value": True,
            "conflict_blocks_auto_confirmation": True,
            "no_guessing": True,
        },
        "query_count": len(targets),
        "search_success_count": len(searches),
        "candidate_value_count": len(evidence_candidates),
        "persistent_candidate_count": len(pool),
        "auto_confirmed_count": len(confirmed),
        "conflict_count": len(conflicts),
        "error_count": len(errors),
        "searches": searches,
        "evidence_candidates": evidence_candidates,
        "errors": errors,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# 第2根拠探索（Brave Search）",
        "",
        f"- 検索実行: {len(targets)}件",
        f"- 正常検索: {len(searches)}件",
        f"- 今回のPCD候補値: {len(evidence_candidates)}件",
        f"- 累積候補: {len(pool)}件",
        f"- 2独立公式ドメイン一致: {len(confirmed)}件",
        f"- 競合: {len(conflicts)}件",
        f"- エラー: {len(errors)}件",
        "- TavilyとBraveが同じURLを見つけても2ソース扱いにはしません。独立した公式ドメイン数で判定します。",
        "",
        "## 2ソース一致候補",
    ]
    if confirmed:
        for item in confirmed[:30]:
            lines.append(
                f"- {item.get('maker')} {item.get('model')} {item.get('generation') or ''}: "
                f"PCD {item.get('value')} / 独立公式 {item.get('support_count')}ドメイン"
            )
    else:
        lines.append("- 今回は2独立公式ドメイン一致なし")
    if conflicts:
        lines.extend(["", "## 競合（自動反映停止）"])
        for item in conflicts[:20]:
            lines.append(f"- {item.get('vehicle_id')}: {item.get('values')}")
    if errors:
        lines.extend(["", "## エラー"])
        for err in errors[:10]:
            lines.append(
                f"- {err.get('vehicle_id')} / {err.get('target_domain')}: "
                f"{err.get('status', '')} {err.get('error', '')}"
            )
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(json.dumps({
        "query_count": len(targets),
        "search_success_count": len(searches),
        "candidate_value_count": len(evidence_candidates),
        "persistent_candidate_count": len(pool),
        "auto_confirmed_count": len(confirmed),
        "conflict_count": len(conflicts),
        "error_count": len(errors),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
