#!/usr/bin/env python3
import json, sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / "app/data/wheels/image_master.json"
d = json.loads(p.read_text(encoding="utf-8"))
items = d.get("items", [])
errors = []
keys = set()
allowed_status = {"missing", "retry", "candidate", "page_verified", "verified", "blocked"}

for n, x in enumerate(items, 1):
    k = x.get("image_key")
    if not k:
        errors.append(f"{n}: image_key missing")
    elif k in keys:
        errors.append(f"duplicate image_key: {k}")
    keys.add(k)
    if not x.get("maker") or not x.get("brand") or not x.get("model"):
        errors.append(f"{k}: maker/brand/model missing")
    if x.get("image_status") not in allowed_status:
        errors.append(f"{k}: invalid image_status={x.get('image_status')}")
    for field in ("product_url", "image_url"):
        u = x.get(field, "")
        if u and urlparse(u).scheme not in ("http", "https"):
            errors.append(f"{k}: invalid {field}")

    allowed = x.get("offline_cache_allowed")
    if allowed is not None and not isinstance(allowed, bool):
        errors.append(f"{k}: offline_cache_allowed must be boolean")

    local_path = x.get("local_path", "")
    if local_path:
        if not local_path.startswith("app/assets/wheels/") or not local_path.endswith(".webp"):
            errors.append(f"{k}: invalid local_path")
        local_file = ROOT / local_path
        if not local_file.exists():
            errors.append(f"{k}: local thumbnail missing: {local_path}")
        if not x.get("local_sha256"):
            errors.append(f"{k}: local_sha256 missing")
        if not isinstance(x.get("local_bytes"), int) or x.get("local_bytes", 0) <= 0:
            errors.append(f"{k}: invalid local_bytes")

print(f"wheel image QA: {len(items)} items / {len(errors)} errors")
if errors:
    print("\n".join(errors))
    sys.exit(1)
