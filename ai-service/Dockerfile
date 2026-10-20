# Multi-stage build for the Python AI service

# Stage 1: install the locked dependencies with uv
FROM python:3.14-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON_DOWNLOADS=never

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

# Stage 2: Runtime
FROM python:3.14-slim

WORKDIR /app

# Run as an unprivileged user
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app

# Copy Python dependencies from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH

# Copy application code last, owned by root and read-only to the app user
COPY . .
RUN chmod 755 start.sh

USER app

# Expose port
EXPOSE 8000

# Run the application
CMD ["./start.sh"]
