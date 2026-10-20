# Arc - one-command setup.
#   make up     build and start the app in Docker (first run creates .env)
#   make dev    run backend and UI locally with live reload
#   make help   list all commands

SHELL := /bin/bash

# Same precedence as docker compose: shell environment, then .env, then default.
env_get = $(shell [ -f .env ] && sed -n 's/^$(1)=//p' .env | tail -1)
# ARC_PORT / ARC_BIND; the names from before the rename (SMRITI_*) still work.
ARC_PORT ?= $(or $(call env_get,ARC_PORT),$(call env_get,SMRITI_PORT),8080)
ARC_BIND ?= $(or $(call env_get,ARC_BIND),$(call env_get,SMRITI_BIND),0.0.0.0)
TZ ?= $(or $(call env_get,TZ),Asia/Kolkata)
DEV_API_PORT ?= 8765
URL := http://localhost:$(ARC_PORT)
COMPOSE := docker compose
DEV_ENV := DATA_DIR=../.dev/data VAULT_DIR=../.dev/vault BACKUP_DIR=../.dev/backups TZ=$(TZ)

.DEFAULT_GOAL := help
.PHONY: help check check-dev env legacy up down restart logs status open backup restore note-ids \
        install dev dev-api dev-ui test lint scan build-ui ci clean

help: ## List all commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36mmake %-10s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------- setup

check: ## Check that Docker is installed and running
	@command -v docker >/dev/null || { echo "Missing: docker. Install Docker Desktop."; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop."; exit 1; }

check-dev: ## Check that uv and npm are installed (for make dev)
	@for tool in uv npm; do \
		command -v $$tool >/dev/null || { echo "Missing: $$tool"; exit 1; }; \
	done

env: ## Create .env from .env.example (asks for the Obsidian vault path)
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		read -r -p "Obsidian vault path (empty = skip): " vault; \
		if [ -n "$$vault" ]; then \
			vault="$${vault/#\~/$$HOME}"; \
			sed -i '' "s|^OBSIDIAN_VAULT_PATH=.*|OBSIDIAN_VAULT_PATH=$$vault|" .env; \
		else \
			sed -i '' "s|^OBSIDIAN_VAULT_PATH=.*|# OBSIDIAN_VAULT_PATH=|" .env; \
		fi; \
		echo "Created .env"; \
	fi
	@vault=$$(grep -E '^OBSIDIAN_VAULT_PATH=' .env | cut -d= -f2-); \
	if [ -n "$$vault" ] && [ ! -d "$$vault" ]; then \
		echo "Warning: vault folder $$vault does not exist. Edit .env."; \
	fi

# ---------------------------------------------------------------- docker

up: check env legacy ## Build and start Arc in Docker
	@mkdir -p data backups
	$(COMPOSE) up -d --build
	@printf "Waiting for Arc"; \
	for i in $$(seq 1 30); do \
		curl -fs $(URL)/api/health >/dev/null && break; printf "."; sleep 1; \
	done; echo
	@curl -fs $(URL)/api/health >/dev/null || { echo "Arc did not start. Run: make logs"; exit 1; }
	@echo "Arc is running:  $(URL)"
	@ip=$$(ipconfig getifaddr en0 2>/dev/null); \
	if [ -n "$$ip" ] && [ "$(ARC_BIND)" != "127.0.0.1" ]; then echo "On your phone:      http://$$ip:$(ARC_PORT)"; fi

down: ## Stop Arc
	$(COMPOSE) down

restart: legacy ## Rebuild and restart Arc
	$(COMPOSE) up -d --build --force-recreate

# Before the rename the container was called "smriti" (compose project "smriti"). Remove it so it
# does not hold the port. Your data is in ./data and is not touched.
legacy:
	@if docker inspect smriti >/dev/null 2>&1; then docker rm -f smriti >/dev/null && echo "Removed the old smriti container (data is kept)."; fi

logs: ## Follow the container logs
	$(COMPOSE) logs -f arc

status: ## Show container state and health
	@$(COMPOSE) ps
	@curl -fs $(URL)/api/health && echo || echo "Not reachable at $(URL)"

open: ## Open Arc in the browser
	open $(URL)

backup: ## Write a database backup now (into backups/YYYY-MM/)
	@curl -fs -X POST $(URL)/api/backups && echo || echo "Arc is not running. Run: make up"

restore: ## Restore a backup: make restore FILE=backups/2026-10/arc-2026-10-10.db
	@test -n "$(FILE)" || { echo "Usage: make restore FILE=backups/YYYY-MM/arc-YYYY-MM-DD.db"; exit 1; }
	@test -f "$(FILE)" || { echo "Not found: $(FILE)"; exit 1; }
	$(COMPOSE) stop arc
	@if [ -f data/arc.db ]; then cp data/arc.db data/arc.db.before-restore; echo "Old database kept as data/arc.db.before-restore"; fi
	rm -f data/arc.db-wal data/arc.db-shm
	cp "$(FILE)" data/arc.db
	$(COMPOSE) start arc

note-ids: ## Rename the ID property in exported Obsidian notes: make note-ids TO=arc (or TO=smriti)
	@test -n "$(TO)" || { echo "Usage: make note-ids TO=arc|smriti"; exit 1; }
	$(COMPOSE) exec arc python -m app.maintenance note-ids $(TO)

# ---------------------------------------------------------------- local development

install: check-dev ## Install backend (uv) and UI (npm) dependencies from lockfiles
	cd backend && uv sync --frozen
	cd frontend && npm ci

dev: install ## Run backend and UI locally with live reload (Ctrl+C stops both)
	@mkdir -p .dev/vault/.obsidian
	@echo "UI: http://localhost:5173   API: http://127.0.0.1:$(DEV_API_PORT)"
	@trap 'kill 0' INT TERM EXIT; \
	(cd backend && $(DEV_ENV) uv run uvicorn app.main:app --reload --host 127.0.0.1 --port $(DEV_API_PORT)) & \
	(cd frontend && npm run dev) & \
	wait

dev-api: ## Run only the backend locally
	@mkdir -p .dev/vault/.obsidian
	cd backend && $(DEV_ENV) uv run uvicorn app.main:app --reload --host 127.0.0.1 --port $(DEV_API_PORT)

dev-ui: ## Run only the UI dev server
	cd frontend && npm run dev

test: ## Run backend tests
	cd backend && uv run --frozen pytest -q

TRIVY := aquasec/trivy:0.57.1
TRIVY_RUN := docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v $(CURDIR):/src:ro -v $(HOME)/.cache/trivy:/root/.cache $(TRIVY)

scan: ## Security scan with Trivy: the arc image, then the source (lockfiles, Dockerfile, secrets)
	@mkdir -p $(HOME)/.cache/trivy
	$(TRIVY_RUN) image --quiet --scanners vuln,secret --severity HIGH,CRITICAL --ignore-unfixed arc:latest
	$(TRIVY_RUN) fs --quiet --scanners vuln,secret,misconfig --severity MEDIUM,HIGH,CRITICAL \
		--skip-dirs /src/frontend/node_modules,/src/backend/.venv,/src/data,/src/backups,/src/.dev /src

lint: ## Lint the backend (ruff) and type-check the UI
	cd backend && uv run --frozen ruff check app tests
	cd frontend && npx tsc --noEmit -p .

build-ui: ## Type-check and build the UI
	cd frontend && npm run build

ci: install lint test build-ui ## Install, lint, test and build (what CI would run)

clean: ## Remove local build output and dev data (keeps data/ and backups/)
	rm -rf backend/.venv frontend/node_modules frontend/dist .dev
	find backend -name __pycache__ -type d -prune -exec rm -rf {} +
