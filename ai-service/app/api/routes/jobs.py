"""Job processing endpoints."""
import logging
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
from app.db.connection import execute_one, execute_update, execute_query
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
            {
                "validation_status": validation_result.status,
                "notes": validation_result.notes,
            },
            payload.jobId,
        )

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
                {"chunks_created": 0, "note": "Development mode"},
                payload.jobId,
            )

            return {"status": "success", "jobId": payload.jobId, "dev_mode": True}

        # TODO: Download PDF from GCS in production
        # pdf_path = download_from_gcs(material['gcs_path'])

        # Chunk PDF
        # chunks = chunk_pdf(pdf_path)
        # await execute_update(..., progress_percent = 50)

        # Generate embeddings
        # texts = [chunk.chunk_text for chunk in chunks]
        # embeddings = await generate_embeddings(texts)
        # await execute_update(..., progress_percent = 75)

        # Store chunks in database
        # for chunk, embedding in zip(chunks, embeddings):
        #     await execute_update(
        #         """INSERT INTO material_chunks ..."""
        #     )

        # Mark job complete
        await execute_update(
            """
            UPDATE processing_jobs
            SET status = 'completed',
                progress_percent = 100,
                completed_at = NOW()
            WHERE id = $1
            """,
            payload.jobId,
        )

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

        # Store topics in database
        for idx, topic in enumerate(topics):
            topic_record = await execute_one(
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
                await execute_update(
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
            {"topics_extracted": len(topics)},
            payload.jobId,
        )

        logger.info(f"Completed topic extraction: {len(topics)} topics created")
        return {
            "status": "success",
            "jobId": payload.jobId,
            "topicsCount": len(topics)
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
        content_record = await execute_one(
            """
            INSERT INTO topic_content
            (topic_id, content_type, content_data, metadata)
            VALUES ($1, $2, $3, $4)
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
            {
                "content_id": content_record['id'],
                "content_type": content_type,
                "metadata": metadata
            },
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
            {
                "exam_id": exam_record['id'],
                "total_questions": result['total_questions'],
                "topics_covered": result['topics_covered']
            },
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
            {
                "submission_id": submission_id,
                "overall_score": grading_result["overall_score"],
                "earned_points": grading_result["earned_points"],
                "total_points": grading_result["total_points"],
            },
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
