-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "oauth_provider" TEXT,
    "oauth_id" TEXT,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'setup',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "gcs_path" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "validation_status" TEXT NOT NULL DEFAULT 'pending',
    "validation_notes" TEXT,
    "metadata" JSONB,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMP(3),

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_chunks" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "chunk_embedding" vector,
    "section_hierarchy" TEXT,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "chunk_index" INTEGER NOT NULL,
    "token_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keywords" TEXT[],
    "order_index" INTEGER NOT NULL,
    "source_material_ids" TEXT[],
    "user_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_chunk_mappings" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "relevance_score" DOUBLE PRECISION NOT NULL,
    "relevance_source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_chunk_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_content" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_data" JSONB NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_quizzes" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "notes_completed" BOOLEAN NOT NULL DEFAULT false,
    "examples_completed" BOOLEAN NOT NULL DEFAULT false,
    "quiz_completed" BOOLEAN NOT NULL DEFAULT false,
    "quiz_score" DOUBLE PRECISION,
    "last_accessed_at" TIMESTAMP(3),

    CONSTRAINT "topic_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "quiz_set_id" TEXT,
    "answers" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_drill_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "topic_id" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'topic_drill',
    "language" TEXT NOT NULL DEFAULT 'en',
    "voice" TEXT NOT NULL DEFAULT 'marin',
    "status" TEXT NOT NULL DEFAULT 'active',
    "interrupt_count" INTEGER NOT NULL DEFAULT 0,
    "last_detected_language" TEXT,
    "question_set" JSONB NOT NULL,
    "metrics" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "voice_drill_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_drill_attempts" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "topic_id" TEXT,
    "question_index" INTEGER NOT NULL,
    "question_type" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "expected_answer" JSONB,
    "user_answer" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feedback" JSONB,
    "timing" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_drill_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_signals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "topic_id" TEXT,
    "source" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_schedules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "mastery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "due_at" TIMESTAMP(3) NOT NULL,
    "interval_days" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "last_reviewed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overall_quizzes" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overall_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overall_quiz_attempts" (
    "id" TEXT NOT NULL,
    "overall_quiz_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" JSONB NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overall_quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_exams" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "difficulty_level" TEXT NOT NULL,
    "topics_covered" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_submissions" (
    "id" TEXT NOT NULL,
    "sample_exam_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "ai_grading" JSONB,
    "ai_feedback" JSONB,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "graded_at" TIMESTAMP(3),

    CONSTRAINT "exam_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stage" TEXT,
    "error_code" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "input_data" JSONB,
    "result_data" JSONB,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_oauth_provider_oauth_id_idx" ON "users"("oauth_provider", "oauth_id");

-- CreateIndex
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "materials_project_id_idx" ON "materials"("project_id");

-- CreateIndex
CREATE INDEX "materials_category_idx" ON "materials"("category");

-- CreateIndex
CREATE INDEX "materials_validation_status_idx" ON "materials"("validation_status");

-- CreateIndex
CREATE INDEX "materials_project_id_validation_status_idx" ON "materials"("project_id", "validation_status");

-- CreateIndex
CREATE INDEX "material_chunks_material_id_idx" ON "material_chunks"("material_id");

-- CreateIndex
CREATE INDEX "material_chunks_material_id_chunk_index_idx" ON "material_chunks"("material_id", "chunk_index");

-- CreateIndex
CREATE INDEX "topics_project_id_idx" ON "topics"("project_id");

-- CreateIndex
CREATE INDEX "topics_project_id_order_index_idx" ON "topics"("project_id", "order_index");

-- CreateIndex
CREATE INDEX "topic_chunk_mappings_topic_id_relevance_score_idx" ON "topic_chunk_mappings"("topic_id", "relevance_score");

-- CreateIndex
CREATE INDEX "topic_chunk_mappings_chunk_id_idx" ON "topic_chunk_mappings"("chunk_id");

-- CreateIndex
CREATE UNIQUE INDEX "topic_chunk_mappings_topic_id_chunk_id_key" ON "topic_chunk_mappings"("topic_id", "chunk_id");

-- CreateIndex
CREATE UNIQUE INDEX "topic_content_topic_id_content_type_key" ON "topic_content"("topic_id", "content_type");

-- CreateIndex
CREATE INDEX "topic_quizzes_topic_id_idx" ON "topic_quizzes"("topic_id");

-- CreateIndex
CREATE INDEX "topic_progress_user_id_topic_id_idx" ON "topic_progress"("user_id", "topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "topic_progress_topic_id_user_id_key" ON "topic_progress"("topic_id", "user_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_user_id_topic_id_idx" ON "quiz_attempts"("user_id", "topic_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_quiz_set_id_idx" ON "quiz_attempts"("quiz_set_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_topic_id_idx" ON "quiz_attempts"("topic_id");

-- CreateIndex
CREATE INDEX "voice_drill_sessions_user_id_project_id_idx" ON "voice_drill_sessions"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "voice_drill_sessions_topic_id_idx" ON "voice_drill_sessions"("topic_id");

-- CreateIndex
CREATE INDEX "voice_drill_attempts_session_id_idx" ON "voice_drill_attempts"("session_id");

-- CreateIndex
CREATE INDEX "voice_drill_attempts_user_id_idx" ON "voice_drill_attempts"("user_id");

-- CreateIndex
CREATE INDEX "voice_drill_attempts_topic_id_idx" ON "voice_drill_attempts"("topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "voice_drill_attempts_session_id_question_index_key" ON "voice_drill_attempts"("session_id", "question_index");

-- CreateIndex
CREATE INDEX "learning_signals_user_id_project_id_topic_id_idx" ON "learning_signals"("user_id", "project_id", "topic_id");

-- CreateIndex
CREATE INDEX "learning_signals_source_created_at_idx" ON "learning_signals"("source", "created_at");

-- CreateIndex
CREATE INDEX "review_schedules_user_id_project_id_due_at_idx" ON "review_schedules"("user_id", "project_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_schedules_user_id_topic_id_key" ON "review_schedules"("user_id", "topic_id");

-- CreateIndex
CREATE INDEX "overall_quizzes_project_id_idx" ON "overall_quizzes"("project_id");

-- CreateIndex
CREATE INDEX "overall_quiz_attempts_user_id_idx" ON "overall_quiz_attempts"("user_id");

-- CreateIndex
CREATE INDEX "sample_exams_project_id_idx" ON "sample_exams"("project_id");

-- CreateIndex
CREATE INDEX "exam_submissions_user_id_idx" ON "exam_submissions"("user_id");

-- CreateIndex
CREATE INDEX "exam_submissions_sample_exam_id_idx" ON "exam_submissions"("sample_exam_id");

-- CreateIndex
CREATE INDEX "processing_jobs_user_id_idx" ON "processing_jobs"("user_id");

-- CreateIndex
CREATE INDEX "processing_jobs_status_idx" ON "processing_jobs"("status");

-- CreateIndex
CREATE INDEX "processing_jobs_created_at_idx" ON "processing_jobs"("created_at");

-- CreateIndex
CREATE INDEX "processing_jobs_project_id_status_idx" ON "processing_jobs"("project_id", "status");

-- CreateIndex
CREATE INDEX "processing_jobs_status_created_at_idx" ON "processing_jobs"("status", "created_at");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_chunk_mappings" ADD CONSTRAINT "topic_chunk_mappings_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_chunk_mappings" ADD CONSTRAINT "topic_chunk_mappings_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "material_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_content" ADD CONSTRAINT "topic_content_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_quizzes" ADD CONSTRAINT "topic_quizzes_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_drill_sessions" ADD CONSTRAINT "voice_drill_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_drill_sessions" ADD CONSTRAINT "voice_drill_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_drill_sessions" ADD CONSTRAINT "voice_drill_sessions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_drill_attempts" ADD CONSTRAINT "voice_drill_attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "voice_drill_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_drill_attempts" ADD CONSTRAINT "voice_drill_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_drill_attempts" ADD CONSTRAINT "voice_drill_attempts_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_signals" ADD CONSTRAINT "learning_signals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_signals" ADD CONSTRAINT "learning_signals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_signals" ADD CONSTRAINT "learning_signals_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_quizzes" ADD CONSTRAINT "overall_quizzes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_quiz_attempts" ADD CONSTRAINT "overall_quiz_attempts_overall_quiz_id_fkey" FOREIGN KEY ("overall_quiz_id") REFERENCES "overall_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_quiz_attempts" ADD CONSTRAINT "overall_quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_exams" ADD CONSTRAINT "sample_exams_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_sample_exam_id_fkey" FOREIGN KEY ("sample_exam_id") REFERENCES "sample_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

