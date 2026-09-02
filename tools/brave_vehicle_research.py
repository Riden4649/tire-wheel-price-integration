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
    AUTO_POOL, CANDIDATES, REGISTRY, build_confirmed, extract_pcd, load,
    merge_candidate_pool, registered_domain, registered_source,
)

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
OUT_JSON = REPORTS / "brave-search-results.json"
OUT_MD = REPORTS / "brave-search-results.md"
API_URL = "https://api.search.brave.com/res/v1/web/search"
DEFAULT_MAX_QUERIES = 12
ALLOWED_TYPES = {"manufacturer_official", "wheel_manufacturer_official"}


def official_domains(registry):
    wheel, maker = [], []
    for item in registry.get("domains", []):
        domain = str(item.get("domain", "")).strip().lower()
        source_type = item.get("source_type")
        if not domain or source_type not in ALLOWED_TYPES:
            continue
        (wheel if source_type == "wheel_manufacturer_official" else maker).append(domain)
    return wheel + maker


def domain_hint(registry, domain):
    return (registry.get("search_strategy", {}).get("domain_hints", {}).get(domain, {}) or {})


def brave_search(api_key, query, count=5):
    params = urllib.parse.urlencode({
        "q": query, "count": max(1, min(int(count), 20)), "country": "JP",
        "search_lang": "ja", "safesearch": "moderate",
    })
    req = urllib.request.Request(
        f"{API_URL}?{params}",
        headers={"Accept":"application/json","Accept-Encoding":"gzip","X-Subscription-Token":api_key,"User-Agent":"vehicle-db-growth-brave/1.1"},
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
        if item.get("field") == "pcd" and item.get("vehicle_id"):
            out.setdefault(item["vehicle_id"], []).append(item)
    return out


def base_query(vehicle, expected=None):
    parts = [str(vehicle.get("maker") or "").strip(), str(vehicle.get("model") or "").strip(), str(vehicle.get("generation") or "").strip()]
    parts += ["適合", "マッチング", "車種", "PCD"]
    if expected is not None:
        parts.append(str(expected))
    return " ".join(p for p in parts if p)


def make_query(registry, domain, vehicle, expected=None):
    hint = domain_hint(registry, domain)
    terms = hint.get("query_terms", [])[:3]
    return " ".join([f"site:{domain}", base_query(vehicle, expected)] + [str(x) for x in terms])


def build_targets(pool_records, research_records, registry, max_queries):
    domains = official_domains(registry)
    by_vehicle = pool_by_vehicle(pool_records)
    targets = []

    # Priority 1: one confirmed-looking official candidate already exists -> seek second domain.
    for vid, items in by_vehicle.items():
        values = {i.get("candidate_value") for i in items if i.get("candidate_value") is not None}
        seen_domains = {i.get("source_domain") for i in items if i.get("source_domain")}
        if len(values) != 1 or len(seen_domains) >= 2:
            continue
        sample, expected = items[0], next(iter(values))
        for domain in domains:
            if domain in seen_domains:
                continue
            targets.append({
                "vehicle_id":vid,"maker":sample.get("maker"),"model":sample.get("model"),"generation":sample.get("generation"),
                "search_id":sample.get("search_id"),"expected_candidate":expected,"target_domain":domain,
                "reason":"seek_independent_second_official_domain",
                "query":make_query(registry, domain, sample, expected),
            })
            if len(targets) >= max_queries:
                return targets

    # Priority 2: discover first official candidate for high-priority missing vehicles.
    known_ids = set(by_vehicle)
    for vehicle in sorted(research_records, key=lambda x: x.get("priority_score", 0), reverse=True):
        vid = vehicle.get("vehicle_id")
        if not vid or vid in known_ids or not any(q.get("field") == "pcd" for q in vehicle.get("research_queries", [])):
            continue
        for domain in domains:
            targets.append({
                "vehicle_id":vid,"maker":vehicle.get("maker"),"model":vehicle.get("model"),"generation":vehicle.get("generation"),
                "search_id":vehicle.get("search_id"),"expected_candidate":None,"target_domain":domain,
                "reason":"discover_first_official_pcd_candidate",
                "query":make_query(registry, domain, vehicle),
            })
            if len(targets) >= max_queries:
                return targets
    return targets


def relevance_score(target, result, registry):
    title = str(result.get("title") or "").lower()
    url = str(result.get("url") or "").lower()
    desc = str(result.get("description") or "").lower()
    text = " ".join([title, url, desc])
    score = 0
    for token, pts in [(target.get("model"), 5), (target.get("generation"), 4), (target.get("maker"), 2)]:
        token = str(token or "").strip().lower()
        if token and token in text:
            score += pts
    for term in ["適合", "マッチング", "matching", "車種", "pcd", "型式"]:
        if term in text:
            score += 2
    hint = domain_hint(registry, target.get("target_domain"))
    for term in hint.get("preferred_url_terms", []):
        if str(term).lower() in url:
            score += 6
    for term in registry.get("search_strategy", {}).get("deprioritize_url_terms", []):
        if str(term).lower() in url:
            score -= 5
    if target.get("expected_candidate") is not None and str(target["expected_candidate"]) in text:
        score += 4
    return score


def main():
    api_key = os.environ.get("BRAVE_SEARCH_API_KEY", "").strip()
    if not api_key:
        print("BRAVE_SEARCH_API_KEY is not configured", file=sys.stderr); return 2
    max_queries = max(1, min(int(os.environ.get("BRAVE_MAX_QUERIES", DEFAULT_MAX_QUERIES)), 50))
    registry = load(REGISTRY, {})
    pool_records = load(AUTO_POOL, {"records": []}).get("records", [])
    research_records = load(CANDIDATES, {"records": []}).get("records", []) if CANDIDATES.exists() else []
    targets = build_targets(pool_records, research_records, registry, max_queries)
    searches, evidence_candidates, errors = [], [], []

    for index, target in enumerate(targets, start=1):
        try:
            response = brave_search(api_key, target["query"])
        except urllib.error.HTTPError as exc:
            errors.append({"vehicle_id":target.get("vehicle_id"),"target_domain":target.get("target_domain"),"query":target["query"],"status":exc.code,"error":exc.read().decode("utf-8",errors="replace")[:500]}); continue
        except Exception as exc:
            errors.append({"vehicle_id":target.get("vehicle_id"),"target_domain":target.get("target_domain"),"query":target["query"],"error":str(exc)}); continue

        ranked = []
        for result in response.get("web", {}).get("results", []):
            url = str(result.get("url") or "")
            source_type, source_domain = registered_source(url, registry), registered_domain(url, registry)
            if source_type not in ALLOWED_TYPES or source_domain != target.get("target_domain"):
                continue
            score = relevance_score(target, result, registry)
            text = " ".join([str(result.get("title") or ""), str(result.get("description") or ""), " ".join(str(x) for x in (result.get("extra_snippets") or []))])
            ranked.append((score, result, source_type, source_domain, extract_pcd(text)))
        ranked.sort(key=lambda x: x[0], reverse=True)
        result_items = []
        for score, result, source_type, source_domain, pcd_values in ranked[:3]:
            result_items.append({"title":result.get("title"),"url":result.get("url"),"source_type":source_type,"source_domain":source_domain,"snippet":result.get("description"),"pcd_values_found":pcd_values,"relevance_score":score})
            if score < 3:
                continue
            for value in pcd_values:
                evidence_candidates.append({
                    "vehicle_id":target.get("vehicle_id"),"search_id":target.get("search_id"),"maker":target.get("maker"),"model":target.get("model"),"generation":target.get("generation"),
                    "field":"pcd","candidate_value":value,"source_type":source_type,"source_url":result.get("url"),"source_title":result.get("title"),"source_domain":source_domain,
                    "search_engine":"brave","target_reason":target.get("reason"),"relevance_score":score,
                })
        searches.append({**target, "results": result_items})
        if index < len(targets): time.sleep(0.12)

    pool = merge_candidate_pool(evidence_candidates, registry)
    confirmed, conflicts = build_confirmed(pool)
    REPORTS.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version":"1.1.0","dataset":"brave_vehicle_research","production_master_write":False,
        "policy":{"role":"independent_second_source_search","one_source_priority":True,"vehicle_specific_page_priority":True,"official_registered_domains_only":True,"different_domain_priority":True,"search_engine_independence_does_not_count_as_source_independence":True,"auto_confirmation_requires_two_independent_registered_domains_same_value":True,"conflict_blocks_auto_confirmation":True,"no_guessing":True},
        "query_count":len(targets),"search_success_count":len(searches),"candidate_value_count":len(evidence_candidates),"persistent_candidate_count":len(pool),"auto_confirmed_count":len(confirmed),"conflict_count":len(conflicts),"error_count":len(errors),
        "searches":searches,"evidence_candidates":evidence_candidates,"errors":errors,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    lines=["# 第2根拠探索（Brave Search v1.7）","",f"- 検索実行: {len(targets)}件",f"- 正常検索: {len(searches)}件",f"- 今回のPCD候補値: {len(evidence_candidates)}件",f"- 累積候補: {len(pool)}件",f"- 2独立公式ドメイン一致: {len(confirmed)}件",f"- 競合: {len(conflicts)}件",f"- エラー: {len(errors)}件","- 1ソース取得済み車種を最優先し、メーカー別の車種適合・マッチングページを狙います。","- 商品・ニュース等の汎用ページは優先度を下げます。"]
    OUT_MD.write_text("\n".join(lines)+"\n", encoding="utf-8")
    print(json.dumps({"query_count":len(targets),"search_success_count":len(searches),"candidate_value_count":len(evidence_candidates),"auto_confirmed_count":len(confirmed),"error_count":len(errors)},ensure_ascii=False,indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
