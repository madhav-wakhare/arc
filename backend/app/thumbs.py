"""Small cached thumbnails: fetched once, shrunk to WebP and kept in DATA_DIR/thumbs."""

import hashlib
import io
import os
import threading
import urllib.request

from PIL import Image

from . import db
WIDTH = 640  # sharp on a 2x screen for cards up to 320px wide; about 20-40 KB each
MAX_BYTES = 8_000_000
_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()


def _dir() -> str:
    return os.path.join(db.DATA_DIR, "thumbs")


def _path(source: str) -> str:
    return os.path.join(_dir(), hashlib.sha1(source.encode()).hexdigest() + ".webp")


def get_first(sources: list[str]) -> str | None:
    """First source that downloads, for example YouTube's HD image and then its smaller ones."""
    for source in sources:
        if path := get(source):
            return path
    return None


def _crop_letterbox(img: Image.Image) -> Image.Image:
    """YouTube's 4:3 hq/sd thumbnails carry black bars; keep the 16:9 picture in the middle."""
    if abs(img.width / img.height - 4 / 3) > 0.02:
        return img
    h = round(img.width * 9 / 16)
    top = (img.height - h) // 2
    return img.crop((0, top, img.width, top + h))


def get(source: str) -> str | None:
    """Path of the cached thumbnail for this image URL, downloading it the first time. None on failure."""
    path = _path(source)
    if os.path.exists(path):
        return path
    with _guard:
        lock = _locks.setdefault(path, threading.Lock())
    with lock:  # two cards asking for the same image download it once
        if os.path.exists(path):
            return path
        try:
            req = urllib.request.Request(source, headers={"User-Agent": _UA, "Accept": "image/*"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw = resp.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                return None
            img = Image.open(io.BytesIO(raw))
            img.draft("RGB", (WIDTH * 2, WIDTH * 2))  # fast JPEG downscale while decoding
            img = img.convert("RGB")
            if "ytimg.com" in source:
                img = _crop_letterbox(img)
            if img.width > WIDTH:
                img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
            os.makedirs(_dir(), exist_ok=True)
            tmp = path + ".tmp"
            img.save(tmp, "WEBP", quality=78, method=4)
            os.replace(tmp, path)
            return path
        except Exception:
            return None
