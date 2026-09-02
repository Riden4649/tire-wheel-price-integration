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

print(f"wheel image QA: {len(items)} items / {len(errors)} errors")
if errors:
    print("\n".join(errors))
    sys.exit(1)
