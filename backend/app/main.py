import calendar
import json
import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import backup, linkpreview, obsidian, thumbs
from .db import (
    PROJECT_ICONS, TRASH_DAYS, get_db, next_icon, get_setting, hard_delete_items, init_db, needs_migration, now, purge_trash, row, rows,
    set_setting, today,
)

logging.basicConfig(level=logging.INFO)

VERSION = "0.1.0"
STATIC_DIR = os.environ.get("STATIC_DIR", os.path.join(os.path.dirname(__file__), "..", "static"))

ItemType = Literal["task", "learning", "note"]
Status = Literal["backlog", "today", "in_progress", "done"]
Priority = Literal["urgent", "high", "medium", "low", "none"]
Recurrence = Literal["none", "daily", "weekdays", "weekly", "monthly"]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if needs_migration():
        backup.make_backup()  # safety copy before the schema upgrade
    init_db()
    purge_trash()
    stop = backup.start_scheduler()
    yield
    stop.set()


app = FastAPI(title="Smriti", version=VERSION, lifespan=lifespan)


# --------------------------------------------------------------------------- models


class ProjectIn(BaseModel):
    key: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9]{1,9}$")
    name: str = Field(min_length=1, max_length=80)
    description: str = ""
    color: str = Field(default="#2a78d6", pattern=r"^#[0-9a-fA-F]{6}$")
    icon: str | None = None


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    archived: bool | None = None
    icon: str | None = None


class ItemIn(BaseModel):
    project_id: int
    type: ItemType = "task"
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    status: Status = "backlog"
    priority: Priority = "none"
    due_date: date | None = None
    url: str | None = None
    labels: list[str] = []
    estimate_minutes: int | None = Field(default=None, ge=0)
    recurrence: Recurrence = "none"


class ItemPatch(BaseModel):
    project_id: int | None = None
    type: ItemType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    status: Status | None = None
    priority: Priority | None = None
    due_date: date | None = None
    url: str | None = None
    labels: list[str] | None = None
    estimate_minutes: int | None = Field(default=None, ge=0)
    recurrence: Recurrence | None = None
    position: float | None = None


class SubtaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)


class SubtaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    done: bool | None = None


class CommentIn(BaseModel):
    body: str = Field(min_length=1)


class WorklogIn(BaseModel):
    time_spent: str = Field(description="Jira format, for example '1h 30m', '45m', '1d 2h'")
    started_at: datetime | None = None
    comment: str = ""


class ReviewIn(BaseModel):
    went_well: str = ""
    blockers: str = ""
    tomorrow: str = ""


class JotIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    details: str = ""
    url: str | None = None


class JotPatch(BaseModel):
    body: str | None = Field(default=None, min_length=1, max_length=2000)
    details: str | None = None
    url: str | None = None
    status: Literal["open", "archived"] | None = None


class JotConvert(BaseModel):
    project_id: int
    type: ItemType = "learning"
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    url: str | None = None
    status: Status = "backlog"
    priority: Priority = "none"
    labels: list[str] | None = None


class RevisionIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    notes: str = ""
    question: str = ""
    url: str | None = None
    priority: Priority = "none"


class RevisionPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    notes: str | None = None
    question: str | None = None
    url: str | None = None
    status: Literal["active", "revised"] | None = None
    priority: Priority | None = None


class SessionIn(BaseModel):
    time_spent: str = Field(description="For example '20m' or '1h 15m'")


class SettingsIn(BaseModel):
    obsidian_folder: str | None = Field(default=None, min_length=1, max_length=200)
    auto_reexport: bool | None = None
    monthly_backup: bool | None = None
    quotes_on_dashboard: bool | None = None
    quotes_on_board: bool | None = None
    quotes_interval: int | None = Field(default=None, ge=5, le=3600)
    weekend_mode: bool | None = None
    obsidian_articles_folder: str | None = Field(default=None, min_length=1, max_length=200)


class QuoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    author: str = Field(default="", max_length=120)


# --------------------------------------------------------------------------- helpers

_DURATION = re.compile(r"(\d+(?:\.\d+)?)\s*([wdhm])", re.I)
# Jira defaults: 1d = 8h, 1w = 5d
_UNIT_MINUTES = {"w": 5 * 8 * 60, "d": 8 * 60, "h": 60, "m": 1}


def parse_duration(text: str) -> int:
    text = text.strip().lower()
    if re.fullmatch(r"\d+", text):
        return int(text)  # bare number = minutes
    parts = _DURATION.findall(text)
    if not parts or _DURATION.sub("", text).strip():
        raise HTTPException(422, "Use a time like '2h 30m', '45m' or '1d'.")
    minutes = round(sum(float(n) * _UNIT_MINUTES[u] for n, u in parts))
    if minutes <= 0:
        raise HTTPException(422, "Time spent must be more than zero.")
    return minutes


ITEM_SELECT = """
SELECT i.*, p.key AS project_key, p.name AS project_name, p.color AS project_color, p.icon AS project_icon,
       p.key || '-' || i.number AS key,
       coalesce((SELECT sum(minutes) FROM worklogs w WHERE w.item_id = i.id), 0) AS logged_minutes,
       (SELECT count(*) FROM subtasks s WHERE s.item_id = i.id) AS subtask_count,
       (SELECT count(*) FROM subtasks s WHERE s.item_id = i.id AND s.done = 1) AS subtask_done,
       (SELECT count(*) FROM comments c WHERE c.item_id = i.id) AS comment_count,
       (SELECT r.id FROM revisions r WHERE r.item_id = i.id AND r.status = 'active' LIMIT 1) AS revision_id
FROM live_items i JOIN projects p ON p.id = i.project_id
"""


def _decode(item: dict | None) -> dict | None:
    if item is not None:
        item["labels"] = json.loads(item["labels"] or "[]")
    return item


def load_item(conn, item_id: int) -> dict:
    item = _decode(row(conn.execute(ITEM_SELECT + " WHERE i.id = ?", (item_id,))))
    if not item:
        raise HTTPException(404, "Item not found")
    return item


def log_history(conn, item_id: int, field: str, old, new) -> None:
    conn.execute(
        "INSERT INTO history (item_id, field, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?)",
        (item_id, field, None if old is None else str(old), None if new is None else str(new), now()),
    )


def next_due(base: date, recurrence: str) -> date:
    if recurrence == "daily":
        return base + timedelta(days=1)
    if recurrence == "weekdays":
        d = base + timedelta(days=1)
        while d.weekday() >= 5:
            d += timedelta(days=1)
        return d
    if recurrence == "weekly":
        return base + timedelta(weeks=1)
    # monthly: same day next month, clamped to month length
    y, m = (base.year + 1, 1) if base.month == 12 else (base.year, base.month + 1)
    return date(y, m, min(base.day, calendar.monthrange(y, m)[1]))


def spawn_recurrence(conn, item: dict) -> None:
    """When a recurring item is done, create its next copy (once)."""
    if item["recurrence"] == "none" or item["recurrence_next_id"]:
        return
    base = date.fromisoformat(item["due_date"]) if item["due_date"] else date.fromisoformat(today())
    due = next_due(base, item["recurrence"])
    new_id = insert_item(
        conn,
        ItemIn(
            project_id=item["project_id"],
            type=item["type"],
            title=item["title"],
            description=item["description"],
            priority=item["priority"],
            due_date=due,
            url=item["url"],
            labels=item["labels"],
            estimate_minutes=item["estimate_minutes"],
            recurrence=item["recurrence"],
        ),
    )
    conn.execute(
        "INSERT INTO subtasks (item_id, title, position) SELECT ?, title, position FROM subtasks WHERE item_id = ?",
        (new_id, item["id"]),
    )
    conn.execute("UPDATE items SET recurrence_next_id = ? WHERE id = ?", (new_id, item["id"]))


def insert_item(conn, data: ItemIn) -> int:
    proj = row(conn.execute("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL", (data.project_id,)))
    if not proj:
        raise HTTPException(422, "Project not found")
    ts = now()
    pos = conn.execute(
        "SELECT coalesce(max(position), 0) + 1000 FROM items WHERE status = ?", (data.status,)
    ).fetchone()[0]
    cur = conn.execute(
        """INSERT INTO items (project_id, number, type, title, description, status, priority, due_date, url,
                              labels, estimate_minutes, position, recurrence, created_at, updated_at,
                              status_changed_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            data.project_id, proj["next_number"], data.type, data.title.strip(), data.description,
            data.status, data.priority, data.due_date.isoformat() if data.due_date else None,
            (data.url or "").strip() or None, json.dumps(data.labels), data.estimate_minutes, pos,
            data.recurrence, ts, ts, ts, ts if data.status == "done" else None,
        ),
    )
    conn.execute("UPDATE projects SET next_number = next_number + 1 WHERE id = ?", (data.project_id,))
    log_history(conn, cur.lastrowid, "created", None, data.title)
    return cur.lastrowid


# --------------------------------------------------------------------------- projects


@app.get("/api/projects")
def list_projects(conn=Depends(get_db)):
    return rows(conn.execute("""
        SELECT p.*,
               (SELECT count(*) FROM live_items i WHERE i.project_id = p.id) AS item_count,
               (SELECT count(*) FROM live_items i WHERE i.project_id = p.id AND i.status != 'done') AS open_count
        FROM projects p WHERE p.deleted_at IS NULL ORDER BY p.created_at, p.id"""))


@app.post("/api/projects", status_code=201)
def create_project(data: ProjectIn, conn=Depends(get_db)):
    key = data.key.upper()
    clash = row(conn.execute("SELECT deleted_at FROM projects WHERE key = ?", (key,)))
    if clash:
        where = " in Trash. Restore it or delete it for good first" if clash["deleted_at"] else ""
        raise HTTPException(409, f"Project key {key} already exists{where}.")
    if data.icon and data.icon not in PROJECT_ICONS:
        raise HTTPException(422, "Unknown icon")
    cur = conn.execute(
        "INSERT INTO projects (key, name, description, color, icon, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (key, data.name, data.description, data.color, data.icon or next_icon(conn), now()),
    )
    return row(conn.execute("SELECT * FROM projects WHERE id = ?", (cur.lastrowid,)))


@app.patch("/api/projects/{project_id}")
def update_project(project_id: int, data: ProjectPatch, conn=Depends(get_db)):
    fields = data.model_dump(exclude_unset=True)
    if "icon" in fields and fields["icon"] not in PROJECT_ICONS:
        raise HTTPException(422, "Unknown icon")
    if fields:
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE projects SET {sets} WHERE id = ? AND deleted_at IS NULL", (*fields.values(), project_id))
    p = row(conn.execute("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL", (project_id,)))
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: int, conn=Depends(get_db)):
    """Move the project and its items to the trash. They can be restored for TRASH_DAYS days."""
    if not conn.execute("SELECT 1 FROM projects WHERE id = ? AND deleted_at IS NULL", (project_id,)).fetchone():
        raise HTTPException(404, "Project not found")
    ts = now()
    _stop_timer_if(conn, "SELECT id FROM items WHERE project_id = ?", (project_id,))
    conn.execute("UPDATE items SET deleted_at = ? WHERE project_id = ? AND deleted_at IS NULL", (ts, project_id))
    conn.execute("UPDATE projects SET deleted_at = ? WHERE id = ?", (ts, project_id))


# --------------------------------------------------------------------------- items


@app.get("/api/items")
def list_items(
    status: list[Status] = Query(default=[]),
    type: list[ItemType] = Query(default=[]),
    priority: list[Priority] = Query(default=[]),
    project_id: list[int] = Query(default=[]),
    label: str | None = None,
    view: Literal["all", "today"] = "all",
    conn=Depends(get_db),
):
    where, args = [], []
    for col, values in (("i.status", status), ("i.type", type), ("i.priority", priority), ("i.project_id", project_id)):
        if values:
            where.append(f"{col} IN ({','.join('?' * len(values))})")
            args.extend(values)
    if label:
        where.append("EXISTS (SELECT 1 FROM json_each(i.labels) WHERE value = ?)")
        args.append(label)
    if view == "today":
        t = today()
        where.append(
            "(i.status IN ('today', 'in_progress') OR (i.status != 'done' AND i.due_date <= ?) "
            "OR (i.status = 'done' AND substr(i.completed_at, 1, 10) = ?))"
        )
        args += [t, t]
    sql = ITEM_SELECT + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY i.position, i.id"
    return [_decode(r) for r in rows(conn.execute(sql, args))]


@app.post("/api/items", status_code=201)
def create_item(data: ItemIn, conn=Depends(get_db)):
    return load_item(conn, insert_item(conn, data))


@app.get("/api/items/{item_id}")
def get_item(item_id: int, conn=Depends(get_db)):
    item = load_item(conn, item_id)
    item["subtasks"] = rows(conn.execute("SELECT * FROM subtasks WHERE item_id = ? ORDER BY position, id", (item_id,)))
    return item


@app.patch("/api/items/{item_id}")
def update_item(item_id: int, data: ItemPatch, conn=Depends(get_db)):
    item = load_item(conn, item_id)
    fields = data.model_dump(exclude_unset=True)
    ts = now()
    updates: dict = {}
    for k, v in fields.items():
        if k == "due_date":
            v = v.isoformat() if v else None
        elif k == "labels":
            v = json.dumps(v)
        elif k == "url":
            v = (v or "").strip() or None
        elif k == "title":
            v = v.strip()
        old = json.dumps(item[k]) if k == "labels" else item[k]
        if old == v:
            continue
        updates[k] = v
        if k not in ("position", "description"):
            log_history(conn, item_id, k, old, v)
        elif k == "description":
            log_history(conn, item_id, k, None, None)

    if "project_id" in updates:
        proj = row(conn.execute(
            "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL", (updates["project_id"],)))
        if not proj:
            raise HTTPException(422, "Project not found")
        updates["number"] = proj["next_number"]
        conn.execute("UPDATE projects SET next_number = next_number + 1 WHERE id = ?", (proj["id"],))
    if "status" in updates:
        updates["status_changed_at"] = ts
        updates["completed_at"] = ts if updates["status"] == "done" else None
    if "url" in updates:
        updates["thumb"] = None  # look up the new link's preview image next time

    if updates:
        updates["updated_at"] = ts
        sets = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE items SET {sets} WHERE id = ?", (*updates.values(), item_id))

    item = load_item(conn, item_id)
    if updates.get("status") == "done":
        spawn_recurrence(conn, item)
    # Keep an exported note in sync: overwrite on change of title or link.
    if (
        item["obsidian_path"] and item["url"] and {"title", "url", "project_id"} & updates.keys()
        and get_setting(conn, "auto_reexport", "1") == "1"
    ):
        try:
            obsidian.export_item(conn, item, item["key"])
        except obsidian.ExportError:
            pass
    return get_item(item_id, conn)


@app.delete("/api/items/{item_id}", status_code=204)
def delete_item(item_id: int, conn=Depends(get_db)):
    """Move the item to the trash. It can be restored for TRASH_DAYS days."""
    load_item(conn, item_id)
    _stop_timer_if(conn, "SELECT ?", (item_id,))
    conn.execute("UPDATE items SET deleted_at = ? WHERE id = ?", (now(), item_id))


@app.post("/api/items/{item_id}/export")
def export_item(item_id: int, conn=Depends(get_db)):
    item = load_item(conn, item_id)
    try:
        path = obsidian.export_item(conn, item, item["key"])
    except obsidian.ExportError as exc:
        raise HTTPException(400, str(exc))
    log_history(conn, item_id, "obsidian", None, path)
    return get_item(item_id, conn)


# subtasks ------------------------------------------------------------------


@app.post("/api/items/{item_id}/subtasks", status_code=201)
def add_subtask(item_id: int, data: SubtaskIn, conn=Depends(get_db)):
    load_item(conn, item_id)
    pos = conn.execute("SELECT coalesce(max(position), 0) + 1 FROM subtasks WHERE item_id = ?", (item_id,)).fetchone()[0]
    cur = conn.execute("INSERT INTO subtasks (item_id, title, position) VALUES (?, ?, ?)", (item_id, data.title, pos))
    return row(conn.execute("SELECT * FROM subtasks WHERE id = ?", (cur.lastrowid,)))


@app.patch("/api/subtasks/{subtask_id}")
def update_subtask(subtask_id: int, data: SubtaskPatch, conn=Depends(get_db)):
    fields = data.model_dump(exclude_unset=True)
    if fields:
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE subtasks SET {sets} WHERE id = ?", (*fields.values(), subtask_id))
    return row(conn.execute("SELECT * FROM subtasks WHERE id = ?", (subtask_id,)))


@app.delete("/api/subtasks/{subtask_id}", status_code=204)
def delete_subtask(subtask_id: int, conn=Depends(get_db)):
    conn.execute("DELETE FROM subtasks WHERE id = ?", (subtask_id,))


# comments and history ------------------------------------------------------


@app.get("/api/items/{item_id}/comments")
def list_comments(item_id: int, conn=Depends(get_db)):
    # Oldest first: comments read top to bottom like a conversation.
    return rows(conn.execute("SELECT * FROM comments WHERE item_id = ? ORDER BY created_at, id", (item_id,)))


@app.post("/api/items/{item_id}/comments", status_code=201)
def add_comment(item_id: int, data: CommentIn, conn=Depends(get_db)):
    load_item(conn, item_id)
    cur = conn.execute("INSERT INTO comments (item_id, body, created_at) VALUES (?, ?, ?)", (item_id, data.body, now()))
    return row(conn.execute("SELECT * FROM comments WHERE id = ?", (cur.lastrowid,)))


@app.patch("/api/comments/{comment_id}")
def edit_comment(comment_id: int, data: CommentIn, conn=Depends(get_db)):
    if not conn.execute("SELECT 1 FROM comments WHERE id = ?", (comment_id,)).fetchone():
        raise HTTPException(404, "Comment not found")
    conn.execute("UPDATE comments SET body = ?, edited_at = ? WHERE id = ?", (data.body.strip(), now(), comment_id))
    return row(conn.execute("SELECT * FROM comments WHERE id = ?", (comment_id,)))


@app.delete("/api/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, conn=Depends(get_db)):
    conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,))


@app.get("/api/items/{item_id}/history")
def list_history(item_id: int, conn=Depends(get_db)):
    return rows(conn.execute("SELECT * FROM history WHERE item_id = ? ORDER BY created_at DESC, id DESC", (item_id,)))


# --------------------------------------------------------------------------- time tracking


@app.get("/api/items/{item_id}/worklogs")
def list_worklogs(item_id: int, conn=Depends(get_db)):
    return rows(conn.execute("SELECT * FROM worklogs WHERE item_id = ? ORDER BY started_at DESC, id DESC", (item_id,)))


@app.post("/api/items/{item_id}/worklogs", status_code=201)
def add_worklog(item_id: int, data: WorklogIn, conn=Depends(get_db)):
    load_item(conn, item_id)
    minutes = parse_duration(data.time_spent)
    started = (data.started_at.replace(tzinfo=None, microsecond=0).isoformat() if data.started_at else now())
    cur = conn.execute(
        "INSERT INTO worklogs (item_id, started_at, minutes, comment, created_at) VALUES (?, ?, ?, ?, ?)",
        (item_id, started, minutes, data.comment, now()),
    )
    log_history(conn, item_id, "worklog", None, f"{minutes}m")
    return row(conn.execute("SELECT * FROM worklogs WHERE id = ?", (cur.lastrowid,)))


@app.delete("/api/worklogs/{worklog_id}", status_code=204)
def delete_worklog(worklog_id: int, conn=Depends(get_db)):
    conn.execute("DELETE FROM worklogs WHERE id = ?", (worklog_id,))


@app.get("/api/timer")
def get_timer(conn=Depends(get_db)):
    t = row(conn.execute(
        """SELECT t.*, p.key || '-' || i.number AS key, i.title FROM active_timer t
           JOIN live_items i ON i.id = t.item_id JOIN projects p ON p.id = i.project_id"""))
    return t


@app.post("/api/items/{item_id}/timer/start")
def start_timer(item_id: int, conn=Depends(get_db)):
    load_item(conn, item_id)
    _stop_timer(conn)
    conn.execute("INSERT INTO active_timer (id, item_id, started_at) VALUES (1, ?, ?)", (item_id, now()))
    return get_timer(conn)


def _stop_timer(conn, comment: str = "") -> dict | None:
    t = row(conn.execute("SELECT * FROM active_timer WHERE id = 1"))
    if not t:
        return None
    conn.execute("DELETE FROM active_timer WHERE id = 1")
    elapsed = datetime.fromisoformat(now()) - datetime.fromisoformat(t["started_at"])
    minutes = max(1, round(elapsed.total_seconds() / 60))
    cur = conn.execute(
        "INSERT INTO worklogs (item_id, started_at, minutes, comment, created_at) VALUES (?, ?, ?, ?, ?)",
        (t["item_id"], t["started_at"], minutes, comment, now()),
    )
    log_history(conn, t["item_id"], "worklog", None, f"{minutes}m (timer)")
    return row(conn.execute("SELECT * FROM worklogs WHERE id = ?", (cur.lastrowid,)))


@app.post("/api/timer/stop")
def stop_timer(conn=Depends(get_db)):
    return _stop_timer(conn)


@app.delete("/api/timer", status_code=204)
def discard_timer(conn=Depends(get_db)):
    conn.execute("DELETE FROM active_timer WHERE id = 1")


def _stop_timer_if(conn, item_ids_sql: str, args: tuple) -> None:
    """Stop (and log) the running timer when it belongs to one of these items."""
    t = row(conn.execute("SELECT item_id FROM active_timer WHERE id = 1"))
    if t and t["item_id"] in {r[0] for r in conn.execute(item_ids_sql, args)}:
        _stop_timer(conn)


# --------------------------------------------------------------------------- trash


def _days_left(deleted_at: str) -> int:
    age = (datetime.fromisoformat(now()) - datetime.fromisoformat(deleted_at)).days
    return max(0, TRASH_DAYS - age)


@app.get("/api/trash")
def list_trash(conn=Depends(get_db)):
    projects = rows(conn.execute("""
        SELECT p.*, (SELECT count(*) FROM items i WHERE i.project_id = p.id) AS item_count
        FROM projects p WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC"""))
    items = rows(conn.execute("""
        SELECT i.id, i.type, i.title, i.status, i.url, i.deleted_at, p.key || '-' || i.number AS key,
               p.id AS project_id, p.name AS project_name, p.color AS project_color, p.icon AS project_icon,
               p.deleted_at IS NOT NULL AS project_deleted,
               coalesce(p.deleted_at = i.deleted_at, 0) AS deleted_with_project
        FROM items i JOIN projects p ON p.id = i.project_id
        WHERE i.deleted_at IS NOT NULL ORDER BY i.deleted_at DESC"""))
    for r in projects + items:
        r["days_left"] = _days_left(r["deleted_at"])
    return {"projects": projects, "items": items, "trash_days": TRASH_DAYS}


@app.post("/api/trash/items/{item_id}/restore")
def restore_item(item_id: int, conn=Depends(get_db)):
    it = row(conn.execute("SELECT * FROM items WHERE id = ? AND deleted_at IS NOT NULL", (item_id,)))
    if not it:
        raise HTTPException(404, "Item is not in the trash")
    # An item cannot live in a deleted project: bring the project back too (without its other items).
    conn.execute("UPDATE projects SET deleted_at = NULL WHERE id = ?", (it["project_id"],))
    conn.execute("UPDATE items SET deleted_at = NULL WHERE id = ?", (item_id,))
    log_history(conn, item_id, "restored", None, None)
    return get_item(item_id, conn)


@app.post("/api/trash/projects/{project_id}/restore")
def restore_project(project_id: int, conn=Depends(get_db)):
    p = row(conn.execute("SELECT * FROM projects WHERE id = ? AND deleted_at IS NOT NULL", (project_id,)))
    if not p:
        raise HTTPException(404, "Project is not in the trash")
    # Restore the items deleted together with the project, not items deleted earlier on their own.
    conn.execute(
        "UPDATE items SET deleted_at = NULL WHERE project_id = ? AND deleted_at = ?", (project_id, p["deleted_at"]))
    conn.execute("UPDATE projects SET deleted_at = NULL WHERE id = ?", (project_id,))
    return row(conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)))


@app.delete("/api/trash/items/{item_id}", status_code=204)
def purge_item(item_id: int, conn=Depends(get_db)):
    if not conn.execute("SELECT 1 FROM items WHERE id = ? AND deleted_at IS NOT NULL", (item_id,)).fetchone():
        raise HTTPException(404, "Item is not in the trash")
    hard_delete_items(conn, [item_id])


@app.delete("/api/trash/projects/{project_id}", status_code=204)
def purge_project(project_id: int, conn=Depends(get_db)):
    if not conn.execute("SELECT 1 FROM projects WHERE id = ? AND deleted_at IS NOT NULL", (project_id,)).fetchone():
        raise HTTPException(404, "Project is not in the trash")
    hard_delete_items(conn, [r[0] for r in conn.execute("SELECT id FROM items WHERE project_id = ?", (project_id,))])
    conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))


@app.delete("/api/trash", status_code=204)
def empty_trash(conn=Depends(get_db)):
    hard_delete_items(conn, [r[0] for r in conn.execute(
        """SELECT id FROM items WHERE deleted_at IS NOT NULL
           OR project_id IN (SELECT id FROM projects WHERE deleted_at IS NOT NULL)""")])
    conn.execute("DELETE FROM projects WHERE deleted_at IS NOT NULL")


# --------------------------------------------------------------------------- inbox (jots)

_URL = re.compile(r"https?://\S+")
_TAG = re.compile(r"(?<![\w/])#([\w-]+)")

JOT_SELECT = """
SELECT j.*, p.key || '-' || i.number AS item_key, i.title AS item_title, i.type AS item_type,
       i.deleted_at IS NOT NULL AS item_deleted
FROM jots j LEFT JOIN items i ON i.id = j.item_id LEFT JOIN projects p ON p.id = i.project_id
"""


def _jot_extras(j: dict) -> dict:
    """Parse the link and #tags out of the note text."""
    text = f"{j['body']}\n{j['details']}"
    if not j.get("url"):
        found = _URL.search(text)
        j["url"] = found.group(0).rstrip(").,;") if found else None
    j["tags"] = sorted({t.lower() for t in _TAG.findall(text)})
    return j


def load_jot(conn, jot_id: int) -> dict:
    j = row(conn.execute(JOT_SELECT + " WHERE j.id = ?", (jot_id,)))
    if not j:
        raise HTTPException(404, "Note not found")
    return _jot_extras(j)


@app.get("/api/jots")
def list_jots(q: str | None = None, conn=Depends(get_db)):
    # A topic whose ticket is in Trash is hidden; it comes back if the ticket is restored.
    sql, args = JOT_SELECT + " WHERE NOT (j.status = 'converted' AND (i.id IS NULL OR i.deleted_at IS NOT NULL))", []
    if q and q.strip():
        sql += " AND (j.body LIKE ? OR j.details LIKE ?)"
        args = [f"%{q.strip()}%"] * 2
    return [_jot_extras(j) for j in rows(conn.execute(sql + " ORDER BY j.created_at DESC, j.id DESC", args))]


@app.post("/api/jots", status_code=201)
def create_jot(data: JotIn, conn=Depends(get_db)):
    ts = now()
    cur = conn.execute(
        "INSERT INTO jots (body, details, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (data.body.strip(), data.details.strip(), (data.url or "").strip() or None, ts, ts),
    )
    return load_jot(conn, cur.lastrowid)


@app.patch("/api/jots/{jot_id}")
def update_jot(jot_id: int, data: JotPatch, conn=Depends(get_db)):
    j = load_jot(conn, jot_id)
    fields = {k: (v.strip() if isinstance(v, str) else v) for k, v in data.model_dump(exclude_unset=True).items()}
    if "url" in fields:
        fields["url"] = fields["url"] or None
    if j["status"] == "converted" and "status" in fields:
        raise HTTPException(409, "This note is already a ticket.")
    if fields:
        fields["updated_at"] = now()
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE jots SET {sets} WHERE id = ?", (*fields.values(), jot_id))
    return load_jot(conn, jot_id)


@app.delete("/api/jots/{jot_id}", status_code=204)
def delete_jot(jot_id: int, conn=Depends(get_db)):
    conn.execute("DELETE FROM jots WHERE id = ?", (jot_id,))


def split_topic(text: str) -> list[str]:
    """'wireguard, openvpn' -> ['wireguard', 'openvpn']. Splits on commas and new lines, drops repeats."""
    parts, seen = [], set()
    for part in re.split(r"[,\n]", text):
        part = part.strip(" -\t")
        if part and part.lower() not in seen:
            seen.add(part.lower())
            parts.append(part)
    return parts


@app.post("/api/jots/{jot_id}/split", status_code=201)
def split_jot(jot_id: int, conn=Depends(get_db)):
    """Turn one topic with several names into one topic per name. Notes and link are copied."""
    j = load_jot(conn, jot_id)
    if j["status"] == "converted":
        raise HTTPException(409, "This topic is already a ticket.")
    parts = split_topic(j["body"])
    if len(parts) < 2:
        raise HTTPException(422, "Nothing to split. Separate names with commas.")
    ts = now()
    new_ids = []
    for part in parts:
        cur = conn.execute(
            "INSERT INTO jots (body, details, url, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (part, j["details"], j["url"], j["status"], j["created_at"], ts),
        )
        new_ids.append(cur.lastrowid)
    conn.execute("DELETE FROM jots WHERE id = ?", (jot_id,))
    return [load_jot(conn, i) for i in new_ids]


@app.post("/api/jots/{jot_id}/convert", status_code=201)
def convert_jot(jot_id: int, data: JotConvert, conn=Depends(get_db)):
    """Turn a note into a board item. Fields not given come from the note."""
    j = load_jot(conn, jot_id)
    if j["status"] == "converted" and j["item_id"] and not j["item_deleted"]:
        raise HTTPException(409, f"This note is already {j['item_key']}.")
    # Title defaults to the note without its link and #tags (those go to the url and labels).
    title = data.title or re.sub(r"\s+", " ", _TAG.sub("", _URL.sub("", j["body"]))).strip(" -:") or j["body"]
    description = data.description if data.description is not None else j["details"]
    item_id = insert_item(conn, ItemIn(
        project_id=data.project_id,
        type=data.type,
        title=title[:300],
        description=description,
        status=data.status,
        priority=data.priority,
        url=data.url if data.url is not None else j["url"],
        labels=data.labels if data.labels is not None else j["tags"],
    ))
    log_history(conn, item_id, "from_inbox", None, j["body"][:200])
    ts = now()
    conn.execute(
        "UPDATE jots SET status = 'converted', item_id = ?, converted_at = ?, updated_at = ? WHERE id = ?",
        (item_id, ts, ts, jot_id),
    )
    return {"jot": load_jot(conn, jot_id), "item": load_item(conn, item_id)}


# --------------------------------------------------------------------------- revise

REVISION_SELECT = """
SELECT r.*, p.key || '-' || i.number AS item_key, i.title AS item_title, i.type AS item_type,
       i.deleted_at IS NOT NULL AS item_deleted,
       coalesce((SELECT sum(minutes) FROM revision_sessions s WHERE s.revision_id = r.id), 0) AS total_minutes,
       (SELECT count(*) FROM revision_sessions s WHERE s.revision_id = r.id) AS session_count,
       (SELECT max(created_at) FROM revision_sessions s WHERE s.revision_id = r.id) AS last_revised_at
FROM revisions r LEFT JOIN items i ON i.id = r.item_id LEFT JOIN projects p ON p.id = i.project_id
"""


def load_revision(conn, rid: int) -> dict:
    r = row(conn.execute(REVISION_SELECT + " WHERE r.id = ?", (rid,)))
    if not r:
        raise HTTPException(404, "Revision topic not found")
    return r


def _insert_revision(conn, title: str, notes: str, question: str, url: str | None,
                     source: str, item_id: int | None = None, priority: str = "none") -> dict:
    ts = now()
    cur = conn.execute(
        """INSERT INTO revisions (title, notes, question, url, item_id, source, priority, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (title.strip(), notes.strip(), question.strip(), (url or "").strip() or None, item_id, source, priority, ts, ts),
    )
    return load_revision(conn, cur.lastrowid)


@app.get("/api/revisions")
def list_revisions(conn=Depends(get_db)):
    # Active: by priority, then oldest first so long-waiting topics stay on top. Revised: most recent first.
    return rows(conn.execute(
        REVISION_SELECT + """ ORDER BY r.status = 'revised',
            CASE WHEN r.status = 'active' THEN CASE r.priority
                WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END END,
            CASE WHEN r.status = 'active' THEN r.created_at END ASC,
            CASE WHEN r.status = 'active' THEN r.id END ASC,
            r.revised_at DESC, r.id DESC"""))


@app.post("/api/revisions", status_code=201)
def create_revision(data: RevisionIn, conn=Depends(get_db)):
    return _insert_revision(conn, data.title, data.notes, data.question, data.url, "manual", priority=data.priority)


@app.patch("/api/revisions/{rid}")
def update_revision(rid: int, data: RevisionPatch, conn=Depends(get_db)):
    load_revision(conn, rid)
    fields = {k: (v.strip() if isinstance(v, str) else v) for k, v in data.model_dump(exclude_unset=True).items()}
    if "url" in fields:
        fields["url"] = fields["url"] or None
    if "status" in fields:
        if fields["status"] == "revised":
            _stop_revision_timer(conn, rid)  # a running session counts
        fields["revised_at"] = now() if fields["status"] == "revised" else None
    if fields:
        fields["updated_at"] = now()
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE revisions SET {sets} WHERE id = ?", (*fields.values(), rid))
    return load_revision(conn, rid)


def _log_session(conn, rid: int, minutes: int, at: str | None = None) -> None:
    conn.execute(
        "INSERT INTO revision_sessions (revision_id, minutes, created_at) VALUES (?, ?, ?)", (rid, minutes, at or now()))


def _stop_revision_timer(conn, rid: int) -> None:
    started = conn.execute("SELECT timer_started_at FROM revisions WHERE id = ?", (rid,)).fetchone()[0]
    if not started:
        return
    elapsed = datetime.fromisoformat(now()) - datetime.fromisoformat(started)
    _log_session(conn, rid, max(1, round(elapsed.total_seconds() / 60)))
    conn.execute("UPDATE revisions SET timer_started_at = NULL WHERE id = ?", (rid,))


@app.post("/api/revisions/{rid}/timer/start")
def start_revision_timer(rid: int, conn=Depends(get_db)):
    load_revision(conn, rid)
    conn.execute("UPDATE revisions SET timer_started_at = ? WHERE id = ? AND timer_started_at IS NULL", (now(), rid))
    return load_revision(conn, rid)


@app.post("/api/revisions/{rid}/timer/stop")
def stop_revision_timer(rid: int, conn=Depends(get_db)):
    load_revision(conn, rid)
    _stop_revision_timer(conn, rid)
    return load_revision(conn, rid)


@app.delete("/api/revisions/{rid}/timer", status_code=204)
def discard_revision_timer(rid: int, conn=Depends(get_db)):
    conn.execute("UPDATE revisions SET timer_started_at = NULL WHERE id = ?", (rid,))


@app.get("/api/revisions/{rid}/sessions")
def list_revision_sessions(rid: int, conn=Depends(get_db)):
    return rows(conn.execute(
        "SELECT * FROM revision_sessions WHERE revision_id = ? ORDER BY created_at DESC, id DESC", (rid,)))


@app.post("/api/revisions/{rid}/sessions", status_code=201)
def add_revision_session(rid: int, data: SessionIn, conn=Depends(get_db)):
    load_revision(conn, rid)
    _log_session(conn, rid, parse_duration(data.time_spent))
    return load_revision(conn, rid)


@app.delete("/api/revision-sessions/{sid}", status_code=204)
def delete_revision_session(sid: int, conn=Depends(get_db)):
    conn.execute("DELETE FROM revision_sessions WHERE id = ?", (sid,))


@app.delete("/api/revisions/{rid}", status_code=204)
def delete_revision(rid: int, conn=Depends(get_db)):
    conn.execute("DELETE FROM revisions WHERE id = ?", (rid,))


class RevisionConvert(BaseModel):
    project_id: int
    type: ItemType = "learning"
    status: Status = "backlog"
    priority: Priority | None = None


@app.post("/api/revisions/{rid}/convert", status_code=201)
def convert_revision(rid: int, data: RevisionConvert, conn=Depends(get_db)):
    """Create a ticket from a Revisit topic. The topic stays on Revisit, linked to the ticket."""
    rev = load_revision(conn, rid)
    if rev["item_id"] and not rev["item_deleted"]:
        raise HTTPException(409, f"This topic already has ticket {rev['item_key']}.")
    description = rev["notes"]
    if rev["question"]:
        description = f"{rev['question']}\n\n{description}".strip()
    item_id = insert_item(conn, ItemIn(
        project_id=data.project_id,
        type=data.type,
        title=rev["title"][:300],
        description=description,
        status=data.status,
        priority=data.priority or rev["priority"],
        url=rev["url"],
    ))
    log_history(conn, item_id, "from_revisit", None, rev["title"][:200])
    conn.execute("UPDATE revisions SET item_id = ?, updated_at = ? WHERE id = ?", (item_id, now(), rid))
    return {"revision": load_revision(conn, rid), "item": load_item(conn, item_id)}


@app.post("/api/items/{item_id}/revise", status_code=201)
def revise_item(item_id: int, conn=Depends(get_db)):
    """Put a ticket on the Revise list (once)."""
    item = load_item(conn, item_id)
    if item["revision_id"]:
        return load_revision(conn, item["revision_id"])
    rev = _insert_revision(conn, item["title"], item["description"], "", item["url"], "ticket", item_id)
    log_history(conn, item_id, "revise", None, None)
    return rev


@app.post("/api/jots/{jot_id}/revise", status_code=201)
def revise_jot(jot_id: int, conn=Depends(get_db)):
    """Move a Radar topic to the Revise list. The topic leaves Radar."""
    j = load_jot(conn, jot_id)
    rev = _insert_revision(conn, j["body"], j["details"], "", j["url"], "radar")
    conn.execute("DELETE FROM jots WHERE id = ?", (jot_id,))
    return rev


# --------------------------------------------------------------------------- search


@app.get("/api/search")
def search(q: str, conn=Depends(get_db)):
    tokens = re.findall(r"\w+", q, re.UNICODE)
    key = re.fullmatch(r"\s*([A-Za-z][A-Za-z0-9]*)-(\d+)\s*", q)
    results: dict[int, dict] = {}
    if key:
        for r in rows(conn.execute(ITEM_SELECT + " WHERE p.key = ? AND i.number = ?", (key[1].upper(), int(key[2])))):
            results[r["id"]] = {**_decode(r), "match": "key", "snippet": ""}
    if tokens:
        match = " ".join(f'"{t}"*' for t in tokens)
        for r in rows(conn.execute(
            """SELECT rowid AS id, snippet(items_fts, -1, '[', ']', '…', 12) AS snippet
               FROM items_fts JOIN live_items li ON li.id = items_fts.rowid
               WHERE items_fts MATCH ? ORDER BY rank LIMIT 30""", (match,))):
            if r["id"] not in results:
                results[r["id"]] = {**load_item(conn, r["id"]), "match": "item", "snippet": r["snippet"]}
        for r in rows(conn.execute(
            """SELECT c.item_id AS id, snippet(comments_fts, 0, '[', ']', '…', 12) AS snippet
               FROM comments_fts JOIN comments c ON c.id = comments_fts.rowid
               JOIN live_items li ON li.id = c.item_id
               WHERE comments_fts MATCH ? ORDER BY rank LIMIT 20""", (match,))):
            if r["id"] not in results:
                results[r["id"]] = {**load_item(conn, r["id"]), "match": "comment", "snippet": r["snippet"]}
    return list(results.values())[:30]


# --------------------------------------------------------------------------- daily review


@app.get("/api/reviews/{day}")
def get_review(day: date, conn=Depends(get_db)):
    r = row(conn.execute("SELECT * FROM daily_reviews WHERE date = ?", (day.isoformat(),)))
    return r or {"date": day.isoformat(), "went_well": "", "blockers": "", "tomorrow": "", "updated_at": None}


@app.put("/api/reviews/{day}")
def save_review(day: date, data: ReviewIn, conn=Depends(get_db)):
    conn.execute(
        """INSERT INTO daily_reviews (date, went_well, blockers, tomorrow, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(date) DO UPDATE SET went_well = excluded.went_well, blockers = excluded.blockers,
                                           tomorrow = excluded.tomorrow, updated_at = excluded.updated_at""",
        (day.isoformat(), data.went_well, data.blockers, data.tomorrow, now()),
    )
    return get_review(day, conn)


# --------------------------------------------------------------------------- stats


def _days(start: date, end: date) -> list[str]:
    return [(start + timedelta(days=n)).isoformat() for n in range((end - start).days + 1)]


def _per_day_by_type(conn, sql: str, start: date, end: date) -> list[dict]:
    """sql must select (day, type, value) for days in [?, ?]."""
    series = {d: {"date": d, "task": 0, "learning": 0, "note": 0} for d in _days(start, end)}
    for r in conn.execute(sql, (start.isoformat(), end.isoformat())):
        if r[0] in series:
            series[r[0]][r[1]] += r[2]
    return list(series.values())


def _range_stats(conn, start: date, end: date) -> dict:
    s, e = start.isoformat(), end.isoformat()
    completed = conn.execute(
        "SELECT count(*) FROM live_items WHERE substr(completed_at, 1, 10) BETWEEN ? AND ?", (s, e)).fetchone()[0]
    created = conn.execute(
        "SELECT count(*) FROM live_items WHERE substr(created_at, 1, 10) BETWEEN ? AND ?", (s, e)).fetchone()[0]
    minutes = conn.execute(
        """SELECT coalesce(sum(w.minutes), 0) FROM worklogs w JOIN live_items i ON i.id = w.item_id
           WHERE substr(w.started_at, 1, 10) BETWEEN ? AND ?""", (s, e)).fetchone()[0]
    learning_minutes = conn.execute(
        """SELECT coalesce(sum(w.minutes), 0) FROM worklogs w JOIN live_items i ON i.id = w.item_id
           WHERE i.type = 'learning' AND substr(w.started_at, 1, 10) BETWEEN ? AND ?""", (s, e)).fetchone()[0]
    return {"completed": completed, "created": created, "minutes": minutes, "learning_minutes": learning_minutes}


@app.get("/api/stats/overview")
def stats_overview(days: int = Query(default=30, ge=1, le=365), conn=Depends(get_db)):
    end = date.fromisoformat(today())
    start = end - timedelta(days=days - 1)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    t = today()
    return {
        "range": {"start": start.isoformat(), "end": end.isoformat(), "days": days},
        "current": _range_stats(conn, start, end),
        "previous": _range_stats(conn, prev_start, prev_end),
        "open": conn.execute("SELECT count(*) FROM live_items WHERE status != 'done'").fetchone()[0],
        "inbox_open": conn.execute("SELECT count(*) FROM jots WHERE status = 'open'").fetchone()[0],
        "revise_open": conn.execute("SELECT count(*) FROM revisions WHERE status = 'active'").fetchone()[0],
        "overdue": conn.execute(
            "SELECT count(*) FROM live_items WHERE status != 'done' AND due_date < ?", (t,)).fetchone()[0],
        "by_status": rows(conn.execute("SELECT status, count(*) AS count FROM live_items GROUP BY status")),
        "oldest_open": [_decode(r) for r in rows(conn.execute(
            ITEM_SELECT + " WHERE i.status != 'done' AND i.type != 'note' ORDER BY i.created_at LIMIT 6"))],
    }


@app.get("/api/reports/weekly")
def weekly_report(week_start: date | None = None, conn=Depends(get_db)):
    ref = week_start or date.fromisoformat(today())
    start = ref - timedelta(days=ref.weekday())  # Monday
    end = start + timedelta(days=6)
    s, e = start.isoformat(), end.isoformat()
    prev = _range_stats(conn, start - timedelta(days=7), start - timedelta(days=1))
    return {
        "week_start": s,
        "week_end": e,
        "current": _range_stats(conn, start, end),
        "previous": prev,
        "minutes_per_day": _per_day_by_type(conn, """
            SELECT substr(w.started_at, 1, 10), i.type, sum(w.minutes) FROM worklogs w
            JOIN live_items i ON i.id = w.item_id WHERE substr(w.started_at, 1, 10) BETWEEN ? AND ? GROUP BY 1, 2""",
            start, end),
        "minutes_by_project": rows(conn.execute("""
            SELECT p.id, p.key, p.name, p.color, p.icon, sum(w.minutes) AS minutes FROM worklogs w
            JOIN live_items i ON i.id = w.item_id JOIN projects p ON p.id = i.project_id
            WHERE substr(w.started_at, 1, 10) BETWEEN ? AND ? GROUP BY p.id ORDER BY minutes DESC""", (s, e))),
        "completed": [_decode(r) for r in rows(conn.execute(
            ITEM_SELECT + " WHERE substr(i.completed_at, 1, 10) BETWEEN ? AND ? ORDER BY i.completed_at", (s, e)))],
        "unfinished": [_decode(r) for r in rows(conn.execute(
            ITEM_SELECT + """ WHERE i.status != 'done' AND (i.status IN ('today', 'in_progress') OR i.due_date <= ?)
                             ORDER BY i.due_date IS NULL, i.due_date""", (e,)))],
        "jots_captured": conn.execute(
            "SELECT count(*) FROM jots WHERE substr(created_at, 1, 10) BETWEEN ? AND ?", (s, e)).fetchone()[0],
        "jots_converted": conn.execute(
            "SELECT count(*) FROM jots WHERE substr(converted_at, 1, 10) BETWEEN ? AND ?", (s, e)).fetchone()[0],
        "reviews": rows(conn.execute(
            "SELECT * FROM daily_reviews WHERE date BETWEEN ? AND ? ORDER BY date", (s, e))),
    }


# --------------------------------------------------------------------------- settings and backups


@app.get("/api/settings")
def get_settings(conn=Depends(get_db)):
    return {
        "version": VERSION,
        "obsidian": obsidian.vault_status(conn),
        "backup_dir": backup.BACKUP_DIR,
        "timezone": os.environ.get("TZ", "UTC"),
        "auto_reexport": get_setting(conn, "auto_reexport", "1") == "1",
        "monthly_backup": get_setting(conn, "monthly_backup", "1") == "1",
        "trash_days": TRASH_DAYS,
        "quotes_on_dashboard": get_setting(conn, "quotes_on_dashboard", "1") == "1",
        "quotes_on_board": get_setting(conn, "quotes_on_board", "1") == "1",
        "quotes_interval": int(get_setting(conn, "quotes_interval", "20")),
        "weekend_mode": get_setting(conn, "weekend_mode", "0") == "1",
    }


@app.put("/api/settings")
def save_settings(data: SettingsIn, conn=Depends(get_db)):
    if data.obsidian_folder is not None:
        folder = data.obsidian_folder.strip().strip("/")
        if not folder or ".." in folder.split("/"):
            raise HTTPException(422, "Folder must be inside the vault.")
        set_setting(conn, "obsidian_folder", folder)
    if data.obsidian_articles_folder is not None:
        folder = data.obsidian_articles_folder.strip().strip("/")
        if not folder or ".." in folder.split("/"):
            raise HTTPException(422, "Folder must be inside the vault.")
        set_setting(conn, "obsidian_articles_folder", folder)
    for key in ("auto_reexport", "monthly_backup", "quotes_on_dashboard", "quotes_on_board", "weekend_mode"):
        value = getattr(data, key)
        if value is not None:
            set_setting(conn, key, "1" if value else "0")
    if data.quotes_interval is not None:
        set_setting(conn, "quotes_interval", str(data.quotes_interval))
    return get_settings(conn)


# --------------------------------------------------------------------------- quotes


@app.get("/api/quotes")
def list_quotes(conn=Depends(get_db)):
    return rows(conn.execute("SELECT * FROM quotes ORDER BY id"))


@app.post("/api/quotes", status_code=201)
def add_quote(data: QuoteIn, conn=Depends(get_db)):
    cur = conn.execute(
        "INSERT INTO quotes (text, author, created_at) VALUES (?, ?, ?)",
        (data.text.strip(), data.author.strip(), now()),
    )
    return row(conn.execute("SELECT * FROM quotes WHERE id = ?", (cur.lastrowid,)))


@app.patch("/api/quotes/{quote_id}")
def edit_quote(quote_id: int, data: QuoteIn, conn=Depends(get_db)):
    conn.execute("UPDATE quotes SET text = ?, author = ? WHERE id = ?", (data.text.strip(), data.author.strip(), quote_id))
    q = row(conn.execute("SELECT * FROM quotes WHERE id = ?", (quote_id,)))
    if not q:
        raise HTTPException(404, "Quote not found")
    return q


@app.delete("/api/quotes/{quote_id}", status_code=204)
def delete_quote(quote_id: int, conn=Depends(get_db)):
    conn.execute("DELETE FROM quotes WHERE id = ?", (quote_id,))


# --------------------------------------------------------------------------- reading list

ArticleStatus = Literal["unread", "reading", "read"]


class ArticleIn(BaseModel):
    url: str = Field(min_length=4, max_length=2000)
    title: str = Field(default="", max_length=300)
    site: str = Field(default="", max_length=120)
    author: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=1000)
    image: str | None = Field(default=None, max_length=2000)
    notes: str = Field(default="", max_length=50_000)
    tags: list[str] = []
    status: ArticleStatus = "unread"
    collection_ids: list[int] = []
    export: bool = False


class ArticlePatch(BaseModel):
    url: str | None = Field(default=None, min_length=4, max_length=2000)
    title: str | None = Field(default=None, min_length=1, max_length=300)
    site: str | None = Field(default=None, max_length=120)
    author: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=50_000)
    tags: list[str] | None = None
    status: ArticleStatus | None = None
    favorite: bool | None = None
    collection_ids: list[int] | None = None
    folder_collection_id: int | None = Field(default=None, description="Which collection's folder holds the note")


class CollectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class PreviewIn(BaseModel):
    url: str = Field(min_length=4, max_length=2000)


def _norm_url(url: str) -> str:
    url = url.strip()
    return url if re.match(r"^https?://", url, re.I) else "https://" + url


def _clean_tags(tags: list[str]) -> list[str]:
    seen: list[str] = []
    for t in tags:
        t = t.strip().lstrip("#").strip().lower()
        if t and t not in seen:
            seen.append(t[:40])
    return seen


def _with_collections(conn, articles: list[dict]) -> list[dict]:
    """Decode tags and attach collections (the note's folder first, then by when added)."""
    by_article: dict[int, list[dict]] = {}
    for r in conn.execute(
        """SELECT ac.article_id, c.id, c.name FROM article_collections ac
           JOIN collections c ON c.id = ac.collection_id
           JOIN articles a ON a.id = ac.article_id
           ORDER BY ac.article_id, c.id = a.collection_id DESC, ac.added_at, c.id"""):
        by_article.setdefault(r[0], []).append({"id": r[1], "name": r[2]})
    for a in articles:
        a["tags"] = json.loads(a["tags"] or "[]")
        a["collections"] = by_article.get(a["id"], [])
        a["folder_name"] = next((c["name"] for c in a["collections"] if c["id"] == a["collection_id"]), None)
    return articles


def load_article(conn, aid: int) -> dict:
    a = row(conn.execute("SELECT * FROM articles WHERE id = ?", (aid,)))
    if not a:
        raise HTTPException(404, "Article not found")
    return _with_collections(conn, [a])[0]


def _set_collections(conn, aid: int, ids: list[int], folder_id: int | None = None) -> None:
    """Replace an article's collections. The note folder stays if still a member, else the first one."""
    ids = list(dict.fromkeys(ids))
    known = {r[0] for r in conn.execute(
        f"SELECT id FROM collections WHERE id IN ({','.join('?' * len(ids))})", ids)} if ids else set()
    if missing := [i for i in ids if i not in known]:
        raise HTTPException(404, f"Collection not found: {missing[0]}")
    ts = now()
    if ids:
        conn.execute(f"DELETE FROM article_collections WHERE article_id = ? AND collection_id NOT IN ({','.join('?' * len(ids))})",
                     (aid, *ids))
    else:
        conn.execute("DELETE FROM article_collections WHERE article_id = ?", (aid,))
    for cid in ids:
        conn.execute("INSERT OR IGNORE INTO article_collections (article_id, collection_id, added_at) VALUES (?, ?, ?)",
                     (aid, cid, ts))
    current = conn.execute("SELECT collection_id FROM articles WHERE id = ?", (aid,)).fetchone()[0]
    if folder_id is not None and folder_id in ids:
        current = folder_id
    elif current not in ids:
        current = ids[0] if ids else None
    conn.execute("UPDATE articles SET collection_id = ? WHERE id = ?", (current, aid))


def _reexport_articles(conn, where: str, args: tuple) -> None:
    """Rewrite notes after a collection change (moves them between subfolders)."""
    if get_setting(conn, "auto_reexport", "1") != "1":
        return
    for (aid,) in conn.execute(f"SELECT id FROM articles WHERE obsidian_path IS NOT NULL AND ({where})", args).fetchall():
        try:
            obsidian.export_article(conn, load_article(conn, aid))
        except obsidian.ExportError:
            logging.warning("Could not re-export article %s", aid)


def _export_article(conn, aid: int) -> dict:
    try:
        obsidian.export_article(conn, load_article(conn, aid))
    except obsidian.ExportError as exc:
        raise HTTPException(400, str(exc))
    return load_article(conn, aid)


@app.post("/api/preview")
@app.post("/api/articles/preview")
def link_preview(data: PreviewIn):
    """Title, site, author, summary and image for a link. YouTube uses oEmbed for the real video title."""
    return linkpreview.preview(_norm_url(data.url))


_THUMB_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}


def _thumb_response(source: str | list[str] | None):
    path = thumbs.get_first(source) if isinstance(source, list) else thumbs.get(source) if source else None
    if not path:
        # A plain 404 response, not an exception, so the request's database changes still commit.
        return Response(status_code=404, headers={"Cache-Control": "public, max-age=86400"})
    return FileResponse(path, media_type="image/webp", headers=_THUMB_HEADERS)


@app.get("/api/items/{item_id}/thumb")
def item_thumb(item_id: int, conn=Depends(get_db)):
    item = row(conn.execute("SELECT url, thumb FROM items WHERE id = ?", (item_id,)))
    if not item or not item["url"]:
        raise HTTPException(404, "No thumbnail")
    if video := linkpreview.youtube_id(item["url"]):
        return _thumb_response(linkpreview.youtube_thumbs(video))
    source = item["thumb"]
    if source is None:  # first time: look for the page's preview image, remember the answer
        source = linkpreview.preview(item["url"]).get("image") or ""
        conn.execute("UPDATE items SET thumb = ? WHERE id = ?", (source, item_id))
    return _thumb_response(source)


@app.get("/api/articles/{aid}/thumb")
def article_thumb(aid: int, conn=Depends(get_db)):
    a = row(conn.execute("SELECT url, image FROM articles WHERE id = ?", (aid,)))
    if not a:
        raise HTTPException(404, "No thumbnail")
    video = linkpreview.youtube_id(a["url"])
    return _thumb_response(linkpreview.youtube_thumbs(video) if video else a["image"])


@app.get("/api/articles")
def list_articles(conn=Depends(get_db)):
    return _with_collections(conn, rows(conn.execute("SELECT * FROM articles ORDER BY created_at DESC, id DESC")))


@app.post("/api/articles", status_code=201)
def create_article(data: ArticleIn, conn=Depends(get_db)):
    url = _norm_url(data.url)
    dup = row(conn.execute("SELECT id, title FROM articles WHERE url = ?", (url,)))
    if dup:
        raise HTTPException(409, f"Already in your reading list: {dup['title']}")
    ts = now()
    cur = conn.execute(
        """INSERT INTO articles (url, title, site, author, description, image, notes, tags, status,
                                 created_at, updated_at, read_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (url, data.title.strip() or linkpreview.site_of(url) or url, data.site.strip() or linkpreview.site_of(url),
         data.author.strip(), data.description.strip(), data.image, data.notes.strip(),
         json.dumps(_clean_tags(data.tags)), data.status, ts, ts, ts if data.status == "read" else None),
    )
    if data.collection_ids:
        _set_collections(conn, cur.lastrowid, data.collection_ids)
    if data.export:
        return _export_article(conn, cur.lastrowid)
    return load_article(conn, cur.lastrowid)


@app.patch("/api/articles/{aid}")
def update_article(aid: int, data: ArticlePatch, conn=Depends(get_db)):
    before = load_article(conn, aid)
    updates = data.model_dump(exclude_unset=True)
    collection_ids = updates.pop("collection_ids", None)
    folder_id = updates.pop("folder_collection_id", None)
    if collection_ids is not None or folder_id is not None:
        ids = collection_ids if collection_ids is not None else [c["id"] for c in before["collections"]]
        _set_collections(conn, aid, ids, folder_id)
        updates.setdefault("updated_at", now())
    if "url" in updates:
        updates["url"] = _norm_url(updates["url"])
    if "tags" in updates:
        updates["tags"] = json.dumps(_clean_tags(updates["tags"]))
    if "favorite" in updates:
        updates["favorite"] = 1 if updates["favorite"] else 0
    for key in ("title", "site", "author", "description", "notes"):
        if key in updates:
            updates[key] = updates[key].strip()
    if "status" in updates and updates["status"] != before["status"]:
        updates["read_at"] = now() if updates["status"] == "read" else None
    if not updates:
        return before
    updates["updated_at"] = now()
    if collection_ids is not None or folder_id is not None:
        updates["_collections"] = True
    changed_collections = updates.pop("_collections", False)
    sets = ", ".join(f"{k} = ?" for k in updates)
    conn.execute(f"UPDATE articles SET {sets} WHERE id = ?", (*updates.values(), aid))
    if changed_collections:
        updates["collections"] = True
    # Keep the Obsidian note in step, like video notes.
    note_fields = {"url", "title", "site", "author", "description", "notes", "tags", "status", "collections"}
    if before["obsidian_path"] and note_fields & updates.keys() and get_setting(conn, "auto_reexport", "1") == "1":
        try:
            obsidian.export_article(conn, load_article(conn, aid))
        except obsidian.ExportError:
            logging.warning("Could not re-export article %s", aid)
    return load_article(conn, aid)


@app.post("/api/articles/{aid}/export")
def export_article(aid: int, conn=Depends(get_db)):
    return _export_article(conn, aid)


@app.delete("/api/articles/{aid}", status_code=204)
def delete_article(aid: int, conn=Depends(get_db)):
    conn.execute("DELETE FROM articles WHERE id = ?", (aid,))


@app.get("/api/collections")
def list_collections(conn=Depends(get_db)):
    return rows(conn.execute(
        """SELECT c.*, (SELECT count(*) FROM article_collections ac WHERE ac.collection_id = c.id) AS count
           FROM collections c ORDER BY c.name COLLATE NOCASE"""))


def _collection_name(conn, name: str, skip_id: int | None = None) -> str:
    name = re.sub(r"\s+", " ", name).strip()
    if not name or obsidian._safe_filename(name) == "Untitled":
        raise HTTPException(422, "Give the collection a name.")
    if row(conn.execute("SELECT id FROM collections WHERE name = ? COLLATE NOCASE AND id IS NOT ?", (name, skip_id))):
        raise HTTPException(409, f"A collection named {name} already exists.")
    return name


@app.post("/api/collections", status_code=201)
def create_collection(data: CollectionIn, conn=Depends(get_db)):
    cur = conn.execute("INSERT INTO collections (name, created_at) VALUES (?, ?)", (_collection_name(conn, data.name), now()))
    return {**row(conn.execute("SELECT * FROM collections WHERE id = ?", (cur.lastrowid,))), "count": 0}


@app.patch("/api/collections/{cid}")
def rename_collection(cid: int, data: CollectionIn, conn=Depends(get_db)):
    if not row(conn.execute("SELECT id FROM collections WHERE id = ?", (cid,))):
        raise HTTPException(404, "Collection not found")
    conn.execute("UPDATE collections SET name = ? WHERE id = ?", (_collection_name(conn, data.name, cid), cid))
    # Notes in this collection's folder move to the renamed folder; others list the new name.
    _reexport_articles(conn, "id IN (SELECT article_id FROM article_collections WHERE collection_id = ?)", (cid,))
    return next(c for c in list_collections(conn) if c["id"] == cid)


@app.delete("/api/collections/{cid}", status_code=204)
def delete_collection(cid: int, conn=Depends(get_db)):
    """Articles stay. Those whose note lived in this folder move to another collection or to the main folder."""
    affected = [r[0] for r in conn.execute("SELECT article_id FROM article_collections WHERE collection_id = ?", (cid,))]
    conn.execute("DELETE FROM article_collections WHERE collection_id = ?", (cid,))
    for aid in affected:
        remaining = [r[0] for r in conn.execute(
            "SELECT collection_id FROM article_collections WHERE article_id = ? ORDER BY added_at", (aid,))]
        _set_collections(conn, aid, remaining)
    conn.execute("DELETE FROM collections WHERE id = ?", (cid,))
    if affected:
        _reexport_articles(conn, f"id IN ({','.join('?' * len(affected))})", tuple(affected))


# --------------------------------------------------------------------------- weekend

Slot = Literal["morning", "afternoon", "evening"]
LifeCategory = Literal["travel", "movie", "outing", "social", "fitness", "hobby", "chores", "rest", "other"]


class IdeaIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    category: LifeCategory = "other"
    note: str = Field(default="", max_length=2000)
    url: str | None = None


class IdeaPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    category: LifeCategory | None = None
    note: str | None = Field(default=None, max_length=2000)
    url: str | None = None
    done: bool | None = None


class PlanIn(BaseModel):
    day: date
    slot: Slot
    kind: Literal["study", "revise", "life"] = "life"
    title: str | None = Field(default=None, max_length=300)
    category: LifeCategory = "other"
    item_id: int | None = None
    revision_id: int | None = None
    idea_id: int | None = None


class PlanPatch(BaseModel):
    day: date | None = None
    slot: Slot | None = None
    title: str | None = Field(default=None, min_length=1, max_length=300)
    category: LifeCategory | None = None
    done: bool | None = None
    position: float | None = None


PLAN_SELECT = """
SELECT w.id, w.day, w.slot, w.kind, w.category, w.item_id, w.revision_id, w.idea_id, w.done, w.position,
       w.created_at, p.key || '-' || i.number AS item_key, i.type AS item_type, i.status AS item_status,
       coalesce(i.title, r.title, w.title) AS title
FROM weekend_plan w
LEFT JOIN live_items i ON i.id = w.item_id
LEFT JOIN projects p ON p.id = i.project_id
LEFT JOIN revisions r ON r.id = w.revision_id
"""


def weekend_of(day: date) -> date:
    """Saturday of the weekend that contains `day`, or the next one on a weekday."""
    if day.weekday() == 6:
        return day - timedelta(days=1)
    return day + timedelta(days=(5 - day.weekday()) % 7)


def _check_weekend_day(day: date) -> None:
    if day.weekday() not in (5, 6):
        raise HTTPException(422, "Weekend plans are for Saturday or Sunday.")


def load_plan_entry(conn, eid: int) -> dict:
    e = row(conn.execute(PLAN_SELECT + " WHERE w.id = ?", (eid,)))
    if not e:
        raise HTTPException(404, "Plan entry not found")
    return e


def load_idea(conn, iid: int) -> dict:
    idea = row(conn.execute("SELECT * FROM weekend_ideas WHERE id = ?", (iid,)))
    if not idea:
        raise HTTPException(404, "Idea not found")
    return idea


@app.get("/api/weekend")
def get_weekend(day: date | None = None, conn=Depends(get_db)):
    sat = weekend_of(day or date.fromisoformat(today()))
    sun = sat + timedelta(days=1)
    entries = rows(conn.execute(
        PLAN_SELECT + " WHERE w.day BETWEEN ? AND ? ORDER BY w.day, w.position, w.id", (sat.isoformat(), sun.isoformat())))
    return {
        "saturday": sat.isoformat(),
        "sunday": sun.isoformat(),
        "entries": entries,
        "previous": (sat - timedelta(days=7)).isoformat(),
        "next": (sat + timedelta(days=7)).isoformat(),
    }


@app.post("/api/weekend/entries", status_code=201)
def add_plan_entry(data: PlanIn, conn=Depends(get_db)):
    _check_weekend_day(data.day)
    kind, title, category = data.kind, (data.title or "").strip(), data.category
    if data.item_id:
        item = row(conn.execute("SELECT title FROM live_items WHERE id = ?", (data.item_id,)))
        if not item:
            raise HTTPException(404, "Item not found")
        kind, title = "study", item["title"]
    elif data.revision_id:
        rev = row(conn.execute("SELECT title FROM revisions WHERE id = ?", (data.revision_id,)))
        if not rev:
            raise HTTPException(404, "Revisit topic not found")
        kind, title = "revise", rev["title"]
    elif data.idea_id:
        idea = load_idea(conn, data.idea_id)
        kind, title, category = "life", idea["title"], idea["category"]
    if not title:
        raise HTTPException(422, "Give the activity a name.")
    last = conn.execute(
        "SELECT max(position) FROM weekend_plan WHERE day = ? AND slot = ?", (data.day.isoformat(), data.slot)).fetchone()[0]
    cur = conn.execute(
        """INSERT INTO weekend_plan (day, slot, kind, title, category, item_id, revision_id, idea_id, position, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.day.isoformat(), data.slot, kind, title, category, data.item_id, data.revision_id, data.idea_id,
         (last or 0) + 1000, now()),
    )
    return load_plan_entry(conn, cur.lastrowid)


@app.patch("/api/weekend/entries/{eid}")
def update_plan_entry(eid: int, data: PlanPatch, conn=Depends(get_db)):
    entry = load_plan_entry(conn, eid)
    updates = data.model_dump(exclude_unset=True)
    if "day" in updates:
        _check_weekend_day(updates["day"])
        updates["day"] = updates["day"].isoformat()
    if "title" in updates:
        updates["title"] = updates["title"].strip()
    if "done" in updates:
        updates["done"] = 1 if updates["done"] else 0
        if entry["idea_id"]:  # doing an idea ticks it off the ideas list
            conn.execute("UPDATE weekend_ideas SET done_at = ? WHERE id = ?",
                         (now() if updates["done"] else None, entry["idea_id"]))
    if updates:
        sets = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE weekend_plan SET {sets} WHERE id = ?", (*updates.values(), eid))
    return load_plan_entry(conn, eid)


@app.delete("/api/weekend/entries/{eid}", status_code=204)
def delete_plan_entry(eid: int, conn=Depends(get_db)):
    conn.execute("DELETE FROM weekend_plan WHERE id = ?", (eid,))


@app.get("/api/weekend/ideas")
def list_ideas(conn=Depends(get_db)):
    # planned_day: the next upcoming weekend day this idea is planned for and not yet done.
    return rows(conn.execute(
        """SELECT d.*, (SELECT min(w.day) FROM weekend_plan w
                        WHERE w.idea_id = d.id AND w.done = 0 AND w.day >= ?) AS planned_day
           FROM weekend_ideas d ORDER BY d.done_at IS NOT NULL, coalesce(d.done_at, '') DESC, d.id DESC""",
        (today(),)))


@app.post("/api/weekend/ideas", status_code=201)
def add_idea(data: IdeaIn, conn=Depends(get_db)):
    cur = conn.execute(
        "INSERT INTO weekend_ideas (title, category, note, url, created_at) VALUES (?, ?, ?, ?, ?)",
        (data.title.strip(), data.category, data.note.strip(), (data.url or "").strip() or None, now()),
    )
    return load_idea(conn, cur.lastrowid)


@app.patch("/api/weekend/ideas/{iid}")
def update_idea(iid: int, data: IdeaPatch, conn=Depends(get_db)):
    load_idea(conn, iid)
    updates = data.model_dump(exclude_unset=True)
    if "done" in updates:
        updates["done_at"] = now() if updates.pop("done") else None
    if "url" in updates:
        updates["url"] = (updates["url"] or "").strip() or None
    for key in ("title", "note"):
        if key in updates:
            updates[key] = updates[key].strip()
    if updates:
        sets = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE weekend_ideas SET {sets} WHERE id = ?", (*updates.values(), iid))
        if "title" in updates or "category" in updates:  # keep planned copies in step
            idea = load_idea(conn, iid)
            conn.execute("UPDATE weekend_plan SET title = ?, category = ? WHERE idea_id = ?",
                         (idea["title"], idea["category"], iid))
    return load_idea(conn, iid)


@app.delete("/api/weekend/ideas/{iid}", status_code=204)
def delete_idea(iid: int, conn=Depends(get_db)):
    conn.execute("DELETE FROM weekend_ideas WHERE id = ?", (iid,))


@app.get("/api/backups")
def get_backups():
    return backup.list_backups()


@app.post("/api/backups", status_code=201)
def create_backup():
    path = backup.make_backup()
    return {"path": os.path.relpath(path, backup.BACKUP_DIR)}


@app.get("/api/health")
def health():
    return {"ok": True, "version": VERSION}


# --------------------------------------------------------------------------- frontend

if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = os.path.realpath(os.path.join(STATIC_DIR, path))
        if path and candidate.startswith(os.path.realpath(STATIC_DIR)) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
