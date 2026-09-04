#!/usr/bin/env python3
"""Collect official wheel image candidates with an adaptive recovery loop."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app/data/wheels/image_master.json"
STATE = ROOT / "app/data/wheels/search_strategy.json"
REPORT_JSON = ROOT / "reports/wheel-image-research.json"
REPORT_MD = ROOT / "reports/wheel-image-research.md"

OFFICIAL_DOMAINS = {
    "BRIDGESTONE": ["bridgestone.co.jp"],
    "ｳｪｯｽﾞ": ["weds.co.jp"],
    "ﾎｯﾄｽﾀｯﾌ": ["hotstuff-cp.co.jp"],
    "ﾄﾋﾟｰ実業": ["topy-ep.co.jp"],
    "ABE": ["abeshokai.jp"],
    "ﾏﾙｶｻｰﾋﾞｽ": ["marukaservice.com"],
}
UA = "Mozilla/5.0 (compatible; WheelImageResearch/1.2; +GitHubActions)"
TIMEOUT = 15
GENERIC_IMAGE_RE = re.compile(
    r"(?:^|[/_.-])(logo|ogp|banner|favicon|icon|site[-_]?logo)(?:[/_.-]|$)", re.I
)
RECOVERY_THRESHOLD = float(os.getenv("WHEEL_RECOVERY_THRESHOLD", "0.25"))
MAX_STRATEGY_LEVEL = 3
MAX_ADAPTIVE_PASSES = int(os.getenv("WHEEL_ADAPTIVE_PASSES", "3"))


def norm(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z一-龥ぁ-んァ-ヶ]+", "", (s or "").upper())


def host_ok(url: str, domains: list[str]) -> bool:
    h = (urlparse(url).hostname or "").lower()
    return any(h == d or h.endswith("." + d) for d in domains)


def image_url_is_generic(url: str) -> bool:
    if not url:
        return False
    return bool(GENERIC_IMAGE_RE.search(urlparse(url).path.lower()))


def load_state() -> dict:
    if STATE.exists():
        try:
            d = json.loads(STATE.read_text(encoding="utf-8"))
            if isinstance(d, dict):
                return d
        except Exception:
            pass
    return {"schema_version": "1.0", "strategy_level": 0, "history": []}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def query_variants(item: dict, domain: str, level: int) -> list[str]:
    brand = item.get("brand", "").strip()
    model = item.get("model", "").strip()
    color = (item.get("color_name") or item.get("color_code") or "").strip()
    maker = item.get("maker", "").strip()

    variants: list[str] = []
    if level <= 0:
        q = " ".join(x for x in (brand, model, color, "アルミホイール") if x)
        variants.append(f"site:{domain} {q}")
    elif level == 1:
        for tail in ("アルミホイール", "ホイール"):
            q = " ".join(x for x in (brand, model, tail) if x)
            variants.append(f"site:{domain} {q}")
        if color:
            variants.append(f"site:{domain} {model} {color} ホイール")
    elif level == 2:
        for q in (
            f"{brand} {model}",
            f"{model} ホイール",
            f"{maker} {model}",
            f'"{model}"',
        ):
            variants.append(f"site:{domain} {q.strip()}")
    else:
        # Final recovery mode: old/archived official pages are often indexed with
        # product name only, so search several archive-oriented expressions.
        for q in (
            f"{brand} {model}",
            f"{model} wheel",
            f"{model} ホイール 旧",
            f"{model} 生産終了",
            f"{model} archive",
        ):
            variants.append(f"site:{domain} {q.strip()}")
    return list(dict.fromkeys(v for v in variants if v.strip()))


def tavily_search(query: str, domains: list[str], level: int) -> list[str]:
    key = os.getenv("TAVILY_API_KEY")
    if not key:
        return []
    try:
        r = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": key,
                "query": query,
                "search_depth": "advanced",
                "max_results": 6 if level < 2 else 10,
                "include_domains": domains,
            },
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        return [x.get("url", "") for x in r.json().get("results", []) if x.get("url")]
    except Exception as e:
        print("Tavily:", e, file=sys.stderr)
        return []


def brave_search(query: str, domains: list[str], level: int) -> list[str]:
    key = os.getenv("BRAVE_SEARCH_API_KEY")
    if not key:
        return []
    try:
        r = requests.get(
            "https://api.search.brave.com/res/v1/web/search",
            headers={"Accept": "application/json", "X-Subscription-Token": key},
            params={
                "q": query,
                "count": 8 if level < 2 else 15,
                "search_lang": "ja",
                "country": "JP",
            },
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        urls = [
            x.get("url", "")
            for x in r.json().get("web", {}).get("results", [])
            if x.get("url")
        ]
        return [u for u in urls if host_ok(u, domains)]
    except Exception as e:
        print("Brave:", e, file=sys.stderr)
        return []


def page_candidate(url: str, item: dict, domains: list[str], level: int) -> dict | None:
    if not host_ok(url, domains):
        return None
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=TIMEOUT, allow_redirects=True)
        if not r.ok or "text/html" not in r.headers.get("content-type", ""):
            return None
        if not host_ok(r.url, domains):
            return None

        soup = BeautifulSoup(r.text, "html.parser")
        title = soup.title.get_text(" ", strip=True) if soup.title else ""
        text = soup.get_text(" ", strip=True)[:120000]
        hay = norm(title + " " + text)
        model = norm(item.get("model", ""))
        brand = norm(item.get("brand", ""))

        # Even in recovery mode, require the model somewhere on the official page.
        # This keeps the broader query from turning into unrelated-wheel collection.
        if model and model not in hay:
            return None

        score = 60
        if brand and brand in hay:
            score += 15
        color = norm(item.get("color_name", "") or item.get("color_code", ""))
        if color and color in hay:
            score += 5

        image = ""
        for img in soup.find_all("img"):
            alt = norm(img.get("alt", ""))
            src = img.get("src") or img.get("data-src") or ""
            if not src:
                continue
            image_candidate = urljoin(r.url, src)
            if image_url_is_generic(image_candidate):
                continue
            src_norm = norm(urlparse(image_candidate).path)
            if model and (model in alt or model in src_norm):
                image = image_candidate
                score += 12
                break

        if not image:
            meta = soup.find("meta", attrs={"property": "og:image"}) or soup.find(
                "meta", attrs={"name": "twitter:image"}
            )
            if meta and meta.get("content"):
                image_candidate = urljoin(r.url, meta["content"])
                if not image_url_is_generic(image_candidate):
                    image = image_candidate
                    score += 5

        # Recovery levels widen search, not acceptance. Candidate stays for QA.
        return {
            "product_url": r.url,
            "image_url": image,
            "score": score,
            "title": title,
            "strategy_level": level,
        }
    except Exception as e:
        print("Page:", url, e, file=sys.stderr)
        return None


def research_item(item: dict, level: int) -> dict:
    maker = item.get("maker", "")
    domains = OFFICIAL_DOMAINS.get(maker, [])
    row = {
        "image_key": item["image_key"],
        "maker": maker,
        "status": "unsupported_maker",
        "candidates": [],
        "strategy_level": level,
    }
    if not domains:
        return row

    urls: list[str] = []
    for domain in domains:
        for q in query_variants(item, domain, level):
            urls += tavily_search(q, domains, level)
            urls += brave_search(q, domains, level)
    max_urls = 12 if level < 2 else 24
    urls = list(dict.fromkeys(urls))[:max_urls]

    candidates = []
    for u in urls:
        c = page_candidate(u, item, domains, level)
        if c:
            candidates.append(c)
    candidates.sort(key=lambda x: x["score"], reverse=True)
    row["candidates"] = candidates[:3]

    if candidates:
        best = candidates[0]
        item["product_url"] = best["product_url"]
        item["image_url"] = best["image_url"]
        item["image_status"] = "candidate" if best["image_url"] else "page_verified"
        item["notes"] = (
            f"auto candidate score={best['score']} strategy={level} "
            f"title={best['title'][:120]}"
        )
        row["status"] = item["image_status"]
    else:
        item["notes"] = f"official candidate not found; strategy={level}"
        row["status"] = "not_found"
    return row


def hit_rate(rows: list[dict]) -> float:
    if not rows:
        return 0.0
    hits = sum(r["status"] in ("candidate", "page_verified") for r in rows)
    return hits / len(rows)


def main():
    d = json.loads(MASTER.read_text(encoding="utf-8"))
    items = d["items"]
    limit = int(os.getenv("WHEEL_IMAGE_MAX_ITEMS", "50"))
    state = load_state()
    start_level = max(0, min(MAX_STRATEGY_LEVEL, int(state.get("strategy_level", 0))))

    targets = [
        x
        for x in items
        if x.get("active", True)
        and x.get("image_status") in ("missing", "retry")
        and x.get("maker", "") in OFFICIAL_DOMAINS
    ][:limit]

    final_rows: dict[str, dict] = {}
    remaining = targets[:]
    level = start_level
    pass_summaries = []

    for pass_no in range(1, MAX_ADAPTIVE_PASSES + 1):
        if not remaining:
            break
        rows = []
        print(f"adaptive pass {pass_no}: strategy={level}, targets={len(remaining)}")
        for i, item in enumerate(remaining, 1):
            row = research_item(item, level)
            rows.append(row)
            final_rows[item["image_key"]] = row
            print(f"[{i}/{len(remaining)}] {item['image_key']}: {row['status']} (S{level})")
            time.sleep(0.08)

        rate = hit_rate(rows)
        pass_summaries.append(
            {"pass": pass_no, "strategy_level": level, "processed": len(rows), "hit_rate": round(rate, 4)}
        )

        failed_keys = {r["image_key"] for r in rows if r["status"] == "not_found"}
        remaining = [x for x in remaining if x["image_key"] in failed_keys]

        # Recovery loop: if the pass is weak, automatically relax the search for
        # only the misses. If yield is healthy, stop rather than spending API calls.
        if rate >= RECOVERY_THRESHOLD or level >= MAX_STRATEGY_LEVEL:
            break
        level += 1
        print(f"recovery rate {rate:.1%} < {RECOVERY_THRESHOLD:.0%}; switching to strategy {level}")

    report = list(final_rows.values())
    overall_rate = hit_rate(report)

    # Persist strategy learning across runs. Two poor recent runs push the next
    # scheduled run wider; healthy runs gradually return to precise search.
    history = state.get("history", [])
    history.append(
        {
            "date": time.strftime("%Y-%m-%d"),
            "processed": len(report),
            "hit_rate": round(overall_rate, 4),
            "start_level": start_level,
            "end_level": level,
        }
    )
    history = history[-10:]
    recent = [float(x.get("hit_rate", 0)) for x in history[-2:]]
    next_level = level
    if len(recent) >= 2 and all(r < RECOVERY_THRESHOLD for r in recent):
        next_level = min(MAX_STRATEGY_LEVEL, level + 1)
    elif overall_rate >= 0.45:
        next_level = max(0, level - 1)

    state.update(
        {
            "schema_version": "1.0",
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "strategy_level": next_level,
            "threshold": RECOVERY_THRESHOLD,
            "history": history,
        }
    )
    save_state(state)

    d["updated_at"] = time.strftime("%Y-%m-%d")
    MASTER.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    report_payload = {
        "processed": len(report),
        "hit_rate": round(overall_rate, 4),
        "start_strategy": start_level,
        "next_strategy": next_level,
        "passes": pass_summaries,
        "results": report,
    }
    REPORT_JSON.write_text(json.dumps(report_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    hits = sum(r["status"] in ("candidate", "page_verified") for r in report)
    misses = sum(r["status"] == "not_found" for r in report)
    lines = [
        "# ホイール画像自動収集レポート",
        "",
        f"- 処理対象: {len(report)}件",
        f"- 回収: {hits}件",
        f"- 回収率: {overall_rate:.1%}",
        f"- 未発見: {misses}件",
        f"- 開始検索戦略: S{start_level}",
        f"- 次回検索戦略: S{next_level}",
        "",
        "## 自動検索修正ループ",
    ]
    for p in pass_summaries:
        lines.append(
            f"- Pass {p['pass']}: S{p['strategy_level']} / {p['processed']}件 / 回収率 {p['hit_rate']:.1%}"
        )
    lines += ["", "## 結果"]
    for r in report:
        lines.append(f"- `{r['image_key']}`: **{r['status']}** (S{r['strategy_level']})")
        if r["candidates"]:
            lines.append(f"  - {r['candidates'][0]['product_url']}")
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
