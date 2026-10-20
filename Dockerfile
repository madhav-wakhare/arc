# syntax=docker/dockerfile:1.7
# Arc: one small image that serves the API and the built UI.
# Stages: ui (Node, builds static files) -> deps (uv, builds the Python venv) -> runtime (Python + venv + app only).

# Keep these current: `make scan` (Trivy) reports when they need a bump.
ARG PYTHON_VERSION=3.12.15-alpine3.24
ARG NODE_VERSION=22.23-alpine3.24

# ---- 1. build the React UI ----
FROM node:${NODE_VERSION} AS ui
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. install locked Python dependencies into /app/.venv ----
FROM python:${PYTHON_VERSION} AS deps
COPY --from=ghcr.io/astral-sh/uv:0.11.27 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project

# ---- 3. runtime: no uv, no Node, no build tools ----
FROM python:${PYTHON_VERSION} AS runtime
LABEL org.opencontainers.image.title="Arc" \
      org.opencontainers.image.description="Personal work and learning tracker" \
      org.opencontainers.image.source="https://github.com/madhav-wakhare/arc"

# Runs as a normal user. UID 1000 matches the first user on most Linux hosts, so files in the
# bind-mounted data, backups and vault folders stay owned by you. Change with --build-arg APP_UID=...
ARG APP_UID=1000
# Pick up Alpine security fixes released after the base image, drop pip (an installer the app never
# uses at runtime), and create the user and mount points.
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/python3.12/site-packages/pip /usr/local/lib/python3.12/site-packages/pip-* /usr/local/bin/pip* \
 && adduser -D -H -u ${APP_UID} arc && mkdir -p /data /backups /vault && chown arc /data /backups /vault

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    DATA_DIR=/data VAULT_DIR=/vault BACKUP_DIR=/backups STATIC_DIR=/app/static
WORKDIR /app
COPY --from=deps /app/.venv ./.venv
COPY backend/app ./app
COPY --from=ui /ui/dist ./static

USER arc
EXPOSE 8000
# busybox wget is already in the image: cheaper than starting Python every 30 s.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO /dev/null http://127.0.0.1:8000/api/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
