"""One dispatch path: Cloud Tasks when enabled, otherwise a direct post to AI_SERVICE_URL."""
import httpx
import pytest

from app.config import settings
from app.services import cloud_tasks

HEADER = "x-ai-internal-token"
PAYLOAD = {"jobId": "j1", "jobType": "chunk_material", "data": {"materialId": "m1"}}


class FakeHttp:
    """Replaces httpx.AsyncClient; `answers` are returned (or raised) one per call."""

    def __init__(self, answers):
        self.answers = list(answers)
        self.calls = []

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append((url, json, headers))
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return httpx.Response(answer, text="body")


@pytest.fixture(autouse=True)
def settings_for_dispatch(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "AI_SERVICE_URL", "https://ai.example.test")
    monkeypatch.setattr(settings, "AI_INTERNAL_TOKEN", "s3cret")
    monkeypatch.setattr(settings, "ENABLE_CLOUD_TASKS", False)

    async def no_sleep(_):
        return None

    monkeypatch.setattr(cloud_tasks.asyncio, "sleep", no_sleep)


@pytest.fixture
def undelivered(monkeypatch):
    marked = []

    async def mark(job_id, message):
        marked.append((job_id, message))

    monkeypatch.setattr(cloud_tasks, "mark_undelivered", mark)
    return marked


async def dispatch(monkeypatch, answers):
    http = FakeHttp(answers)
    monkeypatch.setattr(cloud_tasks.httpx, "AsyncClient", http)
    name = await cloud_tasks.enqueue_task("/jobs/chunk-material", PAYLOAD)
    await cloud_tasks.wait_for_background_tasks()
    return name, http


class TestDirectDispatch:
    async def test_production_posts_to_the_configured_url_with_the_token(self, monkeypatch, undelivered):
        name, http = await dispatch(monkeypatch, [200])

        assert name == "direct-task-j1"
        (url, body, headers), = http.calls
        assert url == "https://ai.example.test/jobs/chunk-material"
        assert body == PAYLOAD
        assert headers[HEADER] == "s3cret"

    async def test_returns_before_the_job_finishes(self, monkeypatch, undelivered):
        http = FakeHttp([200])
        monkeypatch.setattr(cloud_tasks.httpx, "AsyncClient", http)

        await cloud_tasks.enqueue_task("/jobs/chunk-material", PAYLOAD)
        assert http.calls == []  # the post happens in a background task

        await cloud_tasks.wait_for_background_tasks()
        assert len(http.calls) == 1

    async def test_server_errors_and_network_errors_are_retried(self, monkeypatch, undelivered):
        _, http = await dispatch(monkeypatch, [503, httpx.ConnectError("refused"), 200])

        assert len(http.calls) == 3
        assert undelivered == []

    async def test_permanent_answers_are_not_retried(self, monkeypatch, undelivered):
        _, http = await dispatch(monkeypatch, [400])

        assert len(http.calls) == 1
        assert undelivered == []

    async def test_a_service_that_never_answers_marks_the_job_failed(self, monkeypatch, undelivered):
        _, http = await dispatch(monkeypatch, [500, 502, httpx.ReadTimeout("slow")])

        assert len(http.calls) == cloud_tasks.DIRECT_MAX_ATTEMPTS
        assert [job_id for job_id, _ in undelivered] == ["j1"]


class TestCloudTasks:
    @pytest.fixture
    def tasks_client(self, monkeypatch):
        created = []

        class Client:
            def queue_path(self, project, location, queue):
                return f"projects/{project}/locations/{location}/queues/{queue}"

            def create_task(self, request):
                created.append(request)
                return type("Task", (), {"name": request["parent"] + "/tasks/1"})()

        monkeypatch.setattr(settings, "ENABLE_CLOUD_TASKS", True)
        monkeypatch.setattr(settings, "GCS_PROJECT_ID", "proj")
        monkeypatch.setattr(settings, "CLOUD_TASKS_LOCATION", "europe-west1")
        monkeypatch.setattr(settings, "CLOUD_TASKS_QUEUE", "jobs")
        monkeypatch.setattr(cloud_tasks, "_client", Client())
        return created

    async def test_creates_a_task_aimed_at_the_configured_url(self, tasks_client, monkeypatch):
        http = FakeHttp([])
        monkeypatch.setattr(cloud_tasks.httpx, "AsyncClient", http)

        name = await cloud_tasks.enqueue_task("/jobs/chunk-material", PAYLOAD)

        assert name == "projects/proj/locations/europe-west1/queues/jobs/tasks/1"
        (request,) = tasks_client
        assert request["parent"] == "projects/proj/locations/europe-west1/queues/jobs"
        assert request["task"]["http_request"]["url"] == "https://ai.example.test/jobs/chunk-material"
        assert request["task"]["http_request"]["headers"][HEADER] == "s3cret"
        assert http.calls == []

    async def test_a_failure_to_create_the_task_is_raised_not_hidden(self, tasks_client, monkeypatch):
        def broken(request):
            raise RuntimeError("quota")

        monkeypatch.setattr(cloud_tasks._client, "create_task", broken)

        with pytest.raises(cloud_tasks.TaskDispatchError):
            await cloud_tasks.enqueue_task("/jobs/chunk-material", PAYLOAD)

    async def test_missing_project_is_a_clear_error(self, tasks_client, monkeypatch):
        monkeypatch.setattr(settings, "GCS_PROJECT_ID", "")

        with pytest.raises(cloud_tasks.TaskDispatchError, match="project"):
            await cloud_tasks.enqueue_task("/jobs/chunk-material", PAYLOAD)
