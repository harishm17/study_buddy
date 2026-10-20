-- Ask your materials: per-project chat threads and their messages (answers carry citations and cost).

-- CreateTable
CREATE TABLE "chat_threads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "llm_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "llm_output_tokens" INTEGER NOT NULL DEFAULT 0,
    "llm_cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_threads_project_id_user_id_updated_at_idx" ON "chat_threads"("project_id", "user_id", "updated_at");

-- CreateIndex
CREATE INDEX "chat_threads_user_id_idx" ON "chat_threads"("user_id");

-- CreateIndex
CREATE INDEX "chat_messages_thread_id_created_at_idx" ON "chat_messages"("thread_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- LLM usage ledger: append-only record of every LLM spend. The daily budget sums it, so
-- deleting a chat thread, a project or its jobs cannot lower a user's total for the day.
-- project_id and source_id are plain columns (no foreign keys) so they outlive what they
-- point at; only deleting the user removes their rows.
CREATE TABLE "llm_usage_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "source" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "models" TEXT NOT NULL DEFAULT '',
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "llm_usage_events_user_id_created_at_idx" ON "llm_usage_events"("user_id", "created_at");

ALTER TABLE "llm_usage_events" ADD CONSTRAINT "llm_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from what is stored today, dated the way the budget dated it before.
INSERT INTO "llm_usage_events" ("id", "user_id", "project_id", "source", "source_id", "input_tokens", "output_tokens", "cost_usd", "created_at")
SELECT gen_random_uuid()::text, "user_id", "project_id", 'job', "id", "llm_input_tokens", "llm_output_tokens", "llm_cost_usd", "created_at"
FROM "processing_jobs"
WHERE "llm_cost_usd" > 0;

INSERT INTO "llm_usage_events" ("id", "user_id", "project_id", "source", "source_id", "input_tokens", "output_tokens", "cost_usd", "created_at")
SELECT gen_random_uuid()::text, t."user_id", t."project_id", 'chat', m."id", m."llm_input_tokens", m."llm_output_tokens", m."llm_cost_usd", m."created_at"
FROM "chat_messages" m
JOIN "chat_threads" t ON t."id" = m."thread_id"
WHERE m."llm_cost_usd" > 0;
