-- TEMPORARY, for the feat/past-exams branch only. The learning-loop branch owns this column
-- (Topic.examRelevant, in its own migration); the past-exams code writes to it, and this migration
-- exists only so this branch's tests and database have the column. The reviewer drops this whole
-- directory when the branch is rebased onto learning-loop. IF NOT EXISTS keeps a database that
-- already has the column (from either migration) working.
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "exam_relevant" BOOLEAN NOT NULL DEFAULT false;
