"""End-to-end API tests against a temporary database, vault and backup folder."""

import importlib
import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    (tmp_path / "vault" / ".obsidian").mkdir(parents=True)
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("VAULT_DIR", str(tmp_path / "vault"))
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "backups"))
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "no-static"))
    monkeypatch.setenv("TZ", "Asia/Kolkata")
    import app.db, app.obsidian, app.backup, app.main  # noqa: E401

    for mod in (app.db, app.obsidian, app.backup, app.main):
        importlib.reload(mod)
    with TestClient(app.main.app) as c:
        c.vault = tmp_path / "vault"
        c.backups = tmp_path / "backups"
        yield c


def _learning(c, **extra):
    lrn = next(p for p in c.get("/api/projects").json() if p["key"] == "LRN")
    body = {"project_id": lrn["id"], "type": "learning", "title": "K8s Pods", "url": "https://youtu.be/abc"}
    return c.post("/api/items", json={**body, **extra}).json()


def test_create_and_key(client):
    item = _learning(client)
    assert item["key"] == "LRN-1"
    assert item["status"] == "backlog"


def test_obsidian_export_and_overwrite_on_rename(client):
    item = _learning(client)
    r = client.post(f"/api/items/{item['id']}/export")
    assert r.status_code == 200
    assert r.json()["obsidian_path"] == "Smriti/Videos/K8s Pods.md"

    renamed = client.patch(f"/api/items/{item['id']}", json={"title": "K8s Pods v2"}).json()
    assert renamed["obsidian_path"] == "Smriti/Videos/K8s Pods v2.md"
    folder = client.vault / "Smriti" / "Videos"
    assert os.listdir(folder) == ["K8s Pods v2.md"]
    assert "smriti_id: LRN-1" in (folder / "K8s Pods v2.md").read_text()


def test_worklog_parsing(client):
    item = _learning(client)
    ok = client.post(f"/api/items/{item['id']}/worklogs", json={"time_spent": "1h 30m"})
    assert ok.json()["minutes"] == 90
    assert client.post(f"/api/items/{item['id']}/worklogs", json={"time_spent": "1d"}).json()["minutes"] == 480
    assert client.post(f"/api/items/{item['id']}/worklogs", json={"time_spent": "abc"}).status_code == 422


def test_recurrence_spawns_next(client):
    item = _learning(client, recurrence="weekly", due_date="2026-10-10")
    done = client.patch(f"/api/items/{item['id']}", json={"status": "done"}).json()
    nxt = client.get(f"/api/items/{done['recurrence_next_id']}").json()
    assert nxt["due_date"] == "2026-10-17"
    assert nxt["status"] == "backlog"


def test_search_comments_and_key(client):
    item = _learning(client)
    client.post(f"/api/items/{item['id']}/comments", json={"body": "great kubelet explanation"})
    assert [h["key"] for h in client.get("/api/search", params={"q": "kubel"}).json()] == ["LRN-1"]
    assert [h["key"] for h in client.get("/api/search", params={"q": "lrn-1"}).json()] == ["LRN-1"]


def test_timer_and_backup(client):
    item = _learning(client)
    client.post(f"/api/items/{item['id']}/timer/start")
    assert client.get("/api/timer").json()["key"] == "LRN-1"
    assert client.post("/api/timer/stop").json()["minutes"] >= 1
    assert client.post("/api/backups").status_code == 201
    assert client.get("/api/backups").json()


def test_stats_endpoints(client):
    _learning(client)
    assert client.get("/api/stats/overview?days=7").status_code == 200
    assert client.get("/api/reports/weekly").status_code == 200


def test_item_trash_restore_and_purge(client):
    item = _learning(client)
    client.post(f"/api/items/{item['id']}/timer/start")
    assert client.delete(f"/api/items/{item['id']}").status_code == 204
    assert client.get("/api/timer").json() is None  # timer stopped and logged
    assert client.get(f"/api/items/{item['id']}").status_code == 404
    assert client.get("/api/items").json() == []
    assert client.get("/api/search", params={"q": "pods"}).json() == []

    trash = client.get("/api/trash").json()
    assert [i["key"] for i in trash["items"]] == ["LRN-1"]
    assert trash["items"][0]["days_left"] == 30

    assert client.post(f"/api/trash/items/{item['id']}/restore").status_code == 200
    assert len(client.get("/api/items").json()) == 1

    client.delete(f"/api/items/{item['id']}")
    assert client.delete(f"/api/trash/items/{item['id']}").status_code == 204
    assert client.get("/api/trash").json()["items"] == []


def test_project_trash_restores_only_its_batch(client):
    lrn = next(p for p in client.get("/api/projects").json() if p["key"] == "LRN")
    early = _learning(client, title="deleted earlier")
    keep = _learning(client, title="deleted with project")
    client.delete(f"/api/items/{early['id']}")
    import time; time.sleep(1.1)  # distinct deleted_at
    assert client.delete(f"/api/projects/{lrn['id']}").status_code == 204
    assert "LRN" not in [p["key"] for p in client.get("/api/projects").json()]

    trash = client.get("/api/trash").json()
    assert [p["key"] for p in trash["projects"]] == ["LRN"]
    assert client.post("/api/projects", json={"key": "LRN", "name": "x"}).status_code == 409

    client.post(f"/api/trash/projects/{lrn['id']}/restore")
    titles = [i["title"] for i in client.get("/api/items").json()]
    assert titles == ["deleted with project"]
    assert keep["id"] in [i["id"] for i in client.get("/api/items").json()]


def test_purge_after_30_days(client):
    import app.db as db

    item = _learning(client)
    client.delete(f"/api/items/{item['id']}")
    with db.transaction() as conn:
        conn.execute("UPDATE items SET deleted_at = '2000-01-01T00:00:00' WHERE id = ?", (item["id"],))
    assert db.purge_trash() == 1
    assert client.get("/api/trash").json()["items"] == []


def test_settings_switches(client):
    s = client.put("/api/settings", json={"auto_reexport": False, "monthly_backup": False}).json()
    assert s["auto_reexport"] is False and s["monthly_backup"] is False
    assert client.put("/api/settings", json={"obsidian_folder": "Notes/Links"}).json()["obsidian"]["folder"] == "Notes/Links"
    assert client.patch("/api/projects/1", json={"archived": True}).json()["archived"] == 1


def test_migration_from_v010(tmp_path, monkeypatch):
    """A v0.1.0 database (no trash columns) upgrades in place and gets a backup first."""
    import sqlite3

    import app.db as db

    old_schema = (
        db.SCHEMA.replace("    archived INTEGER NOT NULL DEFAULT 0,\n", "")
        .replace("    created_at TEXT NOT NULL,\n    deleted_at TEXT\n);", "    created_at TEXT NOT NULL\n);")
        .replace("    completed_at TEXT,\n    deleted_at TEXT\n);", "    completed_at TEXT\n);")
    )
    (tmp_path / "data").mkdir()
    conn = sqlite3.connect(tmp_path / "data" / "smriti.db")
    conn.executescript(old_schema)
    conn.execute("INSERT INTO projects (key, name, created_at) VALUES ('OLD', 'Old', '2026-01-01T00:00:00')")
    conn.commit()
    conn.close()

    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "backups"))
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "no-static"))
    import app.backup, app.main, app.obsidian  # noqa: E401

    for mod in (db, app.obsidian, app.backup, app.main):
        importlib.reload(mod)
    assert db.needs_migration()
    with TestClient(app.main.app) as c:
        assert [p["key"] for p in c.get("/api/projects").json()] == ["OLD"]
        assert c.get("/api/trash").status_code == 200
    assert list((tmp_path / "backups").rglob("smriti-*.db"))
    assert not db.needs_migration()


def test_inbox_capture_and_convert(client):
    j = client.post("/api/jots", json={"body": "vLLM https://docs.vllm.ai #gpu #inference", "details": "heard in standup"}).json()
    assert j["status"] == "open" and j["url"] == "https://docs.vllm.ai" and j["tags"] == ["gpu", "inference"]
    assert client.get("/api/items").json() == []  # notes stay out of the board
    assert client.get("/api/stats/overview?days=7").json()["inbox_open"] == 1

    lrn = next(p for p in client.get("/api/projects").json() if p["key"] == "LRN")
    out = client.post(f"/api/jots/{j['id']}/convert", json={"project_id": lrn["id"], "type": "learning"}).json()
    item = out["item"]
    assert item["key"] == "LRN-1" and item["title"] == "vLLM"
    assert item["url"] == "https://docs.vllm.ai" and item["labels"] == ["gpu", "inference"]
    assert item["description"] == "heard in standup"
    assert out["jot"]["status"] == "converted" and out["jot"]["item_key"] == "LRN-1"
    # cannot convert twice
    assert client.post(f"/api/jots/{j['id']}/convert", json={"project_id": lrn["id"]}).status_code == 409


def test_inbox_archive_search_delete(client):
    a = client.post("/api/jots", json={"body": "tmux sessions"}).json()
    client.post("/api/jots", json={"body": "Langfuse tracing"})
    assert [x["body"] for x in client.get("/api/jots", params={"q": "langfuse"}).json()] == ["Langfuse tracing"]
    assert client.patch(f"/api/jots/{a['id']}", json={"status": "archived"}).json()["status"] == "archived"
    assert client.delete(f"/api/jots/{a['id']}").status_code == 204
    assert len(client.get("/api/jots").json()) == 1


def test_jot_explicit_url(client):
    j = client.post("/api/jots", json={"body": "Langfuse", "url": "https://langfuse.com"}).json()
    assert j["url"] == "https://langfuse.com"
    assert client.patch(f"/api/jots/{j['id']}", json={"url": ""}).json()["url"] is None


def test_ticketed_topic_follows_its_ticket_to_trash(client):
    import app.db as db

    lrn = next(p for p in client.get("/api/projects").json() if p["key"] == "LRN")
    j = client.post("/api/jots", json={"body": "vLLM"}).json()
    item = client.post(f"/api/jots/{j['id']}/convert", json={"project_id": lrn["id"]}).json()["item"]

    client.delete(f"/api/items/{item['id']}")
    assert client.get("/api/jots").json() == []  # hidden while the ticket is in Trash

    client.post(f"/api/trash/items/{item['id']}/restore")
    assert [x["status"] for x in client.get("/api/jots").json()] == ["converted"]

    client.delete(f"/api/items/{item['id']}")
    with db.transaction() as conn:
        conn.execute("UPDATE items SET deleted_at = '2000-01-01T00:00:00' WHERE id = ?", (item["id"],))
    db.purge_trash()
    with db.transaction() as conn:
        assert conn.execute("SELECT count(*) FROM jots").fetchone()[0] == 0


def test_project_icons(client):
    icons = {p["key"]: p["icon"] for p in client.get("/api/projects").json()}
    assert icons == {"WORK": "briefcase", "LRN": "graduation-cap"}
    p = client.post("/api/projects", json={"key": "AI", "name": "AI"}).json()
    assert p["icon"] == "code"  # first unused
    assert client.patch(f"/api/projects/{p['id']}", json={"icon": "brain"}).json()["icon"] == "brain"
    assert client.patch(f"/api/projects/{p['id']}", json={"icon": "nope"}).status_code == 422


def test_revise_manual_and_lifecycle(client):
    r = client.post("/api/revisions", json={"title": "KV cache", "question": "Why so much memory?", "notes": "stores past tokens"}).json()
    assert r["status"] == "active" and r["source"] == "manual"
    assert client.get("/api/stats/overview?days=1").json()["revise_open"] == 1

    done = client.patch(f"/api/revisions/{r['id']}", json={"status": "revised"}).json()
    assert done["status"] == "revised" and done["revised_at"]
    again = client.patch(f"/api/revisions/{r['id']}", json={"status": "active"}).json()
    assert again["revised_at"] is None
    assert client.delete(f"/api/revisions/{r['id']}").status_code == 204
    assert client.get("/api/revisions").json() == []


def test_revise_from_ticket_and_radar(client):
    item = _learning(client, description="course notes")
    rev = client.post(f"/api/items/{item['id']}/revise").json()
    assert rev["item_key"] == "LRN-1" and rev["notes"] == "course notes" and rev["url"] == "https://youtu.be/abc"
    # adding twice returns the same topic
    assert client.post(f"/api/items/{item['id']}/revise").json()["id"] == rev["id"]
    assert client.get(f"/api/items/{item['id']}").json()["revision_id"] == rev["id"]

    j = client.post("/api/jots", json={"body": "tmux", "details": "panes"}).json()
    r2 = client.post(f"/api/jots/{j['id']}/revise").json()
    assert r2["source"] == "radar" and r2["title"] == "tmux"
    assert client.get("/api/jots").json() == []  # left Radar


def test_revision_sessions_priority_and_timer(client):
    low = client.post("/api/revisions", json={"title": "low one", "priority": "low"}).json()
    high = client.post("/api/revisions", json={"title": "high one", "priority": "high"}).json()
    assert [r["title"] for r in client.get("/api/revisions").json()] == ["high one", "low one"]

    r = client.post(f"/api/revisions/{low['id']}/sessions", json={"time_spent": "20m"}).json()
    assert r["total_minutes"] == 20 and r["session_count"] == 1 and r["last_revised_at"]
    assert r["status"] == "active"  # logging a session keeps it on the list

    client.post(f"/api/revisions/{high['id']}/timer/start")
    assert client.get("/api/revisions").json()[0]["timer_started_at"]
    done = client.patch(f"/api/revisions/{high['id']}", json={"status": "revised"}).json()
    assert done["session_count"] == 1 and done["timer_started_at"] is None  # running timer was logged

    sessions = client.get(f"/api/revisions/{low['id']}/sessions").json()
    client.delete(f"/api/revision-sessions/{sessions[0]['id']}")
    assert client.patch(f"/api/revisions/{low['id']}", json={"priority": "urgent"}).json()["total_minutes"] == 0


def test_split_topic(client):
    j = client.post("/api/jots", json={"body": "wireguard, openvpn,  WireGuard ,", "details": "VPNs", "url": "https://x.io"}).json()
    parts = client.post(f"/api/jots/{j['id']}/split").json()
    assert [p["body"] for p in parts] == ["wireguard", "openvpn"]
    assert all(p["details"] == "VPNs" and p["url"] == "https://x.io" for p in parts)
    assert len(client.get("/api/jots").json()) == 2  # original removed
    single = client.post("/api/jots", json={"body": "tmux"}).json()
    assert client.post(f"/api/jots/{single['id']}/split").status_code == 422


def test_edit_comment(client):
    item = _learning(client)
    c1 = client.post(f"/api/items/{item['id']}/comments", json={"body": "first"}).json()
    client.post(f"/api/items/{item['id']}/comments", json={"body": "second"})
    edited = client.patch(f"/api/comments/{c1['id']}", json={"body": "first, fixed"}).json()
    assert edited["body"] == "first, fixed" and edited["edited_at"]
    assert [c["body"] for c in client.get(f"/api/items/{item['id']}/comments").json()] == ["first, fixed", "second"]
    assert client.patch("/api/comments/999", json={"body": "x"}).status_code == 404
    # search finds the edited text
    assert client.get("/api/search", params={"q": "fixed"}).json()[0]["match"] == "comment"


def test_quotes(client):
    q = client.post("/api/quotes", json={"text": "  Stay hungry.  ", "author": "Steve Jobs"}).json()
    assert q["text"] == "Stay hungry."
    client.post("/api/quotes", json={"text": "Make it work, then make it right."})
    assert [x["text"] for x in client.get("/api/quotes").json()] == ["Stay hungry.", "Make it work, then make it right."]
    assert client.patch(f"/api/quotes/{q['id']}", json={"text": "Stay hungry, stay foolish.", "author": "Steve Jobs"}).json()["text"].endswith("foolish.")
    client.delete(f"/api/quotes/{q['id']}")
    assert len(client.get("/api/quotes").json()) == 1

    s = client.get("/api/settings").json()
    assert s["quotes_on_dashboard"] is True and s["quotes_on_board"] is True and s["quotes_interval"] == 20
    s = client.put("/api/settings", json={"quotes_on_board": False, "quotes_interval": 60}).json()
    assert s["quotes_on_board"] is False and s["quotes_on_dashboard"] is True and s["quotes_interval"] == 60
    assert client.put("/api/settings", json={"quotes_interval": 1}).status_code == 422
