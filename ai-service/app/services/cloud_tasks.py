"""Google Cloud Tasks client wrapper for AI service.

Handles enqueueing async jobs.
"""
import logging
import json
import base64
from typing import Dict, Any, Optional
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

# Initialize Cloud Tasks client for production
_client: Optional[Any] = None

if settings.is_production:
    try:
        from google.cloud import tasks_v2
        _client = tasks_v2.CloudTasksClient()
    except Exception as e:
        logger.warning(f"Failed to initialize Cloud Tasks client: {e}")
        _client = None


async def enqueue_task(
    endpoint: str,
    payload: Dict[str, Any]
) -> str:
    """
    Enqueue a task to Cloud Tasks or make direct HTTP call in development.

    Args:
        endpoint: AI service endpoint (e.g., /jobs/chunk-material)
        payload: Task payload with jobId, jobType, and data

    Returns:
        Task name or task ID
    """
    if settings.is_development:
        # Development mode - make direct HTTP call
        logger.info(f"[DEV] Triggering job via direct HTTP call to {endpoint}")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.AI_SERVICE_URL}{endpoint}",
                    json=payload,
                    timeout=30.0
                )

                if response.status_code != 200:
                    logger.error(f"[DEV] Task execution failed: {response.text}")
                else:
                    logger.info(f"[DEV] Task triggered successfully")

        except Exception as e:
            logger.error(f"[DEV] Failed to call AI service: {e}")

        return f"dev-task-{payload['jobId']}"

    # Production mode - use Cloud Tasks
    if not _client:
        logger.error("Cloud Tasks client not available in production")
        return f"error-task-{payload['jobId']}"

    try:
        # Build the task
        project_id = settings.GCS_PROJECT_ID
        location = "us-central1"  # Same as deploy.yml
        queue = "studybuddy-jobs"  # Same as deploy.yml

        parent = _client.queue_path(project_id, location, queue)

        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": f"{settings.AI_SERVICE_URL}{endpoint}",
                "headers": {
                    "Content-Type": "application/json",
                },
                "body": base64.b64encode(json.dumps(payload).encode()).decode(),
            }
        }

        response = _client.create_task(request={"parent": parent, "task": task})
        logger.info(f"Created Cloud Task: {response.name}")
        return response.name

    except Exception as e:
        logger.error(f"Failed to create Cloud Task: {e}")
        return f"error-task-{payload['jobId']}"


async def enqueue_chunking_job(job_id: str, material_id: str) -> str:
    """
    Enqueue a material chunking job.

    Args:
        job_id: Processing job ID
        material_id: Material ID to chunk

    Returns:
        Task name
    """
    return await enqueue_task(
        "/jobs/chunk-material",
        {
            "jobId": job_id,
            "jobType": "chunk_material",
            "data": {"materialId": material_id}
        }
    )


async def enqueue_topic_extraction_job(job_id: str, project_id: str) -> str:
    """
    Enqueue a topic extraction job.

    Args:
        job_id: Processing job ID
        project_id: Project ID

    Returns:
        Task name
    """
    return await enqueue_task(
        "/jobs/extract-topics",
        {
            "jobId": job_id,
            "jobType": "extract_topics",
            "data": {"projectId": project_id}
        }
    )
