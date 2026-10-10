"""Export video/link items to the Obsidian vault as one Markdown note per item."""

import os
import re

from .db import get_setting, now

VAULT_DIR = os.environ.get("VAULT_DIR", "/vault")
DEFAULT_FOLDER = os.environ.get("OBSIDIAN_FOLDER", "Smriti/Videos")

_ILLEGAL = re.compile(r'[\\/:*?"<>|#^\[\]\x00-\x1f]')


class ExportError(Exception):
    pass


def vault_status(conn) -> dict:
    folder = get_setting(conn, "obsidian_folder", DEFAULT_FOLDER)
    mounted = os.path.isdir(VAULT_DIR)
    writable = mounted and os.access(VAULT_DIR, os.W_OK)
    has_obsidian = mounted and os.path.isdir(os.path.join(VAULT_DIR, ".obsidian"))
    return {
        "vault_dir": VAULT_DIR,
        "folder": folder,
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


def export_item(conn, item: dict, key: str) -> str:
    """Write (or overwrite) the note for this item. Returns the vault-relative path."""
    if not item.get("url"):
        raise ExportError("Only items with a link can be exported to Obsidian.")
    status = vault_status(conn)
    if not status["writable"]:
        raise ExportError(
            f"Vault folder {VAULT_DIR} is not mounted or not writable. "
            "Set OBSIDIAN_VAULT_PATH in .env and restart the container."
        )

    folder = status["folder"].strip("/")
    target_dir = os.path.realpath(os.path.join(VAULT_DIR, folder))
    if not target_dir.startswith(os.path.realpath(VAULT_DIR)):
        raise ExportError("Export folder must be inside the vault.")
    os.makedirs(target_dir, exist_ok=True)

    base = _safe_filename(item["title"])
    rel = os.path.join(folder, base + ".md")
    abs_path = os.path.join(VAULT_DIR, rel)
    # A different note with the same name already exists: keep it, add the key.
    if os.path.exists(abs_path) and rel != item.get("obsidian_path") and not _is_ours(abs_path, key):
        rel = os.path.join(folder, f"{base} ({key}).md")
        abs_path = os.path.join(VAULT_DIR, rel)

    with open(abs_path, "w", encoding="utf-8") as fh:
        fh.write(_render(item, key))

    old = item.get("obsidian_path")
    if old and old != rel:
        old_abs = os.path.join(VAULT_DIR, old)
        if _is_ours(old_abs, key):
            os.remove(old_abs)

    conn.execute(
        "UPDATE items SET obsidian_path = ?, exported_at = ? WHERE id = ?",
        (rel, now(), item["id"]),
    )
    return rel
