"""Monthly SQLite backups into BACKUP_DIR/YYYY-MM/smriti-YYYY-MM-DD.db."""

import glob
import logging
import os
import sqlite3
import threading
from datetime import datetime

from .db import DB_PATH, TZ, connect, get_setting, purge_trash

BACKUP_DIR = os.environ.get("BACKUP_DIR", "/backups")
CHECK_INTERVAL_SECONDS = 6 * 60 * 60

log = logging.getLogger("smriti.backup")


def make_backup() -> str:
    stamp = datetime.now(TZ)
    month_dir = os.path.join(BACKUP_DIR, stamp.strftime("%Y-%m"))
    os.makedirs(month_dir, exist_ok=True)
    target = os.path.join(month_dir, f"smriti-{stamp.strftime('%Y-%m-%d')}.db")
    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    log.info("Backup written to %s", target)
    return target


def list_backups() -> list[dict]:
    out = []
    for path in sorted(glob.glob(os.path.join(BACKUP_DIR, "*", "smriti-*.db")), reverse=True):
        st = os.stat(path)
        out.append(
            {
                "path": os.path.relpath(path, BACKUP_DIR),
                "size_bytes": st.st_size,
                "created_at": datetime.fromtimestamp(st.st_mtime, TZ).replace(tzinfo=None).isoformat(timespec="seconds"),
            }
        )
    return out


def _month_has_backup() -> bool:
    month = datetime.now(TZ).strftime("%Y-%m")
    return bool(glob.glob(os.path.join(BACKUP_DIR, month, "smriti-*.db")))


def _backups_enabled() -> bool:
    conn = connect()
    try:
        return get_setting(conn, "monthly_backup", "1") == "1"
    finally:
        conn.close()


def _loop(stop: threading.Event) -> None:
    while not stop.is_set():
        try:
            if _backups_enabled() and not _month_has_backup():
                make_backup()
        except Exception:  # keep the scheduler alive
            log.exception("Monthly backup failed")
        try:
            purged = purge_trash()
            if purged:
                log.info("Removed %d items from the trash after 30 days", purged)
        except Exception:
            log.exception("Trash purge failed")
        stop.wait(CHECK_INTERVAL_SECONDS)


def start_scheduler() -> threading.Event:
    stop = threading.Event()
    threading.Thread(target=_loop, args=(stop,), daemon=True, name="backup").start()
    return stop
