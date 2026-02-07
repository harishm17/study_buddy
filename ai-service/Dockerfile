# syntax=docker/dockerfile:1.7
# Multi-stage build for Python AI service

# Stage 1: Builder
FROM python:3.11-slim AS builder

WORKDIR /app

# Install system dependencies
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (better caching)
COPY requirements.txt .

# Install Python dependencies (cached if requirements.txt unchanged)
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --user -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app

# Copy Python dependencies from builder
COPY --from=builder /root/.local /root/.local

# Copy application code last (changes most frequently)
COPY . .

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Make start script executable
RUN chmod +x start.sh || true

# Expose port (Cloud Run will set PORT env var, default to 8000 for local)
EXPOSE 8000

# Run the application using the start script
# The start script handles PORT env var expansion correctly
CMD ["./start.sh"]
