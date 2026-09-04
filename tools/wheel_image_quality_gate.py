#!/usr/bin/env python3
"""Quality gate for wheel-image candidates.

Keeps collection speed high, but feeds QA accuracy back into the next search strategy.
Obvious wrong-category candidates are returned to retry instead of being treated as wins.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app/data/wheels/image_master.json"
STATE = ROOT / "app/data/wheels/search_strategy.json"
RESEARCH = ROOT / "reports/wheel-image-research.json"
REPORT_JSON = ROOT / "reports/wheel-image-quality.json"
REPORT_MD = ROOT / "reports/wheel-image-quality.md"

MIN_QA_PASS_RATE = 0.65
HIGH_QA_PASS_RATE = 0.85
LOW_HIT_RATE = 0.25
HIGH_HIT_RATE = 0.45
MAX_STRATEGY_LEVEL = 3

NEGATIVE_RE = re.compile(
    r"(二輪|バイク|motorcycle|battlax|racing battlax|motorsport|anniversary|"
    r"/products/tire/mc/|/tire/mc/|タイヤサイズ|サイズから選ぶ)",
    re.I,
)
GENERIC_IMAGE_RE = re.compile(
    r"(?:^|[/_.-])(logo|ogp|og_image|banner|favicon|icon|site[-_]?logo)(?:[/_.-]|$)",
    re.I,
)
WHEEL_POSITIVE_RE = re.compile(
    r"(ホイール|wheel|aluminium|aluminum|eco.?forme|balminum|prodita|keeler|tirado|lf.?sport)",
    re.I,
)


def load(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def norm(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z一-龥ぁ-んァ-ヶ]+", "", (s or "").upper())


def assess(item: dict) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    product_url = item.get("product_url", "") or ""
    image_url = item.get("image_url", "") or ""
    notes = item.get("notes", "") or ""
    title = notes.split("title=", 1)[-1] if "title=" in notes else notes
    combined = " ".join((product_url, image_url, title))

    if NEGATIVE_RE.search(combined):
        reasons.append("wrong_category")

    path = urlparse(image_url).path.lower() if image_url else ""
    if image_url and GENERIC_IMAGE_RE.search(path):
        reasons.append("generic_site_image")

    model = norm(item.get("model", ""))
    image_path_norm = norm(path)
    title_norm = norm(title)
    positive = bool(WHEEL_POSITIVE_RE.search(combined))
    model_signal = bool(model and (model in image_path_norm or model in title_norm))

    # A candidate image should have either a wheel-domain signal or a model signal.
    # page_verified may have no image, but still needs a wheel-relevant page.
    if item.get("image_status") == "candidate" and not (positive or model_signal):
        reasons.append("weak_wheel_relevance")
    if item.get("image_status") == "page_verified" and not positive:
        reasons.append("weak_page_relevance")

    return (len(reasons) == 0, reasons)


def main() -> int:
    master = load(MASTER, {"items": []})
    state = load(STATE, {"schema_version": "1.0", "strategy_level": 0, "history": []})
    research = load(RESEARCH, {"results": [], "hit_rate": 0.0})

    latest_keys = {r.get("image_key") for r in research.get("results", []) if r.get("image_key")}
    assessed = passed = rejected = 0
    rejected_rows = []

    for item in master.get("items", []):
        if latest_keys and item.get("image_key") not in latest_keys:
            continue
        if item.get("image_status") not in ("candidate", "page_verified"):
            continue
        assessed += 1
        ok, reasons = assess(item)
        if ok:
            passed += 1
            continue

        rejected += 1
        rejected_rows.append({
            "image_key": item.get("image_key"),
            "model": item.get("model"),
            "reasons": reasons,
            "product_url": item.get("product_url", ""),
            "image_url": item.get("image_url", ""),
        })
        item["product_url"] = ""
        item["image_url"] = ""
        item["image_status"] = "retry"
        item["offline_cache_allowed"] = False
        item["local_path"] = ""
        item["notes"] = "qa_rejected:" + ",".join(reasons)

    qa_pass_rate = (passed / assessed) if assessed else 1.0
    hit_rate = float(research.get("hit_rate", 0.0) or 0.0)
    current_level = max(0, min(MAX_STRATEGY_LEVEL, int(state.get("strategy_level", 0))))
    next_level = current_level
    action = "hold"

    # Two-axis control: recovery rate may widen search only when QA quality is healthy.
    # Poor QA immediately tightens search, preventing false progress from broad queries.
    if assessed and qa_pass_rate < MIN_QA_PASS_RATE:
        next_level = max(0, current_level - 1)
        action = "tighten_due_to_low_qa"
    elif hit_rate < LOW_HIT_RATE and qa_pass_rate >= HIGH_QA_PASS_RATE:
        next_level = min(MAX_STRATEGY_LEVEL, current_level + 1)
        action = "widen_due_to_low_hit_high_qa"
    elif hit_rate >= HIGH_HIT_RATE and qa_pass_rate >= HIGH_QA_PASS_RATE:
        next_level = max(0, current_level - 1)
        action = "tighten_after_healthy_run"

    qh = state.get("quality_history", [])
    qh.append({
        "date": time.strftime("%Y-%m-%d"),
        "assessed": assessed,
        "passed": passed,
        "rejected": rejected,
        "qa_pass_rate": round(qa_pass_rate, 4),
        "hit_rate": round(hit_rate, 4),
        "strategy_before_quality_gate": current_level,
        "strategy_after_quality_gate": next_level,
        "action": action,
    })
    state["quality_history"] = qh[-10:]
    state["strategy_level"] = next_level
    state["quality_threshold"] = MIN_QA_PASS_RATE
    state["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")

    MASTER.write_text(json.dumps(master, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    payload = {
        "assessed": assessed,
        "passed": passed,
        "rejected": rejected,
        "qa_pass_rate": round(qa_pass_rate, 4),
        "research_hit_rate": round(hit_rate, 4),
        "strategy_before": current_level,
        "strategy_after": next_level,
        "action": action,
        "rejected_items": rejected_rows,
    }
    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# ホイール画像 Quality Gate",
        "",
        f"- QA対象: {assessed}件",
        f"- QA通過: {passed}件",
        f"- QA除外: {rejected}件",
        f"- QA通過率: {qa_pass_rate:.1%}",
        f"- 収集回収率: {hit_rate:.1%}",
        f"- 検索戦略: S{current_level} → S{next_level}",
        f"- 制御: {action}",
        "",
        "## 除外候補",
    ]
    for r in rejected_rows[:30]:
        lines.append(f"- `{r['image_key']}`: {', '.join(r['reasons'])}")
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
