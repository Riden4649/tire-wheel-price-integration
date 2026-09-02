from __future__ import annotations

import hashlib
import io
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from PIL import Image

MASTER = Path("app/data/wheels/image_master.json")
OUT_DIR = Path("app/assets/wheels")
REPORT = Path("reports/wheel-thumbnail-cache.json")
MAX_ITEMS = int(os.getenv("WHEEL_THUMBNAIL_MAX_ITEMS", "20"))
MAX_BYTES = 5 * 1024 * 1024
MAX_SIDE = int(os.getenv("WHEEL_THUMBNAIL_MAX_SIDE", "480"))
QUALITY = int(os.getenv("WHEEL_THUMBNAIL_QUALITY", "78"))

OFFICIAL_DOMAINS = {
    "BRIDGESTONE": ("bridgestone.co.jp", "tire.bridgestone.co.jp"),
    "ｳｪｯｽﾞ": ("weds.co.jp",),
    "WEDS": ("weds.co.jp",),
    "ﾎｯﾄｽﾀｯﾌ": ("hotstuff-cp.co.jp",),
    "HOT STUFF": ("hotstuff-cp.co.jp",),
    "ﾏﾙｶｻｰﾋﾞｽ": ("mid-wheels.com", "marukaservice.com"),
    "MARUKA": ("mid-wheels.com", "marukaservice.com"),
    "ﾄﾋﾟｰ実業": ("topy-ep.co.jp", "topy.co.jp"),
    "TOPPY": ("topy-ep.co.jp", "topy.co.jp"),
    "ABE": ("abe-shokai.co.jp",),
    "ｼﾞｬﾊﾟﾝ三陽": ("japansanyo.co.jp",),
}


def host_allowed(maker: str, url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    allowed = OFFICIAL_DOMAINS.get(maker, ())
    return bool(host and allowed and any(host == d or host.endswith("." + d) for d in allowed))


def safe_name(image_key: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", image_key).strip("-")
    return (name or hashlib.sha1(image_key.encode("utf-8")).hexdigest()) + ".webp"


def download_image(url: str) -> bytes:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; WheelImageCache/1.0)"}
    with requests.get(url, headers=headers, timeout=25, stream=True, allow_redirects=True) as r:
        r.raise_for_status()
        ctype = (r.headers.get("content-type") or "").lower()
        if not ctype.startswith("image/"):
            raise ValueError(f"not image content-type: {ctype}")
        buf = bytearray()
        for chunk in r.iter_content(64 * 1024):
            if not chunk:
                continue
            buf.extend(chunk)
            if len(buf) > MAX_BYTES:
                raise ValueError("image too large")
        return bytes(buf)


def make_webp(raw: bytes, dest: Path) -> tuple[int, int, int, str]:
    with Image.open(io.BytesIO(raw)) as im:
        im.load()
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, format="WEBP", quality=QUALITY, method=6)
        width, height = im.size
    data = dest.read_bytes()
    return width, height, len(data), hashlib.sha256(data).hexdigest()


def main() -> None:
    data = json.loads(MASTER.read_text(encoding="utf-8"))
    items = data.get("items", [])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)

    processed = cached = skipped = failed = 0
    details = []

    for item in items:
        # Keep the permission state explicit in the master for humans, app code and GitHub diffs.
        item.setdefault("offline_cache_allowed", False)
        item.setdefault("local_path", "")
        if processed >= MAX_ITEMS:
            continue
        if not item.get("active", True):
            continue
        if not item.get("image_url"):
            continue
        if item.get("local_path") and Path(item["local_path"]).exists():
            continue
        # Safety: re-host/cache only after an explicit per-item permission decision.
        if item.get("offline_cache_allowed") is not True:
            skipped += 1
            continue
        maker = str(item.get("maker", ""))
        image_url = str(item.get("image_url", ""))
        if not host_allowed(maker, image_url):
            failed += 1
            details.append({"image_key": item.get("image_key"), "result": "blocked_non_official_domain"})
            continue

        processed += 1
        try:
            raw = download_image(image_url)
            rel = Path("app/assets/wheels") / safe_name(str(item.get("image_key", "wheel")))
            width, height, size, sha = make_webp(raw, rel)
            item["local_path"] = rel.as_posix()
            item["local_format"] = "webp"
            item["local_width"] = width
            item["local_height"] = height
            item["local_bytes"] = size
            item["local_sha256"] = sha
            item["cached_at"] = datetime.now(timezone.utc).isoformat()
            cached += 1
            details.append({"image_key": item.get("image_key"), "result": "cached", "local_path": rel.as_posix(), "bytes": size})
        except Exception as exc:
            failed += 1
            details.append({"image_key": item.get("image_key"), "result": "failed", "error": str(exc)[:300]})

    data.setdefault("policy", {})["offline_thumbnail"] = {
        "format": "webp",
        "max_side": MAX_SIDE,
        "quality": QUALITY,
        "requires_offline_cache_allowed": True,
        "official_domain_only": True,
    }
    data["updated_at"] = datetime.now(timezone.utc).date().isoformat()
    MASTER.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report = {"processed": processed, "cached": cached, "skipped_permission": skipped, "failed": failed, "details": details}
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wheel thumbnail cache: cached={cached} skipped_permission={skipped} failed={failed}")


if __name__ == "__main__":
    main()
