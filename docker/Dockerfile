# syntax=docker/dockerfile:1.7

# Stages:
#   frontend-build  build the React app with Node (discarded after the build)
#   python-base     Python + uv, shared by the stages below
#   dev             all Python dependencies, source bind-mounted by compose.dev.yaml
#   backend-build   production Python dependencies only (discarded after the build)
#   production      slim runtime: virtualenv, backend code and the built frontend

ARG PYTHON_VERSION=3.14
ARG NODE_VERSION=24
ARG UV_VERSION=0.12.17

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

# ---------------------------------------------------------------- frontend

FROM node:${NODE_VERSION}-slim AS frontend-build
WORKDIR /app/frontend
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=frontend/package.json,target=package.json \
    --mount=type=bind,source=frontend/package-lock.json,target=package-lock.json \
    npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------- python

FROM python:${PYTHON_VERSION}-slim AS python-base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/opt/venv/bin:${PATH}"
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app/backend

FROM python-base AS dev
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=backend/pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=backend/uv.lock,target=uv.lock \
    uv sync --frozen --no-install-project
COPY docker/entrypoint.sh /usr/local/bin/nudge-entrypoint
ENTRYPOINT ["nudge-entrypoint"]

FROM python-base AS backend-build
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=backend/pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=backend/uv.lock,target=uv.lock \
    uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
# Settings require a secret key; collectstatic never uses it.
RUN NUDGE_SECRET_KEY=collectstatic-only python manage.py collectstatic --noinput \
    && python -m compileall -q .

# ---------------------------------------------------------------- production

FROM python:${PYTHON_VERSION}-slim AS production
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}"
RUN groupadd --system --gid 10001 nudge \
    && useradd --system --uid 10001 --gid nudge --no-create-home --shell /usr/sbin/nologin nudge
WORKDIR /app/backend
COPY --from=backend-build /opt/venv /opt/venv
COPY --from=backend-build /app /app
COPY docker/entrypoint.sh /usr/local/bin/nudge-entrypoint
COPY docker/healthcheck.py /usr/local/bin/nudge-healthcheck
USER nudge
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "/usr/local/bin/nudge-healthcheck"]
ENTRYPOINT ["nudge-entrypoint"]
CMD ["gunicorn", "--config", "gunicorn.conf.py", "config.wsgi"]
