#!/usr/bin/env python3
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
CANDIDATES = REPORTS / "research-candidates.json"
REGISTRY = ROOT / "app" / "data" / "vehicle-updates" / "source_registry.json"
AUTO_POOL = ROOT / "app" / "data" / "vehicle-updates" / "auto-research-candidates.json"
AUTO_CONFIRMED = ROOT / "app" / "data" / "vehicle-updates" / "auto-confirmed-pcd.json"
OUT_JSON = REPORTS / "tavily-search-results.json"
OUT_MD = REPORTS / "tavily-search-results.md"

API_URL = "https://api.tavily.com/search"
DEFAULT_MAX_QUERIES = 12
JST = timezone(timedelta(hours=9))
PCD_PATTERNS = [
    re.compile(r"(?:PCD|P\.C\.D\.?|H/P\.C\.D)[^0-9]{0,18}(\d{2,3}(?:\.\d+)?)", re.I),
    re.compile(r"\b[3-8]\s*[-/]\s*(\d{2,3}(?:\.\d+)?)\b"),
]


def load(path, default=None):
    if not path.exists():
        return default if default is not None else {}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def domain_of(url):
    try:
        return (urllib.parse.urlparse(url).hostname or "").lower()
    except Exception:
        return ""


def registered_source(url, registry):
    host = domain_of(url)
    best = None
    for item in registry.get("domains", []):
        domain = str(item.get("domain", "")).lower().strip(".")
        if domain and (host == domain or host.endswith("." + domain)):
            if best is None or len(domain) > len(best[0]):
                best = (domain, item.get("source_type", "unknown"))
    return best[1] if best else "unknown"


def registered_domain(url, registry):
    host = domain_of(url)
    best = None
    for item in registry.get("domains", []):
        domain = str(item.get("domain", "")).lower().strip(".")
        if domain and (host == domain or host.endswith("." + domain)):
            if best is None or len(domain) > len(best):
                best = domain
    return best or host


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


def tavily_search(api_key, query, domains=None, max_results=8):
    payload = {
        "query": query,
        "search_depth": "basic",
        "max_results": max_results,
        "include_answer": False,
        "include_raw_content": False,
        "country": "japan",
    }
    if domains:
        payload["include_domains"] = domains
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "vehicle-db-growth/1.8",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def merge_candidate_pool(new_candidates, registry):
    now = datetime.now(JST).isoformat(timespec="seconds")
    old = load(AUTO_POOL, {"records": []}).get("records", [])
    merged = {}
    for item in old:
        key = (item.get("vehicle_id"), item.get("field"), item.get("candidate_value"), item.get("source_url"))
        merged[key] = item
    for item in new_candidates:
        url = item.get("source_url", "")
        source_type = registered_source(url, registry)
        if source_type not in {"manufacturer_official", "wheel_manufacturer_official"}:
            continue
        normalized = dict(item)
        normalized["source_type"] = source_type
        normalized["source_domain"] = registered_domain(url, registry)
        key = (normalized.get("vehicle_id"), normalized.get("field"), normalized.get("candidate_value"), normalized.get("source_url"))
        normalized["first_seen_at"] = merged.get(key, {}).get("first_seen_at", now)
        normalized["last_seen_at"] = now
        normalized["status"] = "candidate_only_needs_corroboration"
        merged[key] = normalized
    records = list(merged.values())
    records.sort(key=lambda x: (x.get("vehicle_id") or "", str(x.get("candidate_value")), x.get("source_domain") or ""))
    payload = {
        "schema_version": "1.1.0",
        "dataset": "auto_vehicle_research_candidates",
        "updated_at": now,
        "policy": {
            "official_domains_only": True,
            "candidate_is_not_production_evidence": True,
            "auto_confirm_requires_two_independent_registered_domains_same_value": True,
            "any_conflicting_official_value_blocks_auto_confirm": True,
            "no_guessing": True,
        },
        "record_count": len(records),
        "records": records,
    }
    AUTO_POOL.parent.mkdir(parents=True, exist_ok=True)
    AUTO_POOL.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return records


def build_confirmed(records):
    now = datetime.now(JST).isoformat(timespec="seconds")
    grouped = {}
    for item in records:
        if item.get("field") != "pcd":
            continue
        vid = item.get("vehicle_id")
        value = item.get("candidate_value")
        domain = item.get("source_domain")
        if not vid or value is None or not domain:
            continue
        grouped.setdefault(vid, {}).setdefault(value, {})[domain] = item
    confirmed, conflicts = [], []
    for vid, values in grouped.items():
        distinct_values = list(values.keys())
        if len(distinct_values) != 1:
            conflicts.append({"vehicle_id": vid, "values": sorted(distinct_values, key=lambda x: float(x)), "status": "human_review_required_conflicting_official_candidates"})
            continue
        value = distinct_values[0]
        sources_by_domain = values[value]
        if len(sources_by_domain) < 2:
            continue
        sources = []
        for domain, item in sorted(sources_by_domain.items()):
            sources.append({"domain": domain, "source_type": item.get("source_type"), "url": item.get("source_url"), "title": item.get("source_title")})
        sample = next(iter(sources_by_domain.values()))
        confirmed.append({
            "vehicle_id": vid,
            "maker": sample.get("maker"),
            "model": sample.get("model"),
            "generation": sample.get("generation"),
            "field": "pcd",
            "value": value,
            "confidence": "B",
            "support_count": len(sources),
            "sources": sources,
            "status": "auto_confirmed_two_independent_official_domains",
            "confirmed_at": now,
        })
    payload = {
        "schema_version": "1.0.0",
        "dataset": "auto_confirmed_pcd",
        "updated_at": now,
        "policy": {"minimum_independent_domains": 2, "official_registered_domains_only": True, "conflict_blocks_confirmation": True, "fills_missing_pcd_only": True},
        "confirmed_count": len(confirmed),
        "conflict_count": len(conflicts),
        "records": confirmed,
        "conflicts": conflicts,
    }
    AUTO_CONFIRMED.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return confirmed, conflicts


def official_domains_by_vehicle(pool_records):
    out = {}
    for item in pool_records:
        if item.get("field") != "pcd":
            continue
        vid = item.get("vehicle_id")
        domain = item.get("source_domain")
        if vid and domain:
            out.setdefault(vid, set()).add(domain)
    return out


def broad_query(vehicle, rq, has_one_source):
    maker = str(vehicle.get("maker") or "").strip()
    model = str(vehicle.get("model") or "").strip()
    generation = str(vehicle.get("generation") or "").strip()
    base = " ".join(x for x in [maker, model, generation] if x)
    if has_one_source:
        return f"{base} 型式 PCD ホイール 適合 マッチング 114.3 100 120"
    original = str(rq.get("query") or "").strip()
    return f"{base} 型式 世代 PCD ホイール 適合 マッチング {original}".strip()


def main():
    api_key = os.environ.get("TAVILY_API_KEY", "").strip()
    if not api_key:
        print("TAVILY_API_KEY is not configured", file=sys.stderr)
        return 2
    if not CANDIDATES.exists():
        print("research-candidates.json not found; run build_research_candidates.py first", file=sys.stderr)
        return 2

    max_queries = max(1, min(int(os.environ.get("TAVILY_MAX_QUERIES", DEFAULT_MAX_QUERIES)), 50))
    candidates = load(CANDIDATES, {}).get("records", [])
    registry = load(REGISTRY, {})
    pool_records = load(AUTO_POOL, {"records": []}).get("records", [])
    seen_by_vehicle = official_domains_by_vehicle(pool_records)

    queue = []
    for vehicle in candidates:
        for rq in vehicle.get("research_queries", []):
            if rq.get("field") == "pcd":
                domains = sorted(seen_by_vehicle.get(vehicle.get("vehicle_id"), set()))
                queue.append((vehicle, rq, domains))
    queue.sort(key=lambda x: (1 if len(x[2]) == 1 else 0, x[0].get("priority_score", 0)), reverse=True)
    queue = queue[:max_queries]

    searches, evidence_candidates, errors = [], [], []
    broad_hint_result_count = 0
    for index, (vehicle, rq, existing_domains) in enumerate(queue, start=1):
        query = broad_query(vehicle, rq, len(existing_domains) == 1)
        try:
            # v1.8: deliberately search the broad web. Non-official pages are hint-only.
            response = tavily_search(api_key, query, None, max_results=8)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")[:500]
            errors.append({"vehicle_id": vehicle.get("vehicle_id"), "query": query, "status": exc.code, "error": body})
            continue
        except Exception as exc:
            errors.append({"vehicle_id": vehicle.get("vehicle_id"), "query": query, "error": str(exc)})
            continue

        result_items = []
        for result in response.get("results", []):
            url = result.get("url", "")
            source_type = registered_source(url, registry)
            source_domain = registered_domain(url, registry)
            text = " ".join([str(result.get("title", "")), str(result.get("content", ""))])
            pcd_values = extract_pcd(text)
            is_official = source_type in {"manufacturer_official", "wheel_manufacturer_official"}
            if not is_official:
                broad_hint_result_count += 1
            normalized = {
                "title": result.get("title"),
                "url": url,
                "score": result.get("score"),
                "source_type": source_type,
                "source_domain": source_domain,
                "snippet": result.get("content"),
                "pcd_values_found": pcd_values,
                "role": "official_candidate" if is_official else "web_hint_only_not_evidence",
            }
            result_items.append(normalized)
            if is_official:
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
                    })
        searches.append({
            "vehicle_id": vehicle.get("vehicle_id"),
            "search_id": vehicle.get("search_id"),
            "maker": vehicle.get("maker"),
            "model": vehicle.get("model"),
            "generation": vehicle.get("generation"),
            "field": "pcd",
            "query": query,
            "existing_official_domains": existing_domains,
            "results": result_items,
        })
        if index < len(queue):
            time.sleep(0.15)

    pool = merge_candidate_pool(evidence_candidates, registry)
    confirmed, conflicts = build_confirmed(pool)
    payload = {
        "schema_version": "1.2.0",
        "dataset": "tavily_vehicle_research",
        "production_master_write": False,
        "policy": {
            "role": "broad_web_discovery_and_official_candidate_capture",
            "broad_web_results_are_hint_only_unless_registered_official": True,
            "one_source_vehicle_priority": True,
            "candidate_values_are_not_confirmed": True,
            "auto_confirmation_requires_two_independent_registered_domains": True,
            "conflict_blocks_auto_confirmation": True,
            "no_guessing": True,
        },
        "query_count": len(queue),
        "search_success_count": len(searches),
        "broad_hint_result_count": broad_hint_result_count,
        "official_candidate_value_count": len(evidence_candidates),
        "candidate_value_count": len(evidence_candidates),
        "persistent_candidate_count": len(pool),
        "auto_confirmed_count": len(confirmed),
        "conflict_count": len(conflicts),
        "error_count": len(errors),
        "searches": searches,
        "evidence_candidates": evidence_candidates,
        "errors": errors,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# 広域Web探索（Tavily）",
        "",
        f"- 検索実行: {len(queue)}件",
        f"- 正常検索: {len(searches)}件",
        f"- 非公式/未登録の探索ヒント: {broad_hint_result_count}件",
        f"- 公式PCD候補値: {len(evidence_candidates)}件",
        f"- 累積公式候補: {len(pool)}件",
        f"- 2独立公式ドメイン一致: {len(confirmed)}件",
        f"- 競合: {len(conflicts)}件",
        f"- エラー: {len(errors)}件",
        "- 非公式サイト・ショップ記事・集約サイト等は検索ヒント専用。DB確定根拠には使用しません。",
    ]
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({
        "query_count": len(queue),
        "search_success_count": len(searches),
        "broad_hint_result_count": broad_hint_result_count,
        "candidate_value_count": len(evidence_candidates),
        "auto_confirmed_count": len(confirmed),
        "conflict_count": len(conflicts),
        "error_count": len(errors),
    }, ensure_ascii=False, indent=2))
    if queue and not searches:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
