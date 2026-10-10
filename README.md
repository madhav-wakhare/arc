# Smriti

Smriti is a personal work and learning tracker. It runs on your computer in one Docker container. The data is in a SQLite file in this folder.

## Features

- **Board**: Kanban board with Backlog, Today, In Progress and Done. Drag cards between columns. Each open card shows how many days it has been pending (amber after 7 days, red after 14).
- **Item types**: work tasks, learning items (videos, articles, books) and notes.
- **Radar**: topics you hear about (vLLM, Langfuse, tmux...). Press `N` anywhere to add one. Topics stay off the board. Review each one and create a Learning or Task ticket from it; its link and `#tags` become the ticket link and labels. Tabs: To review, Ticketed, Dismissed.
- **Projects**: each project has a key, so items get keys such as `WORK-12` and `LRN-4`. The Projects page lets you edit, deactivate (hide from the sidebar and pickers) or delete a project.
- **Trash**: deleted items and projects stay in Trash for 30 days. You can restore them, or delete them for good. After 30 days Smriti removes them automatically.
- **Time tracking (Jira style)**: original estimate, "Log work" with `2h 30m`, `45m` or `1d` (1d = 8h), a start/stop timer, and a work log per item.
- **Today**: today's plan, overdue items, a quick pick from the backlog, and an end-of-day review.
- **Recurring items**: daily, weekdays, weekly or monthly. When you mark one Done, Smriti makes the next one.
- **Dashboard and weekly report**: completed items, time logged, learning time, time per project, longest pending items.
- **Search**: `⌘K` / `Ctrl K` searches titles, descriptions, links and comments. Type a key like `LRN-4` to jump to an item.
- **Obsidian export**: for items with a link, "Export to Obsidian" writes one note named after the item title. If you later change the title or link, Smriti overwrites the note.
- **Backups**: once a month, Smriti copies the database to `backups/YYYY-MM/smriti-YYYY-MM-DD.db`. Settings has a "Back up now" button.
- **Themes**: dark and light. Works on a phone on the same Wi-Fi.

## Run

You need Docker Desktop. For `make dev` you also need [uv](https://docs.astral.sh/uv/) and Node.js with npm.

```bash
make up
```

The first run asks for the path of your Obsidian vault and writes it to `.env`. Then it builds the image, starts the container and prints the URLs:

- On this Mac: http://localhost:8080
- On your phone (same Wi-Fi): `http://<your-mac-ip>:8080`. `make up` prints this address.

Run `make` to see all commands:

| Command | What it does |
| --- | --- |
| `make up` | Create `.env` if missing, build and start in Docker |
| `make down` / `make restart` | Stop / rebuild and restart |
| `make logs` / `make status` | Follow logs / show health |
| `make backup` | Write a backup now |
| `make restore FILE=backups/YYYY-MM/smriti-YYYY-MM-DD.db` | Restore a backup (keeps the old database as `data/smriti.db.before-restore`) |
| `make dev` | Run backend and UI locally with live reload |
| `make test` | Run backend tests |
| `make ci` | Install from lockfiles, test and build |
| `make clean` | Remove build output and dev data (keeps `data/` and `backups/`) |

> **Security:** Smriti has no login. With the default `SMRITI_BIND=0.0.0.0`, any device on the same network can read and change your data. On a shared or office network, set `SMRITI_BIND=127.0.0.1` in `.env`.

## Obsidian notes

An exported note looks like this:

```markdown
---
title: "Kubernetes networking deep dive"
url: "https://www.youtube.com/watch?v=..."
smriti_id: LRN-1
---

# Kubernetes networking deep dive

[Kubernetes networking deep dive](https://www.youtube.com/watch?v=...)
```

The default folder is `Smriti/Videos` inside the vault. You can change it in Settings. Smriti only deletes an old note during a rename when the note has the same `smriti_id`.

## Data and backups

| Path | Content |
| --- | --- |
| `data/smriti.db` | The database |
| `backups/YYYY-MM/` | Monthly copies of the database |

To restore a backup, run `make restore FILE=...`.

## Development

```bash
make dev
```

This installs dependencies from the lockfiles (`backend/uv.lock` with uv, `frontend/package-lock.json` with npm). Then it starts the API on port 8765 and the Vite UI on http://localhost:5173. Dev data goes to `.dev/`, not to `data/`.

- Backend: Python 3.12, FastAPI, SQLite with FTS5. Dependencies are in `backend/pyproject.toml`.
- Frontend: React, Vite, Tailwind CSS, Geist font, Lucide icons, Recharts.
