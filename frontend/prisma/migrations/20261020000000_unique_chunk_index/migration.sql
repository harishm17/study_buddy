-- Re-running the chunk job used to insert a second copy of every chunk. Collapse those
-- copies, keeping the lowest id per (material_id, chunk_index), then make it impossible.

-- Every duplicate chunk and the chunk that replaces it.
CREATE TEMP TABLE "_chunk_dedupe" AS
SELECT "dup_id", "keep_id"
FROM (
    SELECT "id" AS "dup_id",
           MIN("id") OVER (PARTITION BY "material_id", "chunk_index") AS "keep_id"
    FROM "material_chunks"
) AS "ranked"
WHERE "dup_id" <> "keep_id";

-- A topic may map to several copies of one chunk, and the unique (topic_id, chunk_id)
-- constraint allows only one mapping per kept chunk. Per topic and kept chunk, keep the
-- mapping already on the kept chunk, else the highest-scoring one; delete the rest.
DELETE FROM "topic_chunk_mappings"
WHERE "id" IN (
    SELECT "id"
    FROM (
        SELECT m."id",
               ROW_NUMBER() OVER (
                   PARTITION BY m."topic_id", COALESCE(d."keep_id", m."chunk_id")
                   ORDER BY (d."dup_id" IS NULL) DESC, m."relevance_score" DESC, m."id"
               ) AS "rank"
        FROM "topic_chunk_mappings" m
        LEFT JOIN "_chunk_dedupe" d ON d."dup_id" = m."chunk_id"
        WHERE m."chunk_id" IN (SELECT "dup_id" FROM "_chunk_dedupe")
           OR m."chunk_id" IN (SELECT "keep_id" FROM "_chunk_dedupe")
    ) AS "ranked_mappings"
    WHERE "rank" > 1
);

-- The surviving mappings that still point at a duplicate move to the kept chunk.
UPDATE "topic_chunk_mappings" m
SET "chunk_id" = d."keep_id"
FROM "_chunk_dedupe" d
WHERE m."chunk_id" = d."dup_id";

DELETE FROM "material_chunks"
WHERE "id" IN (SELECT "dup_id" FROM "_chunk_dedupe");

DROP TABLE "_chunk_dedupe";

-- The unique index replaces the plain index on the same columns.
DROP INDEX "material_chunks_material_id_chunk_index_idx";

CREATE UNIQUE INDEX "material_chunks_material_id_chunk_index_key" ON "material_chunks"("material_id", "chunk_index");
