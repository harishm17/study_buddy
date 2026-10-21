-- The learning loop: exam date and daily time on projects, Topic.examRelevant, per-problem practice
-- progress, the kind of a quiz set (standard or retry) and the mark that an exam result was applied
-- to mastery. Additive: new columns are nullable or defaulted.

-- AlterTable
ALTER TABLE "exam_submissions" ADD COLUMN     "review_applied_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "daily_minutes" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "exam_date" TIMESTAMP(3),
ADD COLUMN     "exam_prompt_dismissed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "topic_quizzes" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'standard';

-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "exam_relevant" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "practice_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "problem_index" INTEGER NOT NULL,
    "problem_title" TEXT NOT NULL,
    "steps_solved" INTEGER NOT NULL DEFAULT 0,
    "steps_total" INTEGER NOT NULL,
    "hints_used" INTEGER NOT NULL DEFAULT 0,
    "solved_steps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "revealed_steps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "hinted_steps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_progress_user_id_topic_id_idx" ON "practice_progress"("user_id", "topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_progress_user_id_content_id_problem_index_key" ON "practice_progress"("user_id", "content_id", "problem_index");

-- AddForeignKey
ALTER TABLE "practice_progress" ADD CONSTRAINT "practice_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_progress" ADD CONSTRAINT "practice_progress_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
