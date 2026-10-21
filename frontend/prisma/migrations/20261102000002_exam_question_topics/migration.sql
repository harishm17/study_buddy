-- Past exams, topic relevance by model (learning v2, stage 3). Additive only: one nullable column.
-- For a material with role 'exam': which topics each of its questions tests, written together with
-- topics.exam_relevant (see ai-service app/services/exam_relevance.py). Null for every other file.

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "exam_topic_map" JSONB;
