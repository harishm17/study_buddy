#!/bin/sh
set -e

# Get PORT from environment variable, default to 8000 for local/docker.
# Cloud Run overrides this with its injected PORT automatically.
PORT=${PORT:-8000}

echo "Starting StudyBuddy AI Service..."
echo "Environment: ${ENVIRONMENT:-development}"
echo "Listening on port: ${PORT}"

# Start uvicorn with the PORT environment variable
# Using exec to replace shell process with uvicorn for proper signal handling
WORKERS=${UVICORN_WORKERS:-1}
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers "$WORKERS"
