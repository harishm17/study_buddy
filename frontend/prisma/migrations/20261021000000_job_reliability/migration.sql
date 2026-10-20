-- Job claims, leases, per-job LLM usage and one active job per target.

ALTER TABLE "processing_jobs"
    ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN "lease_until" TIMESTAMP(3),
    ADD COLUMN "target_key" TEXT,
    ADD COLUMN "llm_input_tokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "llm_output_tokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "llm_cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0;

-- Jobs that were mid-flight when this ran have no lease: give them one that is already over
-- so the next claim (or the reaper) takes them.
UPDATE "processing_jobs"
SET "lease_until" = (NOW() AT TIME ZONE 'UTC')
WHERE "status" = 'processing';

-- Backfill the target of jobs that are still active, so the unique index below covers them.
-- Older duplicates (the race this index closes) keep a NULL key.
UPDATE "processing_jobs" j
SET "target_key" = 'extract:' || j."project_id"
FROM (
    SELECT DISTINCT ON ("project_id") "id"
    FROM "processing_jobs"
    WHERE "job_type" = 'extract_topics' AND "status" IN ('pending', 'processing') AND "project_id" IS NOT NULL
    ORDER BY "project_id", "created_at" DESC
) newest
WHERE j."id" = newest."id";

UPDATE "processing_jobs" j
SET "target_key" = 'content:' || (j."input_data"->>'topicId') || ':' || (j."input_data"->>'contentType')
FROM (
    SELECT DISTINCT ON ("input_data"->>'topicId', "input_data"->>'contentType') "id"
    FROM "processing_jobs"
    WHERE "job_type" = 'generate_content'
      AND "status" IN ('pending', 'processing')
      AND "input_data"->>'topicId' IS NOT NULL
      AND "input_data"->>'contentType' IS NOT NULL
    ORDER BY "input_data"->>'topicId', "input_data"->>'contentType', "created_at" DESC
) newest
WHERE j."id" = newest."id";

-- At most one pending/processing job per target. Prisma cannot declare a partial index, so
-- this lives only in SQL; prisma migrate diff does not report it.
CREATE UNIQUE INDEX "processing_jobs_active_target_key" ON "processing_jobs"("target_key")
    WHERE "target_key" IS NOT NULL AND "status" IN ('pending', 'processing');

CREATE INDEX "processing_jobs_user_id_created_at_idx" ON "processing_jobs"("user_id", "created_at");

CREATE INDEX "processing_jobs_status_lease_until_idx" ON "processing_jobs"("status", "lease_until");
