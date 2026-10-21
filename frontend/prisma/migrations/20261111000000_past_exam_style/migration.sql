-- Past exams (learning v2, stage 3). Additive only: one nullable column. A material with role
-- 'exam' gets its style profile here once it has been chunked (see ai-service
-- app/services/exam_style.py); the column is null for every other file.

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "style_profile" JSONB;
