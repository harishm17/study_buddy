-- The voice coach is now a text conversation with Claude: the session remembers its style and
-- focus, and keeps the conversation on the server.
ALTER TABLE "voice_drill_sessions"
    ADD COLUMN "style" TEXT NOT NULL DEFAULT 'oral_quiz',
    ADD COLUMN "focus" TEXT,
    ADD COLUMN "history" JSONB;
