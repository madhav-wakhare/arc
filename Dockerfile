# ---- build the React UI ----
FROM node:22.12-alpine AS ui
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- run the API and serve the UI ----
FROM python:3.12.8-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.27 /uv /bin/uv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    DATA_DIR=/data VAULT_DIR=/vault BACKUP_DIR=/backups STATIC_DIR=/app/static \
    PATH="/app/.venv/bin:$PATH"
WORKDIR /app
# Install locked dependencies first for layer caching.
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --no-dev
COPY backend/app ./app
COPY --from=ui /ui/dist ./static
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
