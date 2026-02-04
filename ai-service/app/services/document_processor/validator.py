"""Material validation service."""
import logging
from typing import Optional
from pydantic import BaseModel
import pymupdf  # PyMuPDF
from app.services.llm import LLMFactory
from app.services.llm.base import LLMMessage
from app.config import settings

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
    Validate an uploaded PDF material.

    Steps:
    1. Check if file is parseable (not corrupted)
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

    # 1. Download PDF from GCS
    pdf_path = None
    doc = None
    
    try:
        pdf_path = download_from_gcs(gcs_path)
        doc = pymupdf.open(pdf_path)

        page_count = doc.page_count
        if page_count == 0:
            return ValidationResult(
                status="invalid", notes="PDF has no pages", page_count=0
            )

        # 2. Extract sample text
        sample_text = ""
        for page_num in range(min(3, page_count)):  # First 3 pages
            page = doc[page_num]
            sample_text += page.get_text()

        has_text = len(sample_text.strip()) > 100

        if not has_text:
            return ValidationResult(
                status="invalid",
                notes="PDF appears to be empty or contains only images",
                page_count=page_count,
                has_text=False,
            )

        # 3. LLM validation
        llm = LLMFactory.get_provider()

        prompt = f"""You are validating educational content for StudyBuddy.

Material Category: {category}
Filename: {filename}
Page Count: {page_count}

Sample Content (first 500 words):
{sample_text[:2000]}

Please validate this material:
1. Is this actually educational content related to "{category.replace('_', ' ')}"?
2. Is the content readable and properly formatted?
3. Are there any issues or concerns?

Return a JSON response with:
- is_valid: boolean
- notes: string (brief explanation)
"""

        response = await llm.generate_structured(
            messages=[LLMMessage(role="user", content=prompt)],
            use_mini=True,  # Use cheaper model for validation
        )

        is_valid = response.get("is_valid", False)
        notes = response.get("notes", "No validation notes provided")

        return ValidationResult(
            status="valid" if is_valid else "invalid",
            notes=notes,
            page_count=page_count,
            has_text=has_text,
        )

    except Exception as e:
        logger.error(f"Validation error for {material_id}: {e}")
        return ValidationResult(
            status="invalid", notes=f"Validation error: {str(e)}"
        )
    finally:
        # Clean up resources
        if doc is not None:
            try:
                doc.close()
            except Exception:
                pass
        
        # Clean up temporary file
        if pdf_path and not settings.is_development:
            import os
            try:
                if os.path.exists(pdf_path):
                    os.remove(pdf_path)
                    logger.debug(f"Cleaned up temp file: {pdf_path}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to clean up temp file {pdf_path}: {cleanup_error}")


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
