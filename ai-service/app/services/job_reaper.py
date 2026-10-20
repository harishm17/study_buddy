"""Recover jobs whose worker died.

A job still `processing` after its lease ran out has lost its worker. If it has attempts
left it is dispatched again (the claim takes it over because the lease expired); if not, it
is failed with JOB_LEASE_EXPIRED.
"""
import asyncio
import json
import logging
from typing import Any, Dict

from app.config import settings
from app.db.connection import UTC_NOW, execute_query
from app.services.cloud_tasks import JOB_ENDPOINTS, enqueue_job

logger = logging.getLogger(__name__)


def dispatch_data(job_type: str, input_data: Any) -> Dict[str, Any]:
    """The `data` a job endpoint expects, rebuilt from the stored input."""
    if isinstance(input_data, str):
        input_data = json.loads(input_data)
    data = input_data if isinstance(input_data, dict) else {}
    if job_type == "grade_exam":
        # The submission holds the answers; the task body carries only its id.
        return {"submissionId": data.get("submissionId")}
    return data


async def reap_expired_jobs() -> Dict[str, int]:
    """Fail exhausted jobs with an expired lease and re-dispatch the rest."""
    failed = await execute_query(
        f"""
        UPDATE processing_jobs
        SET status = 'failed',
            error_code = 'JOB_LEASE_EXPIRED',
            error_message = 'The worker running this job stopped responding.',
            retryable = FALSE,
            completed_at = {UTC_NOW},
            lease_until = NULL
        WHERE status = 'processing'
          AND (lease_until IS NULL OR lease_until < {UTC_NOW})
          AND attempt_count >= max_attempts
        RETURNING id
        """
    )
    stale = await execute_query(
        f"""
        SELECT id, job_type, input_data
        FROM processing_jobs
        WHERE status = 'processing'
          AND (lease_until IS NULL OR lease_until < {UTC_NOW})
          AND attempt_count < max_attempts
        ORDER BY created_at
        LIMIT 100
        """
    )
    redispatched = 0
    for job in stale:
        if job["job_type"] not in JOB_ENDPOINTS:
            continue
        try:
            await enqueue_job(
                job["id"], job["job_type"], dispatch_data(job["job_type"], job["input_data"])
            )
            redispatched += 1
        except Exception as exc:
            logger.error("Could not re-dispatch job %s: %s", job["id"], exc)
    if failed or redispatched:
        logger.warning("Job reaper: %d failed, %d re-dispatched", len(failed), redispatched)
    return {"failed": len(failed), "redispatched": redispatched}


async def reaper_loop() -> None:
    """Run the reaper every JOB_REAPER_INTERVAL_SECONDS until cancelled."""
    interval = settings.JOB_REAPER_INTERVAL_SECONDS
    while True:
        await asyncio.sleep(interval)
        try:
            await reap_expired_jobs()
        except Exception:
            logger.exception("Job reaper run failed")
