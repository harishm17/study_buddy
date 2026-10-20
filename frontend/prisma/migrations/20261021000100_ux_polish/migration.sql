-- Indexes the queries actually use, a few redundant ones removed, and the two columns the
-- voice coach needs to meter session time.

-- Redundant: each is a prefix of, or the same as, another index or a unique constraint.
DROP INDEX "users_email_idx";                          -- users.email is already unique
DROP INDEX "topics_project_id_idx";                    -- prefix of (project_id, order_index)
DROP INDEX "material_chunks_material_id_idx";          -- prefix of the unique (material_id, chunk_index)
DROP INDEX "quiz_attempts_user_id_topic_id_idx";       -- prefix of the new (user_id, topic_id, taken_at)
DROP INDEX "exam_submissions_sample_exam_id_idx";      -- prefix of the new (sample_exam_id, user_id, submitted_at)
DROP INDEX "voice_drill_attempts_session_id_idx";      -- prefix of the unique (session_id, question_index)
DROP INDEX "voice_drill_attempts_user_id_idx";         -- prefix of the new (user_id, topic_id, created_at)

-- Voice session time metering.
ALTER TABLE "voice_drill_sessions" ADD COLUMN     "connected_at" TIMESTAMP(3),
ADD COLUMN     "last_seen_at" TIMESTAMP(3);

CREATE INDEX "voice_drill_sessions_user_id_connected_at_idx" ON "voice_drill_sessions"("user_id", "connected_at");

-- Query indexes.
CREATE INDEX "quiz_attempts_user_id_topic_id_taken_at_idx" ON "quiz_attempts"("user_id", "topic_id", "taken_at");
CREATE INDEX "learning_signals_user_id_topic_id_source_created_at_idx" ON "learning_signals"("user_id", "topic_id", "source", "created_at");
CREATE INDEX "exam_submissions_sample_exam_id_user_id_submitted_at_idx" ON "exam_submissions"("sample_exam_id", "user_id", "submitted_at");
CREATE INDEX "voice_drill_attempts_user_id_topic_id_created_at_idx" ON "voice_drill_attempts"("user_id", "topic_id", "created_at");
