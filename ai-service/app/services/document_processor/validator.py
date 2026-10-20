"""Material validation service."""
import logging
from typing import Optional
from pydantic import BaseModel
from app.services.llm import LLMFactory
from app.services.llm.base import LLMError, LLMMessage
from app.services.llm.schemas import MaterialCheck
from app.config import settings
from app.services.document_processor.extractors import (
    extract_document_text,
    infer_extension,
    SUPPORTED_EXTENSIONS,
)

logger = logging.getLogger(__name__)


class ValidationResult(BaseModel):
    """Result of material validation."""

    status: str  # 'valid' or 'invalid'
    notes: str
    page_count: Optional[int] = None
    has_text: bool = False


async def validate_material(
    material_id: str,
    gcs_path: str,
    filename: str,
    category: str,
) -> ValidationResult:
    """
    Validate an uploaded study material.

    Steps:
    1. Check if file type is supported
    2. Check if file is parseable (not corrupted)
    2. Extract sample text
    3. Use LLM to validate content relevance

    Args:
        material_id: Material ID
        gcs_path: GCS path to PDF
        filename: Original filename
        category: Material category (lecture_notes, sample_exams, book_chapters)

    Returns:
        ValidationResult with status and notes
    """
    # For development, we'll skip actual GCS download
    # In production, download from GCS first
    if settings.is_development and not settings.ENABLE_PROCESSING:
        logger.info(f"[DEV] Simulating validation for {filename}")
        return ValidationResult(
            status="valid",
            notes="Development mode: validation skipped",
            page_count=10,
            has_text=True,
        )

    # 1. Download file from storage
    local_path = None
    page_count = 0
    has_text = False
    
    try:
        extension = infer_extension(filename)
        if extension not in SUPPORTED_EXTENSIONS:
            return ValidationResult(
                status="invalid",
                notes=(
                    f"Unsupported file type '{extension}'. "
                    "Supported formats: .pdf, .docx, .pptx, .doc"
                ),
            )

        local_path = download_from_gcs(gcs_path)
        extracted = extract_document_text(local_path, filename)
        page_count = extracted.page_count
        sample_text = extracted.text[:6000]

        if page_count <= 0:
            return ValidationResult(
                status="invalid", notes="Document has no readable pages/slides", page_count=0
            )

        has_text = len(sample_text.strip()) > 100

        if not has_text:
            return ValidationResult(
                status="invalid",
                notes="Document appears empty or text could not be extracted",
                page_count=page_count,
                has_text=False,
            )

        # 3. LLM validation
        prompt = f"""A student uploaded a file to study from. Decide whether it can be used as study material.

Category the student chose: {category.replace('_', ' ')}
Filename: {filename}
Format: {extension}
Page Count: {page_count}

Sample Content (first 500 words):
{sample_text[:2000]}

Set is_valid to true for anything a student could reasonably study from: lecture notes, slides, textbook chapters, papers, problem sets, past exams, documentation, standards or legal texts, and so on. A category that does not match exactly is fine.
Set is_valid to false only when the file clearly is not study material (a receipt, an invoice, spam, a personal letter) or the text is unreadable (garbled characters, almost no text).
Give a one or two sentence note explaining the decision.
"""
        try:
            llm = LLMFactory.get_provider()
            check = await llm.generate_structured(
                [LLMMessage(role="user", content=prompt)],
                MaterialCheck,
                tier="fast",
                max_tokens=2000,
                purpose="validate_material",
            )
            is_valid = check.is_valid
            notes = check.notes or "No validation notes provided"
        except LLMError as llm_error:
            # Fallback path: keep pipeline functional if LLM credentials are missing
            # or upstream API auth is unavailable.
            logger.warning(f"LLM validation unavailable for {material_id}: {llm_error}")
            is_valid = True
            notes = (
                "Validation completed using structural checks only "
                f"(LLM unavailable: {llm_error})."
            )

        return ValidationResult(
            status="valid" if is_valid else "invalid",
            notes=notes,
            page_count=page_count,
            has_text=has_text,
        )

    except Exception as e:
        logger.error(f"Validation error for {material_id}: {e}")
        error_text = str(e).lower()
        auth_related = (
            "401" in error_text
            or "authentication" in error_text
            or "missing bearer" in error_text
            or "api key" in error_text
        )
        if settings.is_development and page_count > 0 and has_text and auth_related:
            return ValidationResult(
                status="valid",
                notes=(
                    "Validation completed using structural checks only "
                    "(LLM authentication unavailable)."
                ),
                page_count=page_count,
                has_text=has_text,
            )
        return ValidationResult(status="invalid", notes=f"Validation error: {str(e)}")
    finally:
        # Clean up temporary file
        if local_path and not settings.is_development:
            import os
            try:
                if os.path.exists(local_path):
                    os.remove(local_path)
                    logger.debug(f"Cleaned up temp file: {local_path}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to clean up temp file {local_path}: {cleanup_error}")


def download_from_gcs(gcs_path: str) -> str:
    """
    Download file from GCS to local temp file.

    Args:
        gcs_path: GCS path (gs://bucket/path)

    Returns:
        Local file path to downloaded file
    """
    import tempfile
    import os
    
    try:
        # Parse GCS path (gs://bucket/path)
        if not gcs_path.startswith("gs://"):
            raise ValueError(f"Invalid GCS path format: {gcs_path}")

        path_parts = gcs_path[5:].split("/", 1)  # Remove "gs://" prefix
        if len(path_parts) != 2:
            raise ValueError(f"Invalid GCS path format: {gcs_path}")

        bucket_name, blob_path = path_parts

        # In development, check local storage first
        if settings.is_development:
            local_path = os.path.join("/data/uploads", blob_path)
            if os.path.exists(local_path):
                logger.info(f"Using local file: {local_path}")
                return local_path
            fallback_path = os.path.join("/tmp/studybuddy-uploads", blob_path)
            if os.path.exists(fallback_path):
                logger.info(f"Using local fallback file: {fallback_path}")
                return fallback_path

        # Initialize GCS client
        from google.cloud import storage as gcs_storage
        storage_client = gcs_storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        
        # Create temporary file
        temp_dir = tempfile.gettempdir()
        temp_filename = os.path.join(temp_dir, f"studybuddy_{os.path.basename(blob_path)}")
        
        # Download file
        logger.info(f"Downloading {gcs_path} to {temp_filename}")
        blob.download_to_filename(temp_filename)
        
        logger.info(f"Successfully downloaded file to {temp_filename}")
        return temp_filename
        
    except Exception as e:
        logger.error(f"Error downloading file from GCS {gcs_path}: {e}")
        raise
