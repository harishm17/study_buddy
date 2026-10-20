-- Exam attempts live in exam_submissions: a row is 'in_progress' while the student takes the
-- exam (server start time, deadline, autosaved answers) and 'submitted' once finalised.
-- Existing rows are all submissions.
ALTER TABLE "exam_submissions"
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'submitted',
    ADD COLUMN "started_at" TIMESTAMP(3),
    ADD COLUMN "deadline_at" TIMESTAMP(3),
    ADD COLUMN "answers_saved_at" TIMESTAMP(3);

-- At most one attempt in progress per user and exam. Prisma cannot express a partial unique
-- index, so schema.prisma does not list it.
CREATE UNIQUE INDEX "exam_submissions_one_in_progress" ON "exam_submissions"("user_id", "sample_exam_id")
    WHERE "status" = 'in_progress';
