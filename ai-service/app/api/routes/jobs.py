"""Job processing endpoints."""
import logging
import json
from fastapi import APIRouter, HTTPException
from app.models.jobs import JobPayload, MaterialValidationInput, ContentGenerationInput, ExamGenerationInput
from app.services.document_processor.validator import validate_material
from app.services.document_processor.chunker import chunk_pdf
from app.services.embeddings.generator import generate_embeddings
from app.services.topic_extractor import extract_topics_from_materials
from app.services.embeddings.search import hybrid_search_chunks
from app.services.content_generator import NotesGenerator, ExamplesGenerator, QuizGenerator
from app.services.content_generator.examples import ExampleType
from app.services.exam_generator import ExamGenerator
from app.services.exam_grader import ExamGrader
from app.services.cloud_tasks import enqueue_chunking_job
from app.db.connection import execute_one, execute_update, execute_query, execute_in_transaction
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


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
            SET status = 'processing', started_at = NOW(), progress_percent = 10
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
            logger.info(f"Material validated successfully, triggering chunking for {input_data.materialId}")
            
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
                    (id, user_id, project_id, job_type, status, input_data, progress_percent, created_at)
                    VALUES (gen_random_uuid(), $1, $2, 'chunk_material', 'pending', $3, 0, NOW())
                    RETURNING id
                    """,
                    current_job["user_id"],
                    current_job["project_id"],
                    json.dumps({"materialId": input_data.materialId}),
                )
                
                # Trigger the chunking job via Cloud Tasks
                logger.info(f"Created chunking job {chunking_job['id']} for material {input_data.materialId}")

                # Enqueue the chunking job
                await enqueue_chunking_job(
                    job_id=chunking_job['id'],
                    material_id=input_data.materialId
                )

                logger.info(f"Enqueued chunking job {chunking_job['id']}")

        logger.info(f"Completed material validation job: {payload.jobId}")

        return {"status": "success", "jobId": payload.jobId}

    except Exception as e:
        logger.error(f"Error in validation job {payload.jobId}: {e}")

        # Update job status to failed
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'failed',
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
        logger.info(f"Starting chunking job: {payload.jobId}")

        input_data = MaterialValidationInput(**payload.data)

        # Update job status
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'processing', started_at = NOW(), progress_percent = 10
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Fetch material
        material = await execute_one(
            """
            SELECT id, gcs_path, filename
            FROM materials
            WHERE id = $1
            """,
            input_data.materialId,
        )

        if not material:
            raise HTTPException(status_code=404, detail="Material not found")

        # For development, skip actual PDF processing
        if settings.is_development:
            logger.info(f"[DEV] Simulating chunking for {material['filename']}")

            # Update job as completed
            await execute_update(
                """
                UPDATE processing_jobs
                SET status = 'completed',
                    progress_percent = 100,
                    result_data = $1,
                    completed_at = NOW()
                WHERE id = $2
                """,
                json.dumps({"chunks_created": 0, "note": "Development mode"}),
                payload.jobId,
            )

            return {"status": "success", "jobId": payload.jobId, "dev_mode": True}

        # Download PDF from GCS
        from app.services.document_processor.validator import download_from_gcs
        from app.services.document_processor.chunker import chunk_pdf
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

            # Chunk PDF
            chunks = chunk_pdf(pdf_path)
            logger.info(f"Created {len(chunks)} chunks from PDF")
            
            # Update progress
            await execute_update(
                """
                UPDATE processing_jobs
                SET progress_percent = 50
                WHERE id = $1
                """,
                payload.jobId,
            )

            # Generate embeddings
            texts = [chunk.chunk_text for chunk in chunks]
            embeddings = await generate_embeddings(texts)
            logger.info(f"Generated {len(embeddings)} embeddings")
            
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
                for chunk, embedding in zip(chunks, embeddings):
                    # Convert embedding to pgvector format
                    embedding_str = f"[{','.join(map(str, embedding))}]"

                    await conn.execute(
                        """
                        INSERT INTO material_chunks
                        (id, material_id, chunk_text, chunk_embedding, section_hierarchy,
                         page_start, page_end, chunk_index, token_count, created_at)
                        VALUES (gen_random_uuid(), $1, $2, $3::vector, $4, $5, $6, $7, $8, NOW())
                        """,
                        input_data.materialId,
                        chunk.chunk_text,
                        embedding_str,
                        chunk.section_hierarchy,
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
                raise ValueError("No chunks were created from the PDF. The PDF may be empty or unreadable.")

            # Mark job complete
            await execute_update(
                """
                UPDATE processing_jobs
                SET status = 'completed',
                    progress_percent = 100,
                    result_data = $1,
                    completed_at = NOW()
                WHERE id = $2
                """,
                json.dumps({"chunks_created": chunks_created}),
                payload.jobId,
            )
        finally:
            # Clean up temporary file
            if pdf_path and os.path.exists(pdf_path):
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
            SET status = 'processing', started_at = NOW(), progress_percent = 10
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
            topic_count = 0
            for idx, topic in enumerate(topics):
                topic_record = await conn.fetchrow(
                    """
                    INSERT INTO topics
                    (project_id, name, description, keywords, order_index, user_confirmed)
                    VALUES ($1, $2, $3, $4, $5, FALSE)
                    RETURNING id
                    """,
                    project_id,
                    topic.name,
                    topic.description,
                    topic.keywords,
                    idx,
                )

                topic_id = topic_record['id']

                # Map topic to relevant chunks using hybrid search
                relevant_chunks = await hybrid_search_chunks(
                    project_id,
                    topic.name,
                    topic.description,
                    topic.keywords,
                    limit=15
                )

                # Store chunk mappings
                for chunk in relevant_chunks:
                    await conn.execute(
                        """
                        INSERT INTO topic_chunk_mappings
                        (topic_id, chunk_id, relevance_score, relevance_source)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (topic_id, chunk_id) DO UPDATE
                        SET relevance_score = EXCLUDED.relevance_score
                        """,
                        topic_id,
                        chunk['id'],
                        chunk['relevance_score'],
                        chunk['relevance_source'],
                    )

                topic_count += 1
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

        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'failed',
                error_message = $1,
                completed_at = NOW()
            WHERE id = $2
            """,
            str(e),
            payload.jobId,
        )

        raise HTTPException(status_code=500, detail=f"Topic extraction failed: {str(e)}")


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
            SET status = 'processing', started_at = NOW(), progress_percent = 10
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
            SET progress_percent = 30
            WHERE id = $1
            """,
            payload.jobId,
        )

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
                difficulty_level=difficulty
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
                difficulty_level=difficulty
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

            result = await generator.generate_quiz(
                topic_id=topic['id'],
                topic_name=topic['name'],
                topic_description=topic['description'],
                question_count=question_count,
                difficulty_level=difficulty
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
            SET progress_percent = 70
            WHERE id = $1
            """,
            payload.jobId,
        )

        # Store generated content in database
        # Use ON CONFLICT to handle regeneration (replaces existing content)
        content_record = await execute_one(
            """
            INSERT INTO topic_content
            (topic_id, content_type, content_data, metadata, generated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (topic_id, content_type)
            DO UPDATE SET
                content_data = EXCLUDED.content_data,
                metadata = EXCLUDED.metadata,
                generated_at = NOW()
            RETURNING id
            """,
            topic['id'],
            content_type,
            generated_content,
            metadata,
        )

        # Mark job complete
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'completed',
                progress_percent = 100,
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

        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'failed',
                error_message = $1,
                completed_at = NOW()
            WHERE id = $2
            """,
            str(e),
            payload.jobId,
        )

        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")


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
            SET status = 'processing', started_at = NOW(), progress_percent = 10
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
            (project_id, name, questions, duration_minutes, difficulty_level, topics_covered, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id
            """,
            input_data.projectId,
            f"Sample Exam - {result['generated_at'][:10]}",
            result['questions'],
            result['duration_minutes'],
            result['difficulty_level'],
            result['topics_covered'],
        )

        # Mark job complete
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'completed',
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

        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'failed',
                error_message = $1,
                completed_at = NOW()
            WHERE id = $2
            """,
            str(e),
            payload.jobId,
        )

        raise HTTPException(status_code=500, detail=f"Exam generation failed: {str(e)}")


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

        if not submission_id or not questions or not answers:
            raise HTTPException(status_code=400, detail="Missing required data")

        # Update job status
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'processing', started_at = NOW(), progress_percent = 10
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
            grading_result,
            {
                "overall_score": grading_result["overall_score"],
                "earned_points": grading_result["earned_points"],
                "total_points": grading_result["total_points"],
            },
            submission_id,
        )

        # Mark job complete
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'completed',
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

        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'failed',
                error_message = $1,
                completed_at = NOW()
            WHERE id = $2
            """,
            str(e),
            payload.jobId,
        )

        raise HTTPException(status_code=500, detail=f"Exam grading failed: {str(e)}")
