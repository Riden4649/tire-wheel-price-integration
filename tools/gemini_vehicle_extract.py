#!/usr/bin/env python3
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from tavily_vehicle_research import (
    AUTO_POOL,
    REGISTRY,
    build_confirmed,
    load,
    merge_candidate_pool,
    registered_domain,
    registered_source,
)

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
UPDATES = ROOT / "app" / "data" / "vehicle-updates"
TAVILY_REPORT = REPORTS / "tavily-search-results.json"
BRAVE_REPORT = REPORTS / "brave-search-results.json"
OUT_JSON = REPORTS / "gemini-structured-extraction.json"
OUT_MD = REPORTS / "gemini-structured-extraction.md"
PERSISTENT = UPDATES / "auto-structured-evidence.json"

JST = timezone(timedelta(hours=9))
DEFAULT_MODEL = "gemini-3.5-flash-lite"
FALLBACK_MODEL = "gemini-3.1-flash-lite"
DEFAULT_MAX_URLS = 8
ALLOWED_TYPES = {"manufacturer_official", "wheel_manufacturer_official"}
RETRYABLE_HTTP = {429, 500, 502, 503, 504}


def now_jst():
    return datetime.now(JST).replace(microsecond=0).isoformat()


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def result_urls_from_report(path):
    data = load(path, {}) if path.exists() else {}
    out = []
    for search in data.get("searches", []):
        vehicle = {
            "vehicle_id": search.get("vehicle_id"),
            "search_id": search.get("search_id"),
            "maker": search.get("maker"),
            "model": search.get("model"),
            "generation": search.get("generation"),
        }
        for result in search.get("results", []):
            url = result.get("url")
            if url:
                out.append({**vehicle, "url": url, "title": result.get("title")})
    return out


def pool_urls():
    data = load(AUTO_POOL, {"records": []})
    out = []
    for item in data.get("records", []):
        url = item.get("source_url")
        if not url:
            continue
        out.append({
            "vehicle_id": item.get("vehicle_id"),
            "search_id": item.get("search_id"),
            "maker": item.get("maker"),
            "model": item.get("model"),
            "generation": item.get("generation"),
            "url": url,
            "title": item.get("source_title"),
        })
    return out


def build_targets(registry, max_urls):
    candidates = pool_urls() + result_urls_from_report(BRAVE_REPORT) + result_urls_from_report(TAVILY_REPORT)
    seen = set()
    targets = []
    for item in candidates:
        key = (item.get("vehicle_id"), item.get("url"))
        if not key[0] or not key[1] or key in seen:
            continue
        source_type = registered_source(item["url"], registry)
        source_domain = registered_domain(item["url"], registry)
        if source_type not in ALLOWED_TYPES or not source_domain:
            continue
        seen.add(key)
        targets.append({**item, "source_type": source_type, "source_domain": source_domain})
        if len(targets) >= max_urls:
            break
    return targets


def build_prompt(target):
    return f"""
You are extracting automotive fitment/service facts from ONE official webpage.
Target vehicle:
- maker: {target.get('maker')}
- model: {target.get('model')}
- generation/model code: {target.get('generation')}
- vehicle_id: {target.get('vehicle_id')}
Official URL to inspect: {target.get('url')}

Rules:
1. Use only facts explicitly supported by the provided URL. Do not use memory or general automotive knowledge.
2. If the page is for a different generation/model/grade and cannot safely support this target, set vehicle_identity_confirmed=false.
3. Never infer missing values. Use null.
4. Preserve PCD decimals such as 114.3 and thread pitch decimals such as 1.5 exactly.
5. Hub bore may be a number. Torque must be N-m representative value only when explicitly stated; if a range is explicit, also return min/max.
6. model_codes must contain only codes explicitly shown on the page.
7. Return ONE JSON object only, no markdown fences.

JSON shape:
{{
  "vehicle_identity_confirmed": true,
  "identity_reason": "short reason",
  "pcd": 114.3,
  "holes": 5,
  "hub_bore": 60.0,
  "thread_diameter": "M12",
  "thread_pitch": 1.5,
  "fastener": "nut or bolt or null",
  "wheel_torque_nm": 103,
  "wheel_torque_nm_min": null,
  "wheel_torque_nm_max": null,
  "model_codes": [],
  "generation_text": null,
  "explicit_evidence": {{
    "pcd": "short exact supporting phrase or null",
    "holes": "short exact supporting phrase or null",
    "hub_bore": "short exact supporting phrase or null",
    "thread": "short exact supporting phrase or null",
    "torque": "short exact supporting phrase or null",
    "identity": "short exact supporting phrase or null"
  }}
}}
""".strip()


def gemini_call_once(api_key, model, target):
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "contents": [{"parts": [{"text": build_prompt(target)}]}],
        "tools": [{"url_context": {}}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 1200},
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
            "User-Agent": "vehicle-db-growth-gemini/1.1",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=75) as response:
        payload = json.loads(response.read().decode("utf-8"))
    parts = (((payload.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
    text = "\n".join(str(p.get("text", "")) for p in parts if p.get("text"))
    metadata = (payload.get("candidates") or [{}])[0].get("urlContextMetadata") or {}
    return text, metadata, payload.get("usageMetadata") or {}


def gemini_call(api_key, primary_model, target):
    models = [primary_model]
    if FALLBACK_MODEL not in models:
        models.append(FALLBACK_MODEL)
    attempts = []
    last_exc = None
    for model_index, model in enumerate(models):
        for retry in range(3):
            try:
                text, metadata, usage = gemini_call_once(api_key, model, target)
                return text, metadata, usage, model, attempts
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")[:1000]
                attempts.append({"model": model, "retry": retry + 1, "status": exc.code, "error": detail})
                last_exc = RuntimeError(f"Gemini HTTP {exc.code}: {detail}")
                if exc.code not in RETRYABLE_HTTP:
                    break
                if retry < 2:
                    time.sleep(2 ** retry)
            except Exception as exc:
                attempts.append({"model": model, "retry": retry + 1, "error": str(exc)[:1000]})
                last_exc = exc
                break
        if model_index == 0:
            time.sleep(1)
    raise RuntimeError(str(last_exc) if last_exc else "Gemini call failed")


def parse_json_object(text):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def num(value, lo, hi, integer=False):
    if value is None or value == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if not (lo <= n <= hi):
        return None
    if integer:
        if abs(n - round(n)) > 1e-9:
            return None
        return int(round(n))
    return n


def normalize_extraction(raw):
    thread = raw.get("thread_diameter")
    if thread is not None:
        thread = str(thread).strip().upper()
        if not re.fullmatch(r"M\d+(?:\.\d+)?", thread):
            thread = None
    fastener = raw.get("fastener")
    if fastener is not None:
        fastener = str(fastener).strip().lower()
        if fastener not in {"nut", "bolt"}:
            fastener = None
    codes = raw.get("model_codes") if isinstance(raw.get("model_codes"), list) else []
    codes = [str(x).strip() for x in codes if str(x).strip()][:20]
    return {
        "vehicle_identity_confirmed": raw.get("vehicle_identity_confirmed") is True,
        "identity_reason": str(raw.get("identity_reason") or "")[:500],
        "pcd": num(raw.get("pcd"), 80, 200),
        "holes": num(raw.get("holes"), 3, 8, integer=True),
        "hub_bore": num(raw.get("hub_bore"), 40, 130),
        "thread_diameter": thread,
        "thread_pitch": num(raw.get("thread_pitch"), 0.5, 2.5),
        "fastener": fastener,
        "wheel_torque_nm": num(raw.get("wheel_torque_nm"), 50, 250),
        "wheel_torque_nm_min": num(raw.get("wheel_torque_nm_min"), 50, 250),
        "wheel_torque_nm_max": num(raw.get("wheel_torque_nm_max"), 50, 250),
        "model_codes": codes,
        "generation_text": (str(raw.get("generation_text")).strip()[:300] if raw.get("generation_text") else None),
        "explicit_evidence": raw.get("explicit_evidence") if isinstance(raw.get("explicit_evidence"), dict) else {},
    }


def merge_structured(new_records):
    old = load(PERSISTENT, {"records": []}).get("records", []) if PERSISTENT.exists() else []
    merged = {}
    for item in old + new_records:
        key = (item.get("vehicle_id"), item.get("source_url"))
        if not all(key):
            continue
        previous = merged.get(key)
        if previous and previous.get("first_seen_at"):
            item["first_seen_at"] = previous["first_seen_at"]
        merged[key] = item
    records = sorted(merged.values(), key=lambda x: (x.get("vehicle_id", ""), x.get("source_domain", ""), x.get("source_url", "")))
    payload = {
        "schema_version": "1.1.0",
        "dataset": "auto_structured_vehicle_evidence",
        "updated_at": now_jst(),
        "policy": {
            "official_registered_domains_only": True,
            "gemini_output_is_candidate_not_truth": True,
            "missing_values_are_never_inferred": True,
            "production_write_for_non_pcd_fields": False,
            "pcd_still_requires_two_independent_official_domains_same_value": True,
            "temporary_api_errors_retry_then_free_tier_fallback": True,
        },
        "record_count": len(records),
        "records": records,
    }
    write_json(PERSISTENT, payload)
    return records


def main():
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("GEMINI_API_KEY is not configured", file=sys.stderr)
        return 2
    model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    max_urls = max(1, min(int(os.environ.get("GEMINI_MAX_URLS", DEFAULT_MAX_URLS)), 20))
    registry = load(REGISTRY, {})
    targets = build_targets(registry, max_urls)

    extracted = []
    pcd_candidates = []
    errors = []
    fallback_success_count = 0
    retry_attempt_count = 0
    for target in targets:
        try:
            text, url_metadata, usage, used_model, attempts = gemini_call(api_key, model, target)
            retry_attempt_count += len(attempts)
            if used_model != model:
                fallback_success_count += 1
            raw = parse_json_object(text)
            normalized = normalize_extraction(raw)
        except Exception as exc:
            errors.append({"vehicle_id": target.get("vehicle_id"), "url": target.get("url"), "error": str(exc)[:1200]})
            continue

        record = {
            **target,
            **normalized,
            "source_url": target.get("url"),
            "source_title": target.get("title"),
            "search_engine": "gemini_url_context",
            "gemini_model": used_model,
            "url_context_metadata": url_metadata,
            "usage_metadata": usage,
            "first_seen_at": now_jst(),
            "last_seen_at": now_jst(),
            "status": "candidate_only_needs_corroboration" if normalized["vehicle_identity_confirmed"] else "identity_not_confirmed_no_auto_use",
        }
        extracted.append(record)

        if normalized["vehicle_identity_confirmed"] and normalized.get("pcd") is not None:
            pcd_candidates.append({
                "vehicle_id": target.get("vehicle_id"),
                "search_id": target.get("search_id"),
                "maker": target.get("maker"),
                "model": target.get("model"),
                "generation": target.get("generation"),
                "field": "pcd",
                "candidate_value": normalized["pcd"],
                "source_type": target.get("source_type"),
                "source_url": target.get("url"),
                "source_title": target.get("title"),
                "source_domain": target.get("source_domain"),
                "search_engine": "gemini_url_context",
                "target_reason": "official_page_body_extraction",
            })

    structured_records = merge_structured(extracted)
    pool = merge_candidate_pool(pcd_candidates, registry)
    confirmed, conflicts = build_confirmed(pool)

    payload = {
        "schema_version": "1.1.0",
        "dataset": "gemini_vehicle_structured_extraction",
        "model": model,
        "fallback_model": FALLBACK_MODEL,
        "production_master_write": False,
        "url_count": len(targets),
        "successful_extractions": len(extracted),
        "identity_confirmed_count": sum(1 for x in extracted if x.get("vehicle_identity_confirmed")),
        "pcd_candidates_added": len(pcd_candidates),
        "persistent_structured_records": len(structured_records),
        "persistent_pcd_candidates": len(pool),
        "auto_confirmed_pcd_count": len(confirmed),
        "pcd_conflict_count": len(conflicts),
        "retry_attempt_count": retry_attempt_count,
        "fallback_success_count": fallback_success_count,
        "error_count": len(errors),
        "records": extracted,
        "errors": errors,
    }
    write_json(OUT_JSON, payload)

    lines = [
        "# Gemini 公式ページ構造化抽出",
        "",
        f"- 主モデル: {model}",
        f"- フォールバック: {FALLBACK_MODEL}",
        f"- URL解析: {len(targets)}件",
        f"- 抽出成功: {len(extracted)}件",
        f"- 車種同一性確認: {payload['identity_confirmed_count']}件",
        f"- PCD候補追加: {len(pcd_candidates)}件",
        f"- 累積構造化候補: {len(structured_records)}件",
        f"- 2独立公式ドメイン一致PCD: {len(confirmed)}件",
        f"- PCD競合: {len(conflicts)}件",
        f"- API再試行: {retry_attempt_count}回",
        f"- フォールバック成功: {fallback_success_count}件",
        f"- 最終エラー: {len(errors)}件",
        "- Gemini抽出値だけでは本番確定しません。PCDは従来どおり独立公式2ドメイン一致が必須です。",
        "- 穴数・ハブ径・ネジ・トルク等は現段階では候補保存のみで、本番自動反映しません。",
        "",
        "## 今回の抽出",
    ]
    if extracted:
        for item in extracted[:20]:
            vals = []
            for field in ["pcd", "holes", "hub_bore", "thread_diameter", "thread_pitch", "wheel_torque_nm"]:
                if item.get(field) is not None:
                    vals.append(f"{field}={item.get(field)}")
            lines.append(f"- {item.get('maker')} {item.get('model')} {item.get('generation') or ''} / {item.get('source_domain')} / {item.get('gemini_model')}: " + (", ".join(vals) if vals else "明示値なし"))
    else:
        lines.append("- 抽出なし")
    if errors:
        lines.extend(["", "## 最終エラー"])
        for err in errors[:10]:
            lines.append(f"- {err.get('vehicle_id')}: {err.get('error', '')[:300]}")
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(json.dumps({
        "url_count": len(targets),
        "successful_extractions": len(extracted),
        "identity_confirmed_count": payload["identity_confirmed_count"],
        "pcd_candidates_added": len(pcd_candidates),
        "auto_confirmed_pcd_count": len(confirmed),
        "pcd_conflict_count": len(conflicts),
        "retry_attempt_count": retry_attempt_count,
        "fallback_success_count": fallback_success_count,
        "error_count": len(errors),
    }, ensure_ascii=False, indent=2))

    # If Gemini is completely unavailable for a non-empty target set, fail visibly so
    # the workflow cannot silently continue as if the extraction layer were healthy.
    if targets and not extracted and errors:
        print("Gemini extraction unavailable for all targets; stopping before production apply.", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
