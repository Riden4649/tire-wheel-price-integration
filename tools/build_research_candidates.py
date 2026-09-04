#!/usr/bin/env python3
import json, os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
QUEUE = REPORTS / "missing-data-queue.json"
OUT = REPORTS / "research-candidates.json"
MD = REPORTS / "research-candidates.md"

SOURCE_RULES = {
    "manufacturer_official": 100,
    "wheel_manufacturer_official": 90,
    "trusted_secondary": 70,
    "aggregator": 50,
}

FIELD_QUERIES = {
    "pcd": "PCD",
    "holes": "穴数 wheel bolt pattern",
    "hub_bore": "ハブ径 center bore",
    "fastener": "ホイール ナット ボルト 締結方式",
    "thread_diameter": "ホイールボルト ナット ねじ径",
    "thread_pitch": "ホイールボルト ナット ピッチ",
    "wheel_torque_nm": "ホイール ナット ボルト 締付トルク N·m",
    "year_from": "発売年月 型式",
    "year_to": "販売終了年月",
    "generation": "型式 世代",
}


def load(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def pcd_variants(maker: str, model: str, generation: str, level: int) -> list[str]:
    base = f"{maker} {model} {generation}".strip()
    out = []
    if level >= 1:
        out += [
            f"{base} ホイール PCD 穴数",
            f"{maker} {model} {generation} 型式 PCD",
            f"{maker} {model} {generation} ホイール 適合 マッチング",
        ]
    if level >= 2:
        out += [
            f"{base} 旧型 PCD カタログ PDF",
            f"{base} 生産終了 ホイール 適合",
            f"{base} archive PCD wheel",
            f"{maker} {model} {generation} 純正 ホイール サイズ PCD",
        ]
    # preserve order while removing duplicates/empty noise
    return list(dict.fromkeys(q.strip() for q in out if q.strip()))


def main():
    data = load(QUEUE)
    records = data.get("records", data if isinstance(data, list) else [])
    candidates = []
    mode = os.getenv("PCD_RESEARCH_MODE", "normal")
    try:
        variant_level = int(os.getenv("PCD_QUERY_VARIANT_LEVEL", "0"))
    except ValueError:
        variant_level = 0

    for item in records[:100]:
        maker = item.get("maker", "")
        model = item.get("model", "")
        generation = item.get("generation") or ""
        missing = item.get("missing_fields") or []
        queries = []
        for field in missing:
            term = FIELD_QUERIES.get(field, field)
            queries.append({
                "field": field,
                "query": f"{maker} {model} {generation} {term}".strip(),
                "preferred_sources": [
                    "manufacturer_official",
                    "wheel_manufacturer_official",
                    "trusted_secondary",
                ],
            })
            if field == "pcd" and variant_level > 0:
                for q in pcd_variants(maker, model, generation, variant_level):
                    queries.append({
                        "field": "pcd",
                        "query": q,
                        "preferred_sources": [
                            "manufacturer_official",
                            "wheel_manufacturer_official",
                            "trusted_secondary",
                        ],
                        "adaptive_variant": True,
                    })

        if item.get("status") == "search_only_unverified" and not queries:
            queries.append({
                "field": "fitment_seed",
                "query": f"{maker} {model} {generation} 型式 PCD 穴数 ハブ径 純正タイヤ ホイール".strip(),
                "preferred_sources": [
                    "manufacturer_official",
                    "wheel_manufacturer_official",
                    "trusted_secondary",
                ],
            })

        candidates.append({
            "vehicle_id": item.get("vehicle_id"),
            "search_id": item.get("search_id"),
            "maker": maker,
            "model": model,
            "generation": generation or None,
            "year_from": item.get("year_from"),
            "year_to": item.get("year_to"),
            "priority_score": item.get("priority_score", 0),
            "status": item.get("status"),
            "missing_fields": missing,
            "research_queries": queries,
            "research_mode": mode,
            "query_variant_level": variant_level,
            "acceptance_policy": {
                "auto_confirm": "manufacturer official source, or two trusted independent sources that agree",
                "conflict": "human_review_required",
                "unknown": "keep_in_missing_queue_and_notify_user",
                "no_guessing": True,
            },
            "source_weights": SOURCE_RULES,
        })

    payload = {
        "schema_version": "1.1.0",
        "dataset": "vehicle_research_candidates",
        "candidate_count": len(candidates),
        "research_mode": mode,
        "query_variant_level": variant_level,
        "policy": {
            "official_first": True,
            "cross_check_required_for_non_official": True,
            "conflicts_require_human_review": True,
            "production_master_write": False,
        },
        "records": candidates,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Vehicle Research Candidates", "",
        f"- Candidates: {len(candidates)}",
        f"- Adaptive mode: {mode} / variant level {variant_level}",
        "- Production master is not modified by this step.", "", "## Top 20"
    ]
    for c in candidates[:20]:
        fields = ", ".join(c["missing_fields"]) or "fitment_seed"
        lines.append(f"- {c['priority_score']:>3} | {c['maker']} {c['model']} {c.get('generation') or ''} | {fields}")
    MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"candidate_count": len(candidates), "mode": mode, "variant_level": variant_level, "top": candidates[:5]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
