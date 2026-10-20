# Standard Multi-stage build for Python AI service

# Stage 1: Builder
FROM python:3.11-slim AS builder

WORKDIR /app

# Install system dependencies (Standard version, no --mount)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first
COPY requirements.txt .

# Install Python dependencies into a virtualenv the runtime user can read
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

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