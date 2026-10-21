-- Course structure (learning v2, stage 2). Additive only: new tables and columns, nothing is
-- dropped or rewritten. Topics keep working without units or sources (unit_id and the source
-- rows are simply absent); materials default to role 'content'.

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'content';

-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "estimated_minutes" INTEGER,
ADD COLUMN     "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "prerequisite_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "unit_id" TEXT;

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "order_index" INTEGER NOT NULL,
    "week_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_sources" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "chunk_index_start" INTEGER NOT NULL,
    "chunk_index_end" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'primary',

    CONSTRAINT "topic_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "units_project_id_order_index_idx" ON "units"("project_id", "order_index");

-- CreateIndex
CREATE INDEX "topic_sources_topic_id_idx" ON "topic_sources"("topic_id");

-- CreateIndex
CREATE INDEX "topic_sources_material_id_idx" ON "topic_sources"("material_id");

-- CreateIndex
CREATE INDEX "topics_unit_id_idx" ON "topics"("unit_id");

-- CreateIndex
CREATE INDEX "llm_usage_events_created_at_idx" ON "llm_usage_events"("created_at");

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_sources" ADD CONSTRAINT "topic_sources_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_sources" ADD CONSTRAINT "topic_sources_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Past exams uploaded before roles existed keep behaving as exams: left out of topic sources.
UPDATE "materials" SET "role" = 'exam' WHERE "category" = 'sample_exams';
