import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

DATA_DIR = os.environ.get("DATA_DIR", "/data")
DB_PATH = os.path.join(DATA_DIR, "smriti.db")
TZ = ZoneInfo(os.environ.get("TZ", "UTC"))
TRASH_DAYS = 30

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#2a78d6',
    next_number INTEGER NOT NULL DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0,
    icon TEXT,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    number INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('task', 'learning', 'note')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'backlog'
        CHECK (status IN ('backlog', 'today', 'in_progress', 'done')),
    priority TEXT NOT NULL DEFAULT 'none'
        CHECK (priority IN ('urgent', 'high', 'medium', 'low', 'none')),
    due_date TEXT,
    url TEXT,
    labels TEXT NOT NULL DEFAULT '[]',
    estimate_minutes INTEGER,
    position REAL NOT NULL DEFAULT 0,
    recurrence TEXT NOT NULL DEFAULT 'none'
        CHECK (recurrence IN ('none', 'daily', 'weekdays', 'weekly', 'monthly')),
    recurrence_next_id INTEGER,
    obsidian_path TEXT,
    exported_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status_changed_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_project ON items(project_id);

CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    edited_at TEXT
);

CREATE TABLE IF NOT EXISTS worklogs (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    minutes INTEGER NOT NULL CHECK (minutes > 0),
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_worklogs_started ON worklogs(started_at);

CREATE TABLE IF NOT EXISTS active_timer (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_reviews (
    date TEXT PRIMARY KEY,
    went_well TEXT NOT NULL DEFAULT '',
    blockers TEXT NOT NULL DEFAULT '',
    tomorrow TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

-- Inbox: quick notes outside the board flow. Converting one creates an item.
CREATE TABLE IF NOT EXISTS jots (
    id INTEGER PRIMARY KEY,
    body TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    url TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'converted', 'archived')),
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    converted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jots_status ON jots(status);

-- Revise: topics to keep in front of your eyes. 'revised' ones sit in an archive tab.
CREATE TABLE IF NOT EXISTS revisions (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    question TEXT NOT NULL DEFAULT '',
    url TEXT,
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ticket', 'radar')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revised')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revised_at TEXT,
    priority TEXT NOT NULL DEFAULT 'none',
    timer_started_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_revisions_status ON revisions(status);

-- One row per revision session: when and for how long you revised a topic.
CREATE TABLE IF NOT EXISTS revision_sessions (
    id INTEGER PRIMARY KEY,
    revision_id INTEGER NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
    minutes INTEGER NOT NULL CHECK (minutes > 0),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revision_sessions_rev ON revision_sessions(revision_id);

-- Quotes shown one at a time in the top bar.
CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

-- Weekend: an ideas list (movies, places, things to try) and a plan per weekend day.
CREATE TABLE IF NOT EXISTS weekend_ideas (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    note TEXT NOT NULL DEFAULT '',
    url TEXT,
    done_at TEXT,
    created_at TEXT NOT NULL
);

-- One activity in a weekend slot. Study points at a ticket, revise at a Revisit topic,
-- life is free text (optionally from an idea). The title is a snapshot for display.
CREATE TABLE IF NOT EXISTS weekend_plan (
    id INTEGER PRIMARY KEY,
    day TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('morning', 'afternoon', 'evening')),
    kind TEXT NOT NULL CHECK (kind IN ('study', 'revise', 'life')),
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    revision_id INTEGER REFERENCES revisions(id) ON DELETE SET NULL,
    idea_id INTEGER REFERENCES weekend_ideas(id) ON DELETE SET NULL,
    done INTEGER NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_weekend_plan_day ON weekend_plan(day);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    title, description, url, content='items', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
    INSERT INTO items_fts(rowid, title, description, url)
    VALUES (new.id, new.title, new.description, coalesce(new.url, ''));
END;
CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
    INSERT INTO items_fts(items_fts, rowid, title, description, url)
    VALUES ('delete', old.id, old.title, old.description, coalesce(old.url, ''));
END;
CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE OF title, description, url ON items BEGIN
    INSERT INTO items_fts(items_fts, rowid, title, description, url)
    VALUES ('delete', old.id, old.title, old.description, coalesce(old.url, ''));
    INSERT INTO items_fts(rowid, title, description, url)
    VALUES (new.id, new.title, new.description, coalesce(new.url, ''));
END;

CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts USING fts5(
    body, content='comments', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS comments_ai AFTER INSERT ON comments BEGIN
    INSERT INTO comments_fts(rowid, body) VALUES (new.id, new.body);
END;
CREATE TRIGGER IF NOT EXISTS comments_ad AFTER DELETE ON comments BEGIN
    INSERT INTO comments_fts(comments_fts, rowid, body) VALUES ('delete', old.id, old.body);
END;
CREATE TRIGGER IF NOT EXISTS comments_au AFTER UPDATE ON comments BEGIN
    INSERT INTO comments_fts(comments_fts, rowid, body) VALUES ('delete', old.id, old.body);
    INSERT INTO comments_fts(rowid, body) VALUES (new.id, new.body);
END;
"""


# Objects that depend on columns added by migrations; created after migrate().
POST_MIGRATION = """
CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
CREATE VIEW IF NOT EXISTS live_items AS SELECT * FROM items WHERE deleted_at IS NULL;
"""

# (table, column, definition) added after v0.1.0. Only ever append to this list.
MIGRATIONS = [
    ("items", "deleted_at", "TEXT"),
    ("projects", "deleted_at", "TEXT"),
    ("projects", "archived", "INTEGER NOT NULL DEFAULT 0"),
    ("jots", "url", "TEXT"),
    ("projects", "icon", "TEXT"),
    ("revisions", "priority", "TEXT NOT NULL DEFAULT 'none'"),
    ("revisions", "timer_started_at", "TEXT"),
    ("comments", "edited_at", "TEXT"),
]

# Project icons (Lucide names). New projects take the first one not in use.
PROJECT_ICONS = [
    "briefcase", "graduation-cap", "code", "server", "cpu", "brain", "rocket", "flask-conical",
    "database", "cloud", "shield", "wrench", "terminal", "git-branch", "layers", "lightbulb",
    "book-open", "globe", "heart-pulse", "home", "dumbbell", "camera", "pen-tool", "box",
]
DEFAULT_ICONS = {"WORK": "briefcase", "LRN": "graduation-cap"}


def next_icon(conn) -> str:
    used = {r[0] for r in conn.execute("SELECT icon FROM projects WHERE deleted_at IS NULL")}
    return next((i for i in PROJECT_ICONS if i not in used), PROJECT_ICONS[0])


def assign_missing_icons(conn) -> None:
    for pid, key in conn.execute("SELECT id, key FROM projects WHERE icon IS NULL ORDER BY id").fetchall():
        conn.execute("UPDATE projects SET icon = ? WHERE id = ?", (DEFAULT_ICONS.get(key) or next_icon(conn), pid))


def _columns(conn, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def needs_migration() -> bool:
    """True when an existing database misses columns from MIGRATIONS."""
    if not os.path.exists(DB_PATH):
        return False
    conn = sqlite3.connect(DB_PATH)
    try:
        return any(
            _columns(conn, table) and col not in _columns(conn, table) for table, col, _ in MIGRATIONS
        )
    finally:
        conn.close()


def migrate(conn) -> None:
    for table, col, definition in MIGRATIONS:
        if col not in _columns(conn, table):
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")


def now() -> str:
    return datetime.now(TZ).replace(microsecond=0, tzinfo=None).isoformat()


def today() -> str:
    return datetime.now(TZ).date().isoformat()


def connect() -> sqlite3.Connection:
    # FastAPI may run a dependency and its endpoint on different worker threads.
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def transaction():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_db():
    """FastAPI dependency: one connection per request, committed on success."""
    with transaction() as conn:
        yield conn


def init_db() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with transaction() as conn:
        conn.executescript(SCHEMA)
        migrate(conn)
        conn.executescript(POST_MIGRATION)
        if not conn.execute("SELECT 1 FROM projects LIMIT 1").fetchone():  # first run: two starter projects
            ts = now()
            conn.executemany(
                "INSERT INTO projects (key, name, description, color, created_at) VALUES (?, ?, ?, ?, ?)",
                [
                    ("WORK", "Work", "Tasks from my job", "#2a78d6", ts),
                    ("LRN", "Learning", "Videos, articles, courses and books", "#eb6834", ts),
                ],
            )
        assign_missing_icons(conn)


def rows(cursor) -> list[dict]:
    return [dict(r) for r in cursor.fetchall()]


def row(cursor) -> dict | None:
    r = cursor.fetchone()
    return dict(r) if r else None


def get_setting(conn, key: str, default: str) -> str:
    r = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return r["value"] if r else default


def set_setting(conn, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def purge_trash() -> int:
    """Delete for good everything that has been in the trash longer than TRASH_DAYS."""
    cutoff = (datetime.now(TZ) - timedelta(days=TRASH_DAYS)).replace(tzinfo=None).isoformat()
    with transaction() as conn:
        ids = [r[0] for r in conn.execute(
            """SELECT id FROM items WHERE deleted_at < ?
               OR project_id IN (SELECT id FROM projects WHERE deleted_at < ?)""", (cutoff, cutoff))]
        hard_delete_items(conn, ids)
        conn.execute("DELETE FROM projects WHERE deleted_at < ?", (cutoff,))
    return len(ids)


def hard_delete_items(conn, ids: list[int]) -> None:
    if not ids:
        return
    marks = ",".join("?" * len(ids))
    # A Radar topic whose ticket is gone for good goes with it.
    conn.execute(f"DELETE FROM jots WHERE item_id IN ({marks})", ids)
    conn.execute(f"UPDATE items SET recurrence_next_id = NULL WHERE recurrence_next_id IN ({marks})", ids)
    conn.execute(f"DELETE FROM items WHERE id IN ({marks})", ids)
