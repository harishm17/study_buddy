#!/bin/sh
set -e

# Get PORT from environment variable, default to 8080
# Cloud Run always sets PORT, but we default to 8080 just in case
PORT=${PORT:-8080}

echo "Starting StudyBuddy AI Service..."
echo "Environment: ${ENVIRONMENT:-development}"
echo "Listening on port: ${PORT}"

# Start uvicorn with the PORT environment variable
# Using exec to replace shell process with uvicorn for proper signal handling
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"

