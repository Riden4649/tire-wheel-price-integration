#!/usr/bin/env python3
"""Collect official product-page/image URL candidates for wheel image_master."""

from __future__ import annotations
import json, os, re, sys, time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app/data/wheels/image_master.json"
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
UA = "Mozilla/5.0 (compatible; WheelImageResearch/1.0; +GitHubActions)"
TIMEOUT = 15

def norm(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z一-龥ぁ-んァ-ヶ]+", "", (s or "").upper())

def host_ok(url: str, domains: list[str]) -> bool:
    h = (urlparse(url).hostname or "").lower()
    return any(h == d or h.endswith("." + d) for d in domains)

def query_for(item: dict, domain: str | None = None) -> str:
    parts = [item.get("brand", ""), item.get("model", "")]
    if item.get("color_name"):
        parts.append(item["color_name"])
    elif item.get("color_code"):
        parts.append(item["color_code"])
    q = " ".join(x for x in parts if x).strip() + " アルミホイール"
    return f"site:{domain} {q}" if domain else q

def tavily_search(query: str, domains: list[str]) -> list[str]:
    key = os.getenv("TAVILY_API_KEY")
    if not key:
        return []
    try:
        r = requests.post("https://api.tavily.com/search", json={
            "api_key": key,
            "query": query,
            "search_depth": "advanced",
            "max_results": 6,
            "include_domains": domains,
        }, timeout=TIMEOUT)
        r.raise_for_status()
        return [x.get("url", "") for x in r.json().get("results", []) if x.get("url")]
    except Exception as e:
        print("Tavily:", e, file=sys.stderr)
        return []

def brave_search(query: str, domains: list[str]) -> list[str]:
    key = os.getenv("BRAVE_SEARCH_API_KEY")
    if not key:
        return []
    try:
        r = requests.get(
            "https://api.search.brave.com/res/v1/web/search",
            headers={"Accept": "application/json", "X-Subscription-Token": key},
            params={"q": query, "count": 8, "search_lang": "ja", "country": "JP"},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        urls = [x.get("url", "") for x in r.json().get("web", {}).get("results", []) if x.get("url")]
        return [u for u in urls if host_ok(u, domains)]
    except Exception as e:
        print("Brave:", e, file=sys.stderr)
        return []

def page_candidate(url: str, item: dict, domains: list[str]) -> dict | None:
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
        if model and model not in hay:
            return None
        score = 60
        if brand and brand in hay:
            score += 15
        color = norm(item.get("color_name", "") or item.get("color_code", ""))
        if color and color in hay:
            score += 5
        image = ""
        meta = soup.find("meta", attrs={"property": "og:image"}) or soup.find("meta", attrs={"name": "twitter:image"})
        if meta and meta.get("content"):
            image = urljoin(r.url, meta["content"])
            score += 10
        if not image:
            for img in soup.find_all("img"):
                alt = norm(img.get("alt", ""))
                src = img.get("src") or img.get("data-src") or ""
                if src and ((model and model in alt) or (brand and model and brand in alt)):
                    image = urljoin(r.url, src)
                    score += 7
                    break
        return {"product_url": r.url, "image_url": image, "score": score, "title": title}
    except Exception as e:
        print("Page:", url, e, file=sys.stderr)
        return None

def main():
    d = json.loads(MASTER.read_text(encoding="utf-8"))
    items = d["items"]
    limit = int(os.getenv("WHEEL_IMAGE_MAX_ITEMS", "12"))
    targets = [x for x in items if x.get("active", True) and x.get("image_status") in ("missing", "retry")][:limit]
    report = []
    for i, item in enumerate(targets, 1):
        maker = item.get("maker", "")
        domains = OFFICIAL_DOMAINS.get(maker, [])
        row = {"image_key": item["image_key"], "maker": maker, "status": "unsupported_maker", "candidates": []}
        if not domains:
            report.append(row)
            continue
        urls = []
        for domain in domains:
            q = query_for(item, domain)
            urls += tavily_search(q, domains)
            urls += brave_search(q, domains)
        urls = list(dict.fromkeys(urls))[:12]
        candidates = []
        for u in urls:
            c = page_candidate(u, item, domains)
            if c:
                candidates.append(c)
        candidates.sort(key=lambda x: x["score"], reverse=True)
        row["candidates"] = candidates[:3]
        if candidates:
            best = candidates[0]
            item["product_url"] = best["product_url"]
            item["image_url"] = best["image_url"]
            item["image_status"] = "candidate" if best["image_url"] else "page_verified"
            item["notes"] = f"auto candidate score={best['score']} title={best['title'][:120]}"
            row["status"] = item["image_status"]
        else:
            item["notes"] = "official candidate not found in this run"
            row["status"] = "not_found"
        report.append(row)
        print(f"[{i}/{len(targets)}] {item['image_key']}: {row['status']}")
        time.sleep(0.3)
    d["updated_at"] = time.strftime("%Y-%m-%d")
    MASTER.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps({"processed": len(targets), "results": report}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# ホイール画像自動収集レポート",
        "",
        f"- 処理対象: {len(targets)}件",
        f"- 候補/ページ確認: {sum(r['status'] in ('candidate', 'page_verified') for r in report)}件",
        f"- 未発見: {sum(r['status'] == 'not_found' for r in report)}件",
        f"- メーカー未対応: {sum(r['status'] == 'unsupported_maker' for r in report)}件",
        "",
    ]
    for r in report:
        lines.append(f"- `{r['image_key']}`: **{r['status']}**")
        if r["candidates"]:
            lines.append(f"  - {r['candidates'][0]['product_url']}")
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
