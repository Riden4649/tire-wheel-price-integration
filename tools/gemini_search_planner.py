#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

from tavily_vehicle_research import REGISTRY, load, source_domains

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
TAVILY_REPORT = REPORTS / "tavily-search-results.json"
OUT_JSON = REPORTS / "gemini-search-plan.json"
OUT_MD = REPORTS / "gemini-search-plan.md"
DEFAULT_MODEL = "gemini-3.5-flash-lite"
FALLBACK_MODEL = "gemini-3.1-flash-lite"
DEFAULT_MAX_VEHICLES = 6


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clean_json(text):
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def call_gemini(api_key, model, prompt):
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 1800},
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
            "User-Agent": "vehicle-db-growth-search-planner/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    parts = (((payload.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
    return "\n".join(str(p.get("text", "")) for p in parts if p.get("text"))


def build_prompt(search, official_domains):
    snippets = []
    for r in search.get("results", [])[:8]:
        snippets.append({
            "title": r.get("title"),
            "url": r.get("url"),
            "snippet": (r.get("snippet") or "")[:700],
            "source_type": r.get("source_type"),
            "pcd_values_found": r.get("pcd_values_found") or [],
        })
    return f"""
You are a search-strategy planner for a Japanese vehicle fitment database.
The web results below are HINTS ONLY. They are not proof and must never be treated as confirmed data.
Use them only to generate better searches for official manufacturer/wheel-maker pages.

Target:
- vehicle_id: {search.get('vehicle_id')}
- maker: {search.get('maker')}
- model: {search.get('model')}
- generation: {search.get('generation')}
- existing official domains: {search.get('existing_official_domains') or []}

Registered official domains that may be searched:
{json.dumps(official_domains, ensure_ascii=False)}

Broad web snippets:
{json.dumps(snippets, ensure_ascii=False)}

Return ONE JSON object only:
{{
  "model_code_hints": ["codes explicitly suggested by snippets only"],
  "pcd_hints": [114.3],
  "generation_hints": ["short hint strings"],
  "useful_terms": ["fitment search terms"],
  "official_queries": [
    {{"domain":"work-wheels.co.jp","query":"site:work-wheels.co.jp ...","reason":"why this is promising"}}
  ],
  "confidence_as_search_hint": "low|medium|high"
}}
Rules:
- Never claim a value is true; all values are search hints.
- Prefer vehicle model codes, generation identifiers, drivetrain terms, and likely PCD tokens that can sharpen search.
- Prefer official queries against domains different from existing official domains.
- Include Japanese and model-code variants when useful.
- Do not invent model codes absent from the snippets or target metadata.
- Maximum 8 official_queries.
""".strip()


def main():
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("GEMINI_API_KEY is not configured", file=sys.stderr)
        return 2
    if not TAVILY_REPORT.exists():
        print("tavily-search-results.json not found", file=sys.stderr)
        return 2

    model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    max_vehicles = max(1, min(int(os.environ.get("GEMINI_PLAN_MAX_VEHICLES", DEFAULT_MAX_VEHICLES)), 12))
    registry = load(REGISTRY, {})
    official = source_domains(registry)
    report = load(TAVILY_REPORT, {})
    searches = report.get("searches", [])

    # First prioritize one-source vehicles, then searches with the richest broad-web result set.
    searches = sorted(
        searches,
        key=lambda x: (
            1 if len(x.get("existing_official_domains") or []) == 1 else 0,
            len(x.get("results") or []),
        ),
        reverse=True,
    )[:max_vehicles]

    plans = []
    errors = []
    fallback_count = 0
    for search in searches:
        prompt = build_prompt(search, official)
        raw = None
        used_model = model
        try:
            raw = call_gemini(api_key, model, prompt)
        except Exception as exc:
            if FALLBACK_MODEL == model:
                errors.append({"vehicle_id": search.get("vehicle_id"), "error": str(exc)[:800]})
                continue
            try:
                raw = call_gemini(api_key, FALLBACK_MODEL, prompt)
                used_model = FALLBACK_MODEL
                fallback_count += 1
            except Exception as exc2:
                errors.append({"vehicle_id": search.get("vehicle_id"), "error": str(exc2)[:800]})
                continue
        try:
            plan = clean_json(raw)
        except Exception as exc:
            errors.append({"vehicle_id": search.get("vehicle_id"), "error": f"invalid planner JSON: {exc}"})
            continue
        if not isinstance(plan, dict):
            continue
        queries = []
        for q in plan.get("official_queries") or []:
            if not isinstance(q, dict):
                continue
            domain = str(q.get("domain") or "").strip().lower()
            query = str(q.get("query") or "").strip()
            if domain not in official or not query:
                continue
            queries.append({"domain": domain, "query": query[:500], "reason": str(q.get("reason") or "")[:300]})
        plans.append({
            "vehicle_id": search.get("vehicle_id"),
            "search_id": search.get("search_id"),
            "maker": search.get("maker"),
            "model": search.get("model"),
            "generation": search.get("generation"),
            "existing_official_domains": search.get("existing_official_domains") or [],
            "model_code_hints": (plan.get("model_code_hints") or [])[:20],
            "pcd_hints": (plan.get("pcd_hints") or [])[:10],
            "generation_hints": (plan.get("generation_hints") or [])[:10],
            "useful_terms": (plan.get("useful_terms") or [])[:15],
            "official_queries": queries[:8],
            "confidence_as_search_hint": plan.get("confidence_as_search_hint"),
            "gemini_model": used_model,
            "status": "search_hint_only_not_evidence",
        })

    payload = {
        "schema_version": "1.0.0",
        "dataset": "gemini_web_hint_search_plan",
        "policy": {
            "web_snippets_are_hint_only": True,
            "planner_output_is_not_evidence": True,
            "official_sources_required_for_confirmation": True,
            "prefer_second_independent_official_domain": True,
        },
        "vehicle_count": len(searches),
        "plan_count": len(plans),
        "fallback_count": fallback_count,
        "error_count": len(errors),
        "plans": plans,
        "errors": errors,
    }
    write_json(OUT_JSON, payload)

    lines = [
        "# Gemini 検索戦略プラン",
        "",
        f"- 対象車種: {len(searches)}件",
        f"- 作成成功: {len(plans)}件",
        f"- フォールバック: {fallback_count}件",
        f"- エラー: {len(errors)}件",
        "- 広いWeb情報は探索ヒント専用で、DB確定根拠には使いません。",
        "",
    ]
    for p in plans:
        lines.append(f"- {p.get('maker')} {p.get('model')} {p.get('generation') or ''}: 型式ヒント={p.get('model_code_hints') or []} / 公式検索={len(p.get('official_queries') or [])}件")
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"plan_count": len(plans), "error_count": len(errors)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
