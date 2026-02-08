"""Job processing endpoints."""
import logging
import json
import re
from fastapi import APIRouter, HTTPException
from app.models.jobs import JobPayload, MaterialValidationInput, ContentGenerationInput, ExamGenerationInput
from app.services.document_processor.validator import validate_material
from app.services.document_processor.chunker import chunk_document
from app.services.embeddings.generator import generate_embeddings
from app.services.topic_extractor import extract_topics_from_materials
from app.services.embeddings.search import hybrid_search_chunks
from app.services.content_generator import NotesGenerator, ExamplesGenerator, QuizGenerator
from app.services.content_generator.examples import ExampleType
from app.services.content_generator.quiz import QuestionType
from app.services.exam_generator import ExamGenerator
from app.services.exam_grader import ExamGrader
from app.services.cloud_tasks import enqueue_chunking_job, enqueue_topic_extraction_job
from app.db.connection import execute_one, execute_update, execute_query, execute_in_transaction
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


def _is_permanent_llm_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "openai_api_key is not configured" in message
        or "missing bearer" in message
        or "authentication" in message
        or "invalid api key" in message
    )


def _normalize_topic_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()


@router.post("/jobs/validate-material")
async def validate_material_job(payload: JobPayload):
    """
    Process material validation job.
    Called by Cloud Tasks or directly in development.
    """
    try:
        logger.info(f"Starting material validation job: {payload.jobId}")

        # Parse input
        input_data = MaterialValidationInput(**payload.data)

        # Update job status to processing
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'processing',
                stage = 'validating',
                started_at = NOW(),
                progress_percent = 10,
                attempt_count = attempt_count + 1
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Fetch material details
        material = await execute_one(
            """
            SELECT id, gcs_path, filename, category
            FROM materials
            WHERE id = $1
            """,
            input_data.materialId,
        )

        if not material:
            raise HTTPException(status_code=404, detail="Material not found")

        # Validate material
        validation_result = await validate_material(
            material_id=material["id"],
            gcs_path=material["gcs_path"],
            filename=material["filename"],
            category=material["category"],
        )

        # Update material validation status
        await execute_update(
            """
            UPDATE materials
            SET validation_status = $1,
                validation_notes = $2,
                validated_at = NOW()
            WHERE id = $3
            """,
            validation_result.status,
            validation_result.notes,
            input_data.materialId,
        )

        # Update job status to completed
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'completed',
                error_code = NULL,
                error_message = NULL,
                retryable = TRUE,
                progress_percent = 100,
                result_data = $1,
                completed_at = NOW()
            WHERE id = $2
            """,
            json.dumps({
                "validation_status": validation_result.status,
                "notes": validation_result.notes,
            }),
            payload.jobId,
        )

        # If validation succeeded, automatically trigger chunking
        if validation_result.status == "valid":
            logger.warning(f"***** Material validated successfully, triggering chunking for {input_data.materialId} *****")
            
            # Get user_id and project_id from the current job
            current_job = await execute_one(
                """
                SELECT user_id, project_id
                FROM processing_jobs
                WHERE id = $1
                """,
                payload.jobId,
            )
            
            if current_job:
                # Create chunking job
                chunking_job = await execute_one(
                    """
                    INSERT INTO processing_jobs
                    (id, user_id, project_id, job_type, status, stage, input_data, progress_percent, created_at)
                    VALUES (gen_random_uuid()::text, $1, $2, 'chunk_material', 'pending', 'chunking', $3, 0, NOW())
                    RETURNING id
                    """,
                    current_job["user_id"],
                    current_job["project_id"],
                    json.dumps({"materialId": input_data.materialId}),
                )
                
                # Trigger the chunking job via Cloud Tasks
                logger.warning(f"***** Created chunking job {chunking_job['id']} for material {input_data.materialId} *****")

                # Enqueue the chunking job
                try:
                    await enqueue_chunking_job(
                        job_id=chunking_job['id'],
                        material_id=input_data.materialId
                    )
                    logger.warning(f"***** Enqueued chunking job {chunking_job['id']} successfully *****")
                except Exception as enqueue_error:
                    logger.error(f"***** ENQUEUE FAILED: {type(enqueue_error).__name__}: {str(enqueue_error)} *****")
                    import traceback
                    logger.error(f"***** TRACEBACK: {traceback.format_exc()} *****")

        logger.info(f"Completed material validation job: {payload.jobId}")

        return {"status": "success", "jobId": payload.jobId}

    except Exception as e:
        logger.error(f"Error in validation job {payload.jobId}: {e}")

        # Update job status to failed
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'failed',
                error_code = 'VALIDATION_FAILED',
                retryable = FALSE,
                error_message = $1,
                completed_at = NOW()
            WHERE id = $2
            """,
            str(e),
            payload.jobId,
        )

        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@router.post("/jobs/chunk-material")
async def chunk_material_job(payload: JobPayload):
    """
    Process material chunking and embedding generation job.
    Called after validation succeeds.
    """
    try:
        logger.info(f"Starting chunking job: {payload.jobId} with data: {payload.data}")

        input_data = MaterialValidationInput(**payload.data)
        logger.info(f"Parsed input data for material: {input_data.materialId}")

        # Update job status
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'processing',
                stage = 'chunking',
                started_at = NOW(),
                progress_percent = 10,
                attempt_count = attempt_count + 1
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Fetch material
        material = await execute_one(
            """
            SELECT id, gcs_path, filename, project_id
            FROM materials
            WHERE id = $1
            """,
            input_data.materialId,
        )

        if not material:
            # Material was deleted - mark job as failed but return 200 to stop Cloud Tasks retries
            logger.warning(f"Material {input_data.materialId} not found (likely deleted)")
            await execute_update(
                """
                UPDATE processing_jobs
                SET status = 'failed',
                    error_code = 'MATERIAL_NOT_FOUND',
                    retryable = FALSE,
                    error_message = 'Material not found (deleted)',
                    completed_at = NOW()
                WHERE id = $1
                """,
                payload.jobId,
            )
            return {"status": "skipped", "jobId": payload.jobId, "reason": "Material not found"}

        # For development without processing enabled, skip actual PDF processing
        if settings.is_development and not settings.ENABLE_PROCESSING:
            logger.info(f"[DEV] Simulating chunking for {material['filename']}")

            # Update job as completed
            await execute_update(
                """
                UPDATE processing_jobs
                SET status = 'completed',
                    error_code = NULL,
                    error_message = NULL,
                    retryable = TRUE,
                    progress_percent = 100,
                    result_data = $1,
                    completed_at = NOW()
                WHERE id = $2
                """,
                json.dumps({"chunks_created": 0, "note": "Development mode"}),
                payload.jobId,
            )

            return {"status": "success", "jobId": payload.jobId, "dev_mode": True}

        # Download source file from storage
        from app.services.document_processor.validator import download_from_gcs
        from app.services.embeddings.generator import generate_embeddings
        import os
        
        pdf_path = None
        try:
            pdf_path = download_from_gcs(material['gcs_path'])
            
            # Update progress
            await execute_update(
                """
                UPDATE processing_jobs
                SET progress_percent = 25
                WHERE id = $1
                """,
                payload.jobId,
            )

            # Chunk source document
            chunks = chunk_document(pdf_path, material["filename"])
            logger.info(f"Created {len(chunks)} chunks from {material['filename']}")
            
            # Update progress
            await execute_update(
                """
                UPDATE processing_jobs
                SET progress_percent = 50
                WHERE id = $1
                """,
                payload.jobId,
            )

            # Generate embeddings (best-effort). If embeddings fail, keep chunks with NULL vectors
            # and let downstream retrieval run keyword-only fallback paths.
            texts = [chunk.chunk_text for chunk in chunks]
            embeddings = []
            embeddings_available = True
            try:
                embeddings = await generate_embeddings(texts)
                logger.info(f"Generated {len(embeddings)} embeddings")
            except Exception as embedding_error:
                embeddings_available = False
                logger.warning(
                    "Embedding generation failed for job %s: %s. Continuing with keyword-only chunks.",
                    payload.jobId,
                    embedding_error,
                )
            
            # Update progress
            await execute_update(
                """
                UPDATE processing_jobs
                SET progress_percent = 75
                WHERE id = $1
                """,
                payload.jobId,
            )

            # Store chunks in database with embeddings (in transaction for atomicity)
            async def insert_chunks_transaction(conn):
                count = 0
                for idx, chunk in enumerate(chunks):
                    embedding = embeddings[idx] if idx < len(embeddings) else None
                    embedding_str = (
                        f"[{','.join(map(str, embedding))}]"
                        if embedding is not None
                        else None
                    )

                    # Sanitize chunk text - remove null bytes that PostgreSQL can't handle
                    sanitized_text = chunk.chunk_text.replace('\x00', '')
                    sanitized_hierarchy = chunk.section_hierarchy.replace('\x00', '') if chunk.section_hierarchy else None

                    await conn.execute(
                        """
                        INSERT INTO material_chunks
                        (id, material_id, chunk_text, chunk_embedding, section_hierarchy,
                         page_start, page_end, chunk_index, token_count, created_at)
                        VALUES (gen_random_uuid()::text, $1, $2, $3::vector, $4, $5, $6, $7, $8, NOW())
                        """,
                        input_data.materialId,
                        sanitized_text,
                        embedding_str,
                        sanitized_hierarchy,
                        chunk.page_start,
                        chunk.page_end,
                        chunk.chunk_index,
                        chunk.token_count,
                    )
                    count += 1
                return count

            chunks_created = await execute_in_transaction(insert_chunks_transaction)
            logger.info(f"Stored {chunks_created} chunks in database")

            # Validate that chunks were actually created
            if chunks_created == 0:
                raise ValueError(
                    "No chunks were created from the material. "
                    "The file may be empty or contain unreadable text."
                )

            # Mark job complete
            await execute_update(
                """
                UPDATE processing_jobs
                SET status = 'completed',
                    error_code = NULL,
                    error_message = NULL,
                    retryable = TRUE,
                    progress_percent = 100,
                    result_data = $1,
                    completed_at = NOW()
                WHERE id = $2
                """,
                json.dumps(
                    {
                        "chunks_created": chunks_created,
                        "embeddings_available": embeddings_available,
                    }
                ),
                payload.jobId,
            )

            # Keep topic extraction user-driven by default to avoid surprise topic churn
            # while users are still uploading multiple files.
            project_id = material['project_id']
            if settings.AUTO_EXTRACT_TOPICS_ON_CHUNK and project_id:
                # Check if all materials in project are now chunked
                pending_materials = await execute_one(
                    """
                    SELECT COUNT(*) as count
                    FROM materials m
                    LEFT JOIN material_chunks mc ON m.id = mc.material_id
                    WHERE m.project_id = $1
                      AND m.validation_status = 'valid'
                      AND mc.id IS NULL
                    """,
                    project_id
                )

                if pending_materials and pending_materials['count'] == 0:
                    # All materials chunked, check if topic extraction already exists/pending
                    existing_topic_job = await execute_one(
                        """
                        SELECT id FROM processing_jobs
                        WHERE project_id = $1
                          AND job_type = 'extract_topics'
                          AND status IN ('pending', 'processing')
                        ORDER BY created_at DESC
                        LIMIT 1
                        """,
                        project_id
                    )

                    if not existing_topic_job:
                        # Create and enqueue topic extraction job
                        logger.info(f"All materials chunked for project {project_id}, triggering topic extraction")

                        # Get user_id from current job
                        current_job = await execute_one(
                            "SELECT user_id FROM processing_jobs WHERE id = $1",
                            payload.jobId
                        )
                        user_id = current_job['user_id'] if current_job else None

                        if user_id:
                            topic_job = await execute_one(
                                """
                                INSERT INTO processing_jobs
                                (id, user_id, project_id, job_type, status, stage, input_data, progress_percent, created_at)
                                VALUES (gen_random_uuid()::text, $1, $2, 'extract_topics', 'pending', 'extracting', $3, 0, NOW())
                                RETURNING id
                                """,
                                user_id,
                                project_id,
                                json.dumps({"projectId": project_id})
                            )

                            # Enqueue topic extraction task only when API credentials are configured.
                            # This prevents retry noise in local environments that intentionally omit keys.
                            if settings.OPENAI_API_KEY:
                                await enqueue_topic_extraction_job(topic_job['id'], project_id)
                                logger.info(f"Topic extraction job {topic_job['id']} enqueued for project {project_id}")
                            else:
                                logger.warning(
                                    "Skipping automatic topic extraction for project %s because OPENAI_API_KEY is missing",
                                    project_id,
                                )
                                await execute_update(
                                    """
                                    UPDATE processing_jobs
                                    SET status = 'failed',
                                        error_code = 'OPENAI_KEY_MISSING',
                                        retryable = FALSE,
                                        error_message = 'OPENAI_API_KEY is not configured',
                                        completed_at = NOW()
                                    WHERE id = $1
                                    """,
                                    topic_job['id'],
                                )
                    else:
                        logger.info(f"Topic extraction already exists for project {project_id}, skipping")

        finally:
            # Clean up temporary file
            if pdf_path and os.path.exists(pdf_path) and not pdf_path.startswith("/data/uploads"):
                try:
                    os.remove(pdf_path)
                    logger.debug(f"Cleaned up temp file: {pdf_path}")
                except Exception as e:
                    logger.warning(f"Failed to clean up temp file {pdf_path}: {e}")

        logger.info(f"Completed chunking job: {payload.jobId}")
        return {"status": "success", "jobId": payload.jobId}

    except Exception as e:
        logger.error(f"Error in chunking job {payload.jobId}: {e}")

        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'failed',
                error_code = 'CHUNKING_FAILED',
                retryable = TRUE,
                error_message = $1,
                completed_at = NOW()
            WHERE id = $2
            """,
            str(e),
            payload.jobId,
        )

        raise HTTPException(status_code=500, detail=f"Chunking failed: {str(e)}")


@router.post("/jobs/extract-topics")
async def extract_topics_job(payload: JobPayload):
    """
    Extract topics from project materials.
    Called when user requests topic extraction.
    """
    try:
        logger.info(f"Starting topic extraction job: {payload.jobId}")

        project_id = payload.data.get("projectId")
        if not project_id:
            raise HTTPException(status_code=400, detail="projectId required")

        # Update job status
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'processing',
                stage = 'extracting',
                started_at = NOW(),
                progress_percent = 10,
                attempt_count = attempt_count + 1
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Extract topics using LLM
        topics = await extract_topics_from_materials(project_id)

        if not topics:
            raise HTTPException(status_code=404, detail="No topics extracted")

        # Store topics in database with transaction for atomicity
        async def insert_topics_transaction(conn):
            existing_topics = await conn.fetch(
                """
                SELECT id, name
                FROM topics
                WHERE project_id = $1
                ORDER BY created_at ASC
                """,
                project_id,
            )
            existing_by_name = {
                _normalize_topic_name(row["name"]): row
                for row in existing_topics
                if _normalize_topic_name(row["name"])
            }

            topic_count = 0
            kept_topic_ids: list[str] = []
            for idx, topic in enumerate(topics):
                topic_keywords = [keyword.strip() for keyword in (topic.keywords or []) if keyword and keyword.strip()]
                if not topic_keywords:
                    topic_keywords = [topic.name.lower()]

                existing_topic = existing_by_name.get(_normalize_topic_name(topic.name))

                if existing_topic:
                    topic_id = existing_topic["id"]
                    await conn.execute(
                        """
                        UPDATE topics
                        SET description = $1,
                            keywords = $2,
                            order_index = $3,
                            source_material_ids = COALESCE(source_material_ids, '{}'::text[])
                        WHERE id = $4
                        """,
                        topic.description,
                        topic_keywords,
                        idx,
                        topic_id,
                    )
                else:
                    topic_record = await conn.fetchrow(
                        """
                        INSERT INTO topics
                        (id, project_id, name, description, keywords, order_index, source_material_ids, user_confirmed)
                        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, FALSE)
                        RETURNING id
                        """,
                        project_id,
                        topic.name,
                        topic.description,
                        topic_keywords,
                        idx,
                        [],
                    )
                    topic_id = topic_record['id']
                    existing_by_name[_normalize_topic_name(topic.name)] = {"id": topic_id, "name": topic.name}

                kept_topic_ids.append(topic_id)

                # Map topic to relevant chunks using hybrid search
                relevant_chunks = await hybrid_search_chunks(
                    project_id,
                    topic.name,
                    topic.description,
                    topic.keywords,
                    limit=15
                )

                # Replace existing mappings so each extraction run reflects newest chunk ranking.
                await conn.execute(
                    """
                    DELETE FROM topic_chunk_mappings
                    WHERE topic_id = $1
                    """,
                    topic_id,
                )

                # Store chunk mappings
                for chunk in relevant_chunks:
                    await conn.execute(
                        """
                        INSERT INTO topic_chunk_mappings
                        (id, topic_id, chunk_id, relevance_score, relevance_source)
                        VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
                        ON CONFLICT (topic_id, chunk_id) DO UPDATE
                        SET relevance_score = EXCLUDED.relevance_score
                        """,
                        topic_id,
                        chunk['id'],
                        chunk['relevance_score'],
                        chunk['relevance_source'],
                    )

                topic_count += 1

            # Remove stale, unconfirmed topics from previous extraction runs.
            # This keeps the review list focused and prevents duplicate topic drift.
            if kept_topic_ids:
                await conn.execute(
                    """
                    DELETE FROM topics
                    WHERE project_id = $1
                      AND user_confirmed = FALSE
                      AND id <> ALL($2::text[])
                    """,
                    project_id,
                    kept_topic_ids,
                )
            return topic_count

        # Execute all topic insertions in a single transaction
        topics_created = await execute_in_transaction(insert_topics_transaction)

        # Update project status
        await execute_update(
            """
            UPDATE projects
            SET status = 'topics_pending'
            WHERE id = $1
            """,
            project_id,
        )

        # Mark job complete
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'completed',
                error_code = NULL,
                error_message = NULL,
                retryable = TRUE,
                progress_percent = 100,
                result_data = $1,
                completed_at = NOW()
            WHERE id = $2
            """,
            json.dumps({"topics_extracted": topics_created}),
            payload.jobId,
        )

        logger.info(f"Completed topic extraction: {topics_created} topics created")
        return {
            "status": "success",
            "jobId": payload.jobId,
            "topicsCount": topics_created
        }

    except Exception as e:
        logger.error(f"Error in topic extraction job {payload.jobId}: {e}")
        retryable = not _is_permanent_llm_error(e)
        error_code = 'OPENAI_KEY_MISSING' if not retryable else 'TOPIC_EXTRACTION_FAILED'
        status_code = 400 if not retryable else 500

        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'failed',
                error_code = $1,
                retryable = $2,
                error_message = $3,
                completed_at = NOW()
            WHERE id = $4
            """,
            error_code,
            retryable,
            str(e),
            payload.jobId,
        )

        raise HTTPException(status_code=status_code, detail=f"Topic extraction failed: {str(e)}")


@router.post("/jobs/generate-content")
async def generate_content_job(payload: JobPayload):
    """
    Generate content for a topic (notes, examples, or quiz).
    Called when user requests content generation.
    """
    try:
        logger.info(f"Starting content generation job: {payload.jobId}")

        input_data = ContentGenerationInput(**payload.data)

        # Update job status
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'processing',
                stage = 'preparing',
                started_at = NOW(),
                progress_percent = 10,
                attempt_count = attempt_count + 1
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Fetch topic details
        topic = await execute_one(
            """
            SELECT id, name, description, project_id
            FROM topics
            WHERE id = $1
            """,
            input_data.topicId,
        )

        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found")

        generated_content = None
        content_type = input_data.contentType

        # Update progress
        await execute_update(
            """
            UPDATE processing_jobs
            SET progress_percent = 20
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Update progress before generation
        await execute_update(
            """
            UPDATE processing_jobs
            SET progress_percent = 40,
                stage = 'generating'
            WHERE id = $1
            """,
            payload.jobId,
        )

        focus = input_data.preferences.get("focus")
        append = bool(input_data.preferences.get("append"))

        # Generate content based on type
        if content_type == "section_notes":
            generator = NotesGenerator()
            result = await generator.generate_notes(
                topic_id=topic['id'],
                topic_name=topic['name'],
                topic_description=topic['description'],
                user_preferences=input_data.preferences
            )
            generated_content = result['content']
            metadata = {
                'citations': result['citations'],
                'chunk_count': result['chunk_count']
            }

        elif content_type == "solved_examples":
            generator = ExamplesGenerator()
            count = input_data.preferences.get('count', 3)
            difficulty = input_data.preferences.get('difficulty_level', 'medium')

            result = await generator.generate_examples(
                topic_id=topic['id'],
                topic_name=topic['name'],
                topic_description=topic['description'],
                example_type=ExampleType.SOLVED,
                count=count,
                difficulty_level=difficulty,
                focus=focus
            )
            generated_content = result['examples']
            metadata = {
                'example_type': result['example_type'],
                'difficulty_level': result['difficulty_level'],
                'count': len(result['examples'])
            }

        elif content_type == "interactive_examples":
            generator = ExamplesGenerator()
            count = input_data.preferences.get('count', 3)
            difficulty = input_data.preferences.get('difficulty_level', 'medium')

            result = await generator.generate_examples(
                topic_id=topic['id'],
                topic_name=topic['name'],
                topic_description=topic['description'],
                example_type=ExampleType.INTERACTIVE,
                count=count,
                difficulty_level=difficulty,
                focus=focus
            )
            generated_content = result['examples']
            metadata = {
                'example_type': result['example_type'],
                'difficulty_level': result['difficulty_level'],
                'count': len(result['examples'])
            }

        elif content_type == "topic_quiz":
            generator = QuizGenerator()
            question_count = input_data.preferences.get('question_count', 10)
            difficulty = input_data.preferences.get('difficulty_level', 'medium')
            question_types_raw = input_data.preferences.get('question_types')
            question_types = None
            if isinstance(question_types_raw, list) and question_types_raw:
                parsed = []
                for entry in question_types_raw:
                    try:
                        parsed.append(QuestionType(str(entry)))
                    except Exception:
                        continue
                if parsed:
                    question_types = parsed

            result = await generator.generate_quiz(
                topic_id=topic['id'],
                topic_name=topic['name'],
                topic_description=topic['description'],
                question_count=question_count,
                question_types=question_types,
                difficulty_level=difficulty,
                focus=focus
            )
            generated_content = result['questions']
            metadata = {
                'total_questions': result['total_questions'],
                'difficulty_level': result['difficulty_level'],
                'question_types': result['question_types']
            }

        else:
            raise HTTPException(status_code=400, detail=f"Unknown content type: {content_type}")

        # Update progress
        await execute_update(
            """
            UPDATE processing_jobs
            SET progress_percent = 75,
                stage = 'saving'
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Append to existing content when requested (examples/practice only)
        if append and content_type in {"solved_examples", "interactive_examples"}:
            existing_record = await execute_one(
                """
                SELECT content_data, metadata
                FROM topic_content
                WHERE topic_id = $1 AND content_type = $2
                """,
                topic['id'],
                content_type,
            )
            if existing_record:
                existing_content = existing_record.get("content_data")
                if isinstance(existing_content, str):
                    try:
                        existing_content = json.loads(existing_content)
                    except json.JSONDecodeError:
                        existing_content = []
                if not isinstance(existing_content, list):
                    existing_content = []
                if isinstance(generated_content, list):
                    generated_content = existing_content + generated_content
                else:
                    generated_content = existing_content

                if isinstance(metadata, dict):
                    metadata["count"] = len(generated_content) if isinstance(generated_content, list) else metadata.get("count")

        quiz_set_id = None
        if content_type == "topic_quiz":
            # Preserve any pre-existing single quiz payload before appending the new set.
            # This keeps the original quiz visible as Set 1 instead of appearing replaced.
            existing_quiz_set_count_row = await execute_one(
                """
                SELECT COUNT(*)::int AS count
                FROM topic_quizzes
                WHERE topic_id = $1
                """,
                topic['id'],
            )
            existing_quiz_set_count = int(existing_quiz_set_count_row.get("count", 0)) if existing_quiz_set_count_row else 0

            if existing_quiz_set_count == 0:
                legacy_quiz_row = await execute_one(
                    """
                    SELECT content_data, created_at, updated_at
                    FROM topic_content
                    WHERE topic_id = $1 AND content_type = 'topic_quiz'
                    """,
                    topic['id'],
                )
                if legacy_quiz_row:
                    legacy_questions = legacy_quiz_row.get("content_data")
                    if isinstance(legacy_questions, str):
                        try:
                            legacy_questions = json.loads(legacy_questions)
                        except json.JSONDecodeError:
                            legacy_questions = None

                    if isinstance(legacy_questions, list) and legacy_questions:
                        await execute_update(
                            """
                            INSERT INTO topic_quizzes
                            (id, topic_id, questions, created_at)
                            VALUES (gen_random_uuid()::text, $1, $2, COALESCE($3, $4, NOW()))
                            """,
                            topic['id'],
                            json.dumps(legacy_questions),
                            legacy_quiz_row.get("updated_at"),
                            legacy_quiz_row.get("created_at"),
                        )

            quiz_set_record = await execute_one(
                """
                INSERT INTO topic_quizzes
                (id, topic_id, questions, created_at)
                VALUES (gen_random_uuid()::text, $1, $2, NOW())
                RETURNING id
                """,
                topic['id'],
                json.dumps(generated_content),
            )
            if quiz_set_record:
                quiz_set_id = quiz_set_record.get("id")
                if isinstance(metadata, dict):
                    metadata["quiz_set_id"] = quiz_set_id

        # Store generated content in database
        # asyncpg expects JSON values as serialized strings unless explicit codecs are configured.
        content_payload = json.dumps(generated_content)
        metadata_payload = json.dumps(metadata) if metadata is not None else None

        # Use ON CONFLICT to handle regeneration (replaces existing content)
        content_record = await execute_one(
            """
            INSERT INTO topic_content
            (id, topic_id, content_type, content_data, metadata, created_at, updated_at)
            VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT (topic_id, content_type)
            DO UPDATE SET
                content_data = EXCLUDED.content_data,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
            RETURNING id
            """,
            topic['id'],
            content_type,
            content_payload,
            metadata_payload,
        )

        # Update progress
        await execute_update(
            """
            UPDATE processing_jobs
            SET progress_percent = 90,
                stage = 'finalizing'
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Mark job complete
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'completed',
                error_code = NULL,
                error_message = NULL,
                retryable = TRUE,
                progress_percent = 100,
                stage = 'completed',
                result_data = $1,
                completed_at = NOW()
            WHERE id = $2
            """,
            json.dumps({
                "content_id": content_record['id'],
                "content_type": content_type,
                "metadata": metadata
            }),
            payload.jobId,
        )

        logger.info(f"Completed content generation: {content_type} for topic {topic['id']}")
        return {
            "status": "success",
            "jobId": payload.jobId,
            "contentId": content_record['id'],
            "contentType": content_type
        }

    except Exception as e:
        logger.error(f"Error in content generation job {payload.jobId}: {e}")
        retryable = not _is_permanent_llm_error(e)
        error_code = 'OPENAI_KEY_MISSING' if not retryable else 'CONTENT_GENERATION_FAILED'
        status_code = 400 if not retryable else 500

        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'failed',
                error_code = $1,
                retryable = $2,
                error_message = $3,
                completed_at = NOW()
            WHERE id = $4
            """,
            error_code,
            retryable,
            str(e),
            payload.jobId,
        )

        raise HTTPException(status_code=status_code, detail=f"Content generation failed: {str(e)}")


@router.post("/jobs/generate-exam")
async def generate_exam_job(payload: JobPayload):
    """
    Generate a sample exam across multiple topics.
    Called when user requests exam creation.
    """
    try:
        logger.info(f"Starting exam generation job: {payload.jobId}")

        input_data = ExamGenerationInput(**payload.data)

        # Update job status
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'processing',
                stage = 'generating',
                started_at = NOW(),
                progress_percent = 10,
                attempt_count = attempt_count + 1
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Generate exam using ExamGenerator
        generator = ExamGenerator()
        result = await generator.generate_exam(
            project_id=input_data.projectId,
            topic_ids=input_data.topicIds,
            config=input_data.config,
        )

        # Update progress
        await execute_update(
            """
            UPDATE processing_jobs
            SET progress_percent = 70
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Store exam in database
        exam_record = await execute_one(
            """
            INSERT INTO sample_exams
            (id, project_id, name, questions, duration_minutes, difficulty_level, topics_covered, created_at)
            VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW())
            RETURNING id
            """,
            input_data.projectId,
            f"Sample Exam - {result['generated_at'][:10]}",
            json.dumps(result['questions']),
            result['duration_minutes'],
            result['difficulty_level'],
            result['topics_covered'],
        )

        # Mark job complete
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'completed',
                error_code = NULL,
                error_message = NULL,
                retryable = TRUE,
                progress_percent = 100,
                result_data = $1,
                completed_at = NOW()
            WHERE id = $2
            """,
            json.dumps({
                "exam_id": exam_record['id'],
                "total_questions": result['total_questions'],
                "topics_covered": result['topics_covered']
            }),
            payload.jobId,
        )

        logger.info(f"Completed exam generation: {result['total_questions']} questions")
        return {
            "status": "success",
            "jobId": payload.jobId,
            "examId": exam_record['id'],
            "totalQuestions": result['total_questions']
        }

    except Exception as e:
        logger.error(f"Error in exam generation job {payload.jobId}: {e}")
        retryable = not _is_permanent_llm_error(e)
        error_code = 'OPENAI_KEY_MISSING' if not retryable else 'EXAM_GENERATION_FAILED'
        status_code = 400 if not retryable else 500

        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'failed',
                error_code = $1,
                retryable = $2,
                error_message = $3,
                completed_at = NOW()
            WHERE id = $4
            """,
            error_code,
            retryable,
            str(e),
            payload.jobId,
        )

        raise HTTPException(status_code=status_code, detail=f"Exam generation failed: {str(e)}")


@router.post("/jobs/grade-exam")
async def grade_exam_job(payload: JobPayload):
    """
    Grade an exam submission.
    Called after student submits exam answers.
    """
    try:
        logger.info(f"Starting exam grading job: {payload.jobId}")

        submission_id = payload.data.get("submissionId")
        questions = payload.data.get("questions")
        answers = payload.data.get("answers")

        if not isinstance(submission_id, str) or not submission_id:
            raise HTTPException(status_code=400, detail="Missing submissionId")
        if not isinstance(questions, list) or len(questions) == 0:
            raise HTTPException(status_code=400, detail="Missing questions")
        if not isinstance(answers, dict):
            raise HTTPException(status_code=400, detail="Missing answers")

        # Update job status
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'processing',
                stage = 'grading',
                started_at = NOW(),
                progress_percent = 10,
                attempt_count = attempt_count + 1
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Grade the submission
        grader = ExamGrader()
        grading_result = await grader.grade_submission(
            submission_id=submission_id,
            questions=questions,
            answers=answers,
        )

        # Update progress
        await execute_update(
            """
            UPDATE processing_jobs
            SET progress_percent = 70
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Store grading results in exam_submissions
        await execute_update(
            """
            UPDATE exam_submissions
            SET ai_grading = $1,
                ai_feedback = $2,
                graded_at = NOW()
            WHERE id = $3
            """,
            json.dumps(grading_result),
            json.dumps(
                {
                    "overall_score": grading_result["overall_score"],
                    "earned_points": grading_result["earned_points"],
                    "total_points": grading_result["total_points"],
                }
            ),
            submission_id,
        )

        submission_context = await execute_one(
            """
            SELECT es.user_id, se.project_id
            FROM exam_submissions es
            JOIN sample_exams se ON se.id = es.sample_exam_id
            WHERE es.id = $1
            """,
            submission_id,
        )

        if submission_context:
            user_id = submission_context["user_id"]
            project_id = submission_context["project_id"]
            for graded_question in grading_result.get("graded_questions", []):
                topic_id = None
                question_index = graded_question.get("question_index")
                if isinstance(question_index, int) and 0 <= question_index < len(questions):
                    question_payload = questions[question_index]
                    if isinstance(question_payload, dict):
                        topic_id = question_payload.get("topic_id")

                points_possible = graded_question.get("points_possible", 0) or 0
                points_earned = graded_question.get("points_earned", 0) or 0
                score = 0.0
                if points_possible and isinstance(points_possible, (int, float)):
                    score = float(points_earned) / float(points_possible)

                await execute_update(
                    """
                    INSERT INTO learning_signals
                    (id, user_id, project_id, topic_id, source, score, metadata, created_at)
                    VALUES (gen_random_uuid()::text, $1, $2, $3, 'exam', $4, $5, NOW())
                    """,
                    user_id,
                    project_id,
                    topic_id,
                    score,
                    json.dumps(
                        {
                            "submission_id": submission_id,
                            "question_index": question_index,
                            "points_possible": points_possible,
                            "points_earned": points_earned,
                        }
                    ),
                )

        # Mark job complete
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'completed',
                error_code = NULL,
                error_message = NULL,
                retryable = TRUE,
                progress_percent = 100,
                result_data = $1,
                completed_at = NOW()
            WHERE id = $2
            """,
            json.dumps({
                "submission_id": submission_id,
                "overall_score": grading_result["overall_score"],
                "earned_points": grading_result["earned_points"],
                "total_points": grading_result["total_points"],
            }),
            payload.jobId,
        )

        logger.info(f"Completed exam grading: {grading_result['overall_score']}%")
        return {
            "status": "success",
            "jobId": payload.jobId,
            "overallScore": grading_result["overall_score"],
        }

    except Exception as e:
        logger.error(f"Error in exam grading job {payload.jobId}: {e}")
        retryable = not _is_permanent_llm_error(e)
        error_code = 'OPENAI_KEY_MISSING' if not retryable else 'EXAM_GRADING_FAILED'
        status_code = 400 if not retryable else 500

        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'failed',
                error_code = $1,
                retryable = $2,
                error_message = $3,
                completed_at = NOW()
            WHERE id = $4
            """,
            error_code,
            retryable,
            str(e),
            payload.jobId,
        )

        raise HTTPException(status_code=status_code, detail=f"Exam grading failed: {str(e)}")
