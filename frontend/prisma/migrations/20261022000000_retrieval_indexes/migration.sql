-- Typed chunk vectors with an HNSW index, and a full-text column with a GIN index.
--
-- The local embedder (BAAI/bge-small-en-v1.5) writes 384 numbers per chunk; the column was
-- an untyped `vector`. Chunks embedded with the old OpenAI provider hold 1536 numbers. They
-- cannot be compared with 384-number queries, so they are set to NULL here (the chunk text
-- stays). Re-embed them afterwards, or search will not find them by meaning:
--
--     cd ai-service && uv run python scripts/reembed_chunks.py
--
-- EMBEDDING_PROVIDER=openai (1536 numbers) does not fit this column. Using it needs another
-- migration that changes `vector(384)` and the index to the new size, and a re-embed.

UPDATE "material_chunks"
SET "chunk_embedding" = NULL
WHERE "chunk_embedding" IS NOT NULL
  AND vector_dims("chunk_embedding") <> 384;

ALTER TABLE "material_chunks"
    ALTER COLUMN "chunk_embedding" TYPE vector(384);

-- Cosine distance, the operator the search queries use (`<=>`).
CREATE INDEX "material_chunks_chunk_embedding_hnsw_idx"
    ON "material_chunks" USING hnsw ("chunk_embedding" vector_cosine_ops);

-- Full-text search over the heading path (weight A) and the chunk text (weight B).
-- Generated, so every insert and update keeps it current.
ALTER TABLE "material_chunks"
    ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("section_hierarchy", '')), 'A') ||
        setweight(to_tsvector('english', "chunk_text"), 'B')
    ) STORED;

CREATE INDEX "material_chunks_search_vector_idx"
    ON "material_chunks" USING gin ("search_vector");
