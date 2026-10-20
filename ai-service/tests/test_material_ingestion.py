"""Reading uploads, validating them, and the validate/chunk job handlers.

Storage and database calls are replaced with fakes; the real database path is covered by the
end-to-end run described in the pull request.
"""
import os
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.routes import jobs
from app.config import settings
from app.models.jobs import JobPayload
from app.services.document_processor import storage
from app.services.document_processor.storage import StorageError, local_copy
from app.services.document_processor.validator import validate_material
from app.services.llm import LLMFactory
from app.services.llm.schemas import MaterialCheck
from tests.document_fixtures import PdfBuilder, sentences


@pytest.fixture(autouse=True)
def production_without_gcs(monkeypatch, tmp_path):
    """Production settings, no bucket, uploads under tmp_path (the case that used to break)."""
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ENABLE_PROCESSING", True)
    monkeypatch.setattr(settings, "GCS_BUCKET", "")
    monkeypatch.setattr(settings, "GCS_BUCKET_NAME", "")
    monkeypatch.setattr(settings, "LOCAL_UPLOADS_DIR", str(uploads))
    monkeypatch.setattr(settings, "AUTO_EXTRACT_TOPICS_ON_CHUNK", False)
    return uploads


@pytest.fixture(autouse=True)
def accepting_llm(monkeypatch):
    class Provider:
        async def generate_structured(self, *args, **kwargs):
            return MaterialCheck(is_valid=True, notes="Looks like lecture notes.")

    monkeypatch.setattr(LLMFactory, "get_provider", classmethod(lambda cls: Provider()))


def put_upload(uploads: Path, name: str, builder: PdfBuilder) -> str:
    """Save a PDF where the frontend would, and return the gs:// path it records."""
    target = uploads / "user" / "project" / name
    target.parent.mkdir(parents=True, exist_ok=True)
    builder.save(target)
    return f"gs://studybuddy-materials/user/project/{name}"


def text_pdf(pages: int = 3) -> PdfBuilder:
    pdf = PdfBuilder()
    for index in range(pages):
        if index:
            pdf.new_page()
        pdf.heading(f"Section {index + 1} Overview", 16)
        for sentence in sentences(4, f"Page{index + 1}"):
            pdf.paragraph(sentence)
    return pdf


class TestStorage:
    async def test_gs_path_is_read_from_the_local_uploads_folder(self, production_without_gcs):
        gcs_path = put_upload(production_without_gcs, "a.pdf", text_pdf(1))

        async with local_copy(gcs_path) as path:
            assert Path(path).is_file()
            assert Path(path) == (production_without_gcs / "user/project/a.pdf").resolve()
        # A local upload is read in place and must survive the context manager.
        assert Path(path).is_file()

    async def test_plain_local_path_is_read_in_place(self, tmp_path):
        target = tmp_path / "plain.pdf"
        text_pdf(1).save(target)

        async with local_copy(str(target)) as path:
            assert path == str(target)

    async def test_missing_file_without_gcs_is_a_storage_error(self):
        with pytest.raises(StorageError, match="GCS is not configured"):
            async with local_copy("gs://bucket/user/project/missing.pdf"):
                pass

    async def test_path_cannot_leave_the_uploads_folder(self, tmp_path, production_without_gcs):
        (tmp_path / "secret.pdf").write_bytes(b"x")

        with pytest.raises(StorageError):
            async with local_copy("gs://bucket/../secret.pdf"):
                pass

    async def test_malformed_gcs_path_is_a_storage_error(self):
        with pytest.raises(StorageError, match="Invalid GCS path"):
            async with local_copy("gs://only-a-bucket"):
                pass

    async def test_downloaded_copy_is_removed_afterwards(self, monkeypatch, tmp_path):
        monkeypatch.setattr(settings, "GCS_BUCKET", "bucket")
        temp_dirs = []

        def fake_download(bucket_name, blob_path):
            import tempfile

            temp_dir = tempfile.mkdtemp(prefix="studybuddy-")
            temp_dirs.append(temp_dir)
            path = os.path.join(temp_dir, "material.pdf")
            text_pdf(1).save(Path(path))
            return path, temp_dir

        monkeypatch.setattr(storage, "_download_from_gcs", fake_download)

        async with local_copy("gs://bucket/user/project/remote.pdf") as path:
            assert Path(path).is_file()
            assert "studybuddy_remote.pdf" not in path
        assert temp_dirs and not os.path.exists(temp_dirs[0])

    async def test_downloaded_copy_is_removed_when_the_body_fails(self, monkeypatch):
        monkeypatch.setattr(settings, "GCS_BUCKET", "bucket")
        import tempfile

        temp_dir = tempfile.mkdtemp(prefix="studybuddy-")
        monkeypatch.setattr(storage, "_download_from_gcs", lambda b, p: (temp_dir + "/f", temp_dir))

        with pytest.raises(RuntimeError):
            async with local_copy("gs://bucket/a/b.pdf"):
                raise RuntimeError("parse blew up")
        assert not os.path.exists(temp_dir)


class TestValidation:
    async def test_local_pdf_validates_in_production(self, production_without_gcs):
        gcs_path = put_upload(production_without_gcs, "ok.pdf", text_pdf())

        result = await validate_material("m1", gcs_path, "ok.pdf", "lecture_notes")

        assert result.status == "valid"
        assert result.page_count == 3
        assert "Looks like lecture notes." in result.notes

    async def test_storage_failure_raises_instead_of_marking_invalid(self):
        with pytest.raises(StorageError):
            await validate_material(
                "m1", "gs://bucket/user/project/gone.pdf", "gone.pdf", "lecture_notes"
            )

    async def test_corrupt_file_is_invalid(self, production_without_gcs):
        target = production_without_gcs / "user" / "project" / "bad.pdf"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"not a pdf")

        result = await validate_material(
            "m1", "gs://b/user/project/bad.pdf", "bad.pdf", "lecture_notes"
        )

        assert result.status == "invalid"
        assert "could not be read" in result.notes

    async def test_unsupported_type_is_invalid_without_touching_storage(self):
        result = await validate_material("m1", "gs://b/missing.txt", "notes.txt", "lecture_notes")

        assert result.status == "invalid"
        assert "Unsupported file type" in result.notes

    async def test_scanned_pdf_is_rejected(self, production_without_gcs):
        pdf = PdfBuilder().image_page()
        for _ in range(3):
            pdf.new_page().image_page()
        gcs_path = put_upload(production_without_gcs, "scan.pdf", pdf)

        result = await validate_material("m1", gcs_path, "scan.pdf", "lecture_notes")

        assert result.status == "invalid"
        assert "scanned" in result.notes
        assert "OCR is not supported yet" in result.notes

    async def test_some_empty_pages_are_mentioned_in_the_notes(self, production_without_gcs):
        pdf = text_pdf(3)
        pdf.new_page().image_page()
        gcs_path = put_upload(production_without_gcs, "mixed.pdf", pdf)

        result = await validate_material("m1", gcs_path, "mixed.pdf", "lecture_notes")

        assert result.status == "valid"
        assert "1 of 4 pages have no extractable text" in result.notes
        assert ": 4." in result.notes


class FakeDatabase:
    """Records what the job handlers write instead of talking to Postgres."""

    def __init__(self, material):
        self.material = material
        self.updates = []
        self.transactions = []

    async def execute_one(self, query, *args):
        if "FROM materials" in query and "gcs_path" in query:
            return self.material
        return None

    async def execute_update(self, query, *args):
        self.updates.append((" ".join(query.split()), args))

    async def execute_in_transaction(self, operations):
        conn = FakeConnection()
        self.transactions.append(conn)
        return await operations(conn)

    def updates_matching(self, fragment):
        return [(sql, args) for sql, args in self.updates if fragment in sql]


class FakeConnection:
    def __init__(self):
        self.calls = []

    async def execute(self, query, *args):
        self.calls.append(("execute", " ".join(query.split()), args))

    async def executemany(self, query, records):
        self.calls.append(("executemany", " ".join(query.split()), list(records)))


@pytest.fixture
def fake_db(monkeypatch):
    def install(material):
        database = FakeDatabase(material)
        monkeypatch.setattr(jobs, "execute_one", database.execute_one)
        monkeypatch.setattr(jobs, "execute_update", database.execute_update)
        monkeypatch.setattr(jobs, "execute_in_transaction", database.execute_in_transaction)
        return database

    return install


def payload(job_type: str) -> JobPayload:
    return JobPayload(jobId="job1", jobType=job_type, data={"materialId": "m1"})


class TestValidateJob:
    async def test_storage_error_fails_the_job_as_retryable_and_leaves_the_material(self, fake_db):
        database = fake_db(
            {"id": "m1", "gcs_path": "gs://b/u/p/gone.pdf", "filename": "gone.pdf", "category": "x"}
        )

        with pytest.raises(HTTPException) as raised:
            await jobs.validate_material_job(payload("validate_material"))

        assert raised.value.status_code == 500
        assert not database.updates_matching("UPDATE materials")
        (sql, args), = database.updates_matching("status = 'failed'")
        assert args[2] == "STORAGE_UNAVAILABLE"
        assert args[3] is True  # retryable

    async def test_corrupt_file_marks_the_material_invalid(self, fake_db, production_without_gcs):
        target = production_without_gcs / "u" / "p" / "bad.pdf"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"junk")
        database = fake_db(
            {"id": "m1", "gcs_path": "gs://b/u/p/bad.pdf", "filename": "bad.pdf", "category": "x"}
        )

        await jobs.validate_material_job(payload("validate_material"))

        (sql, args), = database.updates_matching("UPDATE materials")
        assert args[0] == "invalid"


class TestChunkJob:
    @pytest.fixture
    def material(self, production_without_gcs):
        gcs_path = put_upload(production_without_gcs, "doc.pdf", text_pdf(3))
        return {"id": "m1", "gcs_path": gcs_path, "filename": "doc.pdf", "project_id": "p1"}

    @staticmethod
    def fake_embeddings(monkeypatch):
        async def embed(texts):
            return [[0.5] * 384 for _ in texts]

        monkeypatch.setattr(jobs, "generate_embeddings", embed)

    async def test_chunks_replace_the_old_ones_in_one_transaction_with_a_bulk_insert(
        self, fake_db, material, monkeypatch
    ):
        database = fake_db(material)
        self.fake_embeddings(monkeypatch)

        await jobs.chunk_material_job(payload("chunk_material"))

        (connection,) = database.transactions
        kinds = [(kind, sql.split()[0]) for kind, sql, _ in connection.calls]
        assert kinds == [("execute", "DELETE"), ("executemany", "INSERT")]
        _, _, records = connection.calls[1]
        assert len(records) >= 3
        # (material_id, text, vector, hierarchy, page_start, page_end, chunk_index, tokens)
        assert [record[6] for record in records] == list(range(len(records)))
        assert all(record[0] == "m1" and record[2].startswith("[0.5,") for record in records)
        assert records[0][4] == 1
        assert database.updates_matching("status = 'completed'")

    async def test_embedding_failure_fails_the_job_and_stores_nothing(
        self, fake_db, material, monkeypatch
    ):
        database = fake_db(material)

        async def broken(texts):
            raise RuntimeError("embedding model failed to load")

        monkeypatch.setattr(jobs, "generate_embeddings", broken)

        with pytest.raises(HTTPException) as raised:
            await jobs.chunk_material_job(payload("chunk_material"))

        assert raised.value.status_code == 500
        assert database.transactions == []
        assert not database.updates_matching("status = 'completed'")
        (sql, args), = database.updates_matching("status = 'failed'")
        assert args[3] is True  # retryable

    async def test_wrong_number_of_vectors_fails_the_job(self, fake_db, material, monkeypatch):
        database = fake_db(material)

        async def short(texts):
            return [[0.1] * 384]

        monkeypatch.setattr(jobs, "generate_embeddings", short)

        with pytest.raises(HTTPException):
            await jobs.chunk_material_job(payload("chunk_material"))
        assert database.transactions == []

    async def test_file_without_text_is_a_permanent_failure_and_marks_the_material_invalid(
        self, fake_db, production_without_gcs, monkeypatch
    ):
        gcs_path = put_upload(production_without_gcs, "blank.pdf", PdfBuilder().image_page())
        database = fake_db(
            {"id": "m1", "gcs_path": gcs_path, "filename": "blank.pdf", "project_id": "p1"}
        )
        self.fake_embeddings(monkeypatch)

        with pytest.raises(HTTPException) as raised:
            await jobs.chunk_material_job(payload("chunk_material"))

        assert raised.value.status_code == 400
        assert database.transactions == []
        (sql, args), = database.updates_matching("UPDATE materials")
        assert "invalid" in sql
        (sql, args), = database.updates_matching("status = 'failed'")
        assert args[2] == "NO_CONTENT"
        assert args[3] is False  # not retryable

    async def test_storage_error_fails_the_job_as_retryable(self, fake_db, monkeypatch):
        database = fake_db(
            {"id": "m1", "gcs_path": "gs://b/u/p/gone.pdf", "filename": "gone.pdf", "project_id": "p1"}
        )
        self.fake_embeddings(monkeypatch)

        with pytest.raises(HTTPException) as raised:
            await jobs.chunk_material_job(payload("chunk_material"))

        assert raised.value.status_code == 500
        assert not database.updates_matching("UPDATE materials")
        (sql, args), = database.updates_matching("status = 'failed'")
        assert args[3] is True
