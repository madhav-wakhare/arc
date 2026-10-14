"""Export videos/links and reading-list articles to the Obsidian vault, one Markdown note each."""

import os
import re

from .db import get_setting, now

VAULT_DIR = os.environ.get("VAULT_DIR", "/vault")
DEFAULT_FOLDER = os.environ.get("OBSIDIAN_FOLDER", "Smriti/Videos")

_ILLEGAL = re.compile(r'[\\/:*?"<>|#^\[\]\x00-\x1f]')


class ExportError(Exception):
    pass


def articles_folder(conn) -> str | None:
    """Folder for articles. None until the user picks one (the app asks on the first save)."""
    return get_setting(conn, "obsidian_articles_folder", "") or None


def vault_status(conn) -> dict:
    folder = get_setting(conn, "obsidian_folder", DEFAULT_FOLDER)
    mounted = os.path.isdir(VAULT_DIR)
    writable = mounted and os.access(VAULT_DIR, os.W_OK)
    has_obsidian = mounted and os.path.isdir(os.path.join(VAULT_DIR, ".obsidian"))
    return {
        "vault_dir": VAULT_DIR,
        "vault_host_path": os.environ.get("VAULT_HOST_PATH", ""),
        "folder": folder,
        "articles_folder": articles_folder(conn),
        "mounted": mounted,
        "writable": writable,
        "is_obsidian_vault": has_obsidian,
    }


def _safe_filename(title: str) -> str:
    name = _ILLEGAL.sub(" ", title)
    name = re.sub(r"\s+", " ", name).strip().strip(".")
    return (name[:150] or "Untitled").strip()


def _yaml_str(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _render(item: dict, key: str) -> str:
    title = item["title"]
    url = item["url"]
    return (
        "---\n"
        f"title: {_yaml_str(title)}\n"
        f"url: {_yaml_str(url)}\n"
        f"smriti_id: {key}\n"
        "---\n\n"
        f"# {title}\n\n"
        f"[{title}]({url})\n"
    )


def _is_ours(path: str, key: str) -> bool:
    try:
        with open(path, encoding="utf-8") as fh:
            head = fh.read(2048)
    except OSError:
        return False
    return f"smriti_id: {key}\n" in head


def _write_note(conn, folder: str, title: str, key: str, text: str, old_rel: str | None) -> str:
    """Write a note named after `title` in `folder`; remove the old note after a rename. Returns the vault path."""
    status = vault_status(conn)
    if not status["writable"]:
        raise ExportError(
            f"Vault folder {VAULT_DIR} is not mounted or not writable. "
            "Set OBSIDIAN_VAULT_PATH in .env and restart the container."
        )

    folder = folder.strip("/")
    target_dir = os.path.realpath(os.path.join(VAULT_DIR, folder))
    if not target_dir.startswith(os.path.realpath(VAULT_DIR)):
        raise ExportError("Export folder must be inside the vault.")
    os.makedirs(target_dir, exist_ok=True)

    base = _safe_filename(title)
    rel = os.path.join(folder, base + ".md")
    abs_path = os.path.join(VAULT_DIR, rel)
    # A different note with the same name already exists: keep it, add the key.
    if os.path.exists(abs_path) and rel != old_rel and not _is_ours(abs_path, key):
        rel = os.path.join(folder, f"{base} ({key}).md")
        abs_path = os.path.join(VAULT_DIR, rel)

    with open(abs_path, "w", encoding="utf-8") as fh:
        fh.write(text)

    if old_rel and old_rel != rel:
        old_abs = os.path.join(VAULT_DIR, old_rel)
        if _is_ours(old_abs, key):
            os.remove(old_abs)
    return rel


def export_item(conn, item: dict, key: str) -> str:
    """Write (or overwrite) the note for this item. Returns the vault-relative path."""
    if not item.get("url"):
        raise ExportError("Only items with a link can be exported to Obsidian.")
    rel = _write_note(conn, vault_status(conn)["folder"], item["title"], key, _render(item, key), item.get("obsidian_path"))
    conn.execute(
        "UPDATE items SET obsidian_path = ?, exported_at = ? WHERE id = ?",
        (rel, now(), item["id"]),
    )
    return rel


def article_key(article: dict) -> str:
    return f"ART-{article['id']}"


def _render_article(a: dict, key: str) -> str:
    tags = ", ".join(_yaml_str(t) for t in a.get("tags") or [])
    lines = [
        "---",
        f"title: {_yaml_str(a['title'])}",
        f"url: {_yaml_str(a['url'])}",
    ]
    if a.get("site"):
        lines.append(f"site: {_yaml_str(a['site'])}")
    if a.get("author"):
        lines.append(f"author: {_yaml_str(a['author'])}")
    lines += [
        f"tags: [{tags}]",
    ]
    if a.get("collections"):
        lines.append("collections: [" + ", ".join(_yaml_str(c["name"]) for c in a["collections"]) + "]")
    lines += [
        f"status: {a['status']}",
        f"saved: {a['created_at'][:10]}",
    ]
    if a.get("read_at"):
        lines.append(f"read: {a['read_at'][:10]}")
    lines += [f"smriti_id: {key}", "---", "", f"# {a['title']}", "", f"[Read the article]({a['url']})"]
    if a.get("description"):
        lines += ["", "> " + a["description"].replace("\n", " ")]
    if (a.get("notes") or "").strip():
        lines += ["", "## Notes", "", a["notes"].strip()]
    return "\n".join(lines) + "\n"


def export_article(conn, article: dict) -> str:
    folder = articles_folder(conn)
    if not folder:
        raise ExportError("Choose an Obsidian folder for articles first.")
    key = article_key(article)
    if article.get("folder_name"):  # the note lives in its collection's subfolder
        folder = f"{folder.rstrip('/')}/{_safe_filename(article['folder_name'])}"
    rel = _write_note(conn, folder, article["title"], key, _render_article(article, key), article.get("obsidian_path"))
    conn.execute("UPDATE articles SET obsidian_path = ?, exported_at = ? WHERE id = ?", (rel, now(), article["id"]))
    return rel
