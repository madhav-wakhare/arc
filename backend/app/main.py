import calendar
import json
import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import backup, obsidian
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


class SettingsIn(BaseModel):
    obsidian_folder: str | None = Field(default=None, min_length=1, max_length=200)
    auto_reexport: bool | None = None
    monthly_backup: bool | None = None


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
       (SELECT count(*) FROM comments c WHERE c.item_id = i.id) AS comment_count
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
    return rows(conn.execute("SELECT * FROM comments WHERE item_id = ? ORDER BY created_at DESC, id DESC", (item_id,)))


@app.post("/api/items/{item_id}/comments", status_code=201)
def add_comment(item_id: int, data: CommentIn, conn=Depends(get_db)):
    load_item(conn, item_id)
    cur = conn.execute("INSERT INTO comments (item_id, body, created_at) VALUES (?, ?, ?)", (item_id, data.body, now()))
    return row(conn.execute("SELECT * FROM comments WHERE id = ?", (cur.lastrowid,)))


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
    }


@app.put("/api/settings")
def save_settings(data: SettingsIn, conn=Depends(get_db)):
    if data.obsidian_folder is not None:
        folder = data.obsidian_folder.strip().strip("/")
        if not folder or ".." in folder.split("/"):
            raise HTTPException(422, "Folder must be inside the vault.")
        set_setting(conn, "obsidian_folder", folder)
    for key in ("auto_reexport", "monthly_backup"):
        value = getattr(data, key)
        if value is not None:
            set_setting(conn, key, "1" if value else "0")
    return get_settings(conn)


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
