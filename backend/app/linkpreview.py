"""Read the title, site name, author, summary and image of a web page (Open Graph and <title>)."""

import html
import re
import urllib.request
from urllib.parse import urljoin, urlparse

_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
_META = re.compile(r"<meta\s+[^>]*>", re.I)
_ATTR = re.compile(r'([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|\'([^\']*)\')')
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


def _clean(text: str | None, limit: int) -> str:
    if not text:
        return ""
    text = re.sub(r"\s+", " ", html.unescape(text)).strip()
    return text[:limit]


def site_of(url: str) -> str:
    host = urlparse(url).hostname or ""
    return host.removeprefix("www.")


def preview(url: str, timeout: float = 6.0) -> dict:
    """Best effort: on any network or parse problem, return what we know from the URL alone."""
    result = {"url": url, "title": "", "site": site_of(url), "author": "", "description": "", "image": None}
    if urlparse(url).scheme not in ("http", "https"):
        return result
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "text/html,*/*;q=0.8"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if "html" not in (resp.headers.get("Content-Type") or "html"):
                return result
            raw = resp.read(1_500_000)
            charset = resp.headers.get_content_charset() or "utf-8"
            final_url = resp.geturl()
    except Exception:
        return result
    page = raw.decode(charset, errors="replace")
    head = page[: page.lower().find("</head>") + 7] if "</head>" in page.lower() else page[:300_000]

    meta: dict[str, str] = {}
    for tag in _META.findall(head):
        attrs = {m[0].lower(): (m[2] or m[3]) for m in _ATTR.findall(tag)}
        name = (attrs.get("property") or attrs.get("name") or "").lower()
        if name and "content" in attrs and name not in meta:
            meta[name] = attrs["content"]

    title_tag = _TITLE.search(head)
    result["title"] = _clean(meta.get("og:title") or meta.get("twitter:title") or (title_tag.group(1) if title_tag else ""), 300)
    result["site"] = _clean(meta.get("og:site_name"), 120) or site_of(final_url)
    result["author"] = _clean(meta.get("author") or meta.get("article:author") or meta.get("twitter:creator"), 120)
    if result["author"].startswith("http"):
        result["author"] = ""
    result["description"] = _clean(meta.get("og:description") or meta.get("description") or meta.get("twitter:description"), 500)
    if result["description"].lower() == result["title"].lower():
        result["description"] = ""
    image = meta.get("og:image") or meta.get("twitter:image")
    result["image"] = urljoin(final_url, html.unescape(image)) if image else None
    return result
