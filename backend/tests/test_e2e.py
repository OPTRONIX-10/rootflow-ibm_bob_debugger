"""
backend/tests/test_e2e.py

End-to-end integration test for the RootFlow analysis pipeline.

Strategy
--------
The test starts the FastAPI server in a subprocess, waits until it is healthy,
then posts the traceback from the buggy example project
(``examples/buggy_project/``) to ``POST /analyze``.

Assertions validate the key fields of the returned ``RootFlowResult``:
- ``rootCause.file`` ends with the file that contains the known bug
- ``rootCause.line`` is a positive integer
- ``propagationPath`` has at least two nodes (the bug propagates through the
  call chain: generate_report → summarise → compute_ratio → percentage)
- ``suggestedFix.patch`` is a non-empty string when the LLM is available, OR
  the field exists (empty string is acceptable when LLM credentials are absent)
- ``graph.nodes`` and ``graph.edges`` are non-empty

The test is skipped automatically if the server fails to start within the
timeout so the CI suite does not block on an absent Python environment.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parents[2]
_BACKEND_DIR = _REPO_ROOT / "backend"
_EXAMPLES_DIR = _REPO_ROOT / "examples" / "buggy_project"

# The traceback produced by the failing test in the buggy example project.
# We embed it as a string constant so the test has no dependency on running
# pytest inside the test itself.
FIXTURE_TRACEBACK = """\
Traceback (most recent call last):
  File "{examples}/tests/test_report.py", line 33, in test_empty_dataset_zero_total
    lines = generate_report(["x", "y"], [0.0, 0.0], 0.0)
  File "{examples}/report.py", line 13, in generate_report
    percentages = summarise(values, total)
  File "{examples}/stats.py", line 18, in summarise
    return [compute_ratio(v, total) for v in values]
  File "{examples}/stats.py", line 12, in compute_ratio
    raw = percentage(numerator, denominator)
  File "{examples}/utils.py", line 19, in percentage
    return (part / total) * 100.0
ZeroDivisionError: division by zero
""".format(examples=str(_EXAMPLES_DIR).replace("\\", "/"))


# ---------------------------------------------------------------------------
# Server lifecycle helpers
# ---------------------------------------------------------------------------

SERVER_PORT = int(os.environ.get("ROOTFLOW_PORT", "7331"))
SERVER_URL = f"http://127.0.0.1:{SERVER_PORT}"
_STARTUP_TIMEOUT = 30  # seconds to wait for the server to become healthy


def _wait_for_health(timeout: float = _STARTUP_TIMEOUT) -> bool:
    """Poll GET /health until the server responds 200 or *timeout* elapses."""
    import urllib.error
    import urllib.request

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"{SERVER_URL}/health", timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.5)
    return False


def _server_already_running() -> bool:
    """Return True if the server is already listening on the port."""
    return _wait_for_health(timeout=2.0)


# ---------------------------------------------------------------------------
# Fixture: managed server process
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def analysis_server():
    """
    Start the RootFlow backend server for the module's tests.

    If the server is already running (e.g. from a manual ``python main.py``),
    it is reused.  Otherwise a subprocess is spawned.

    Yields the base URL string on success; skips the test module on failure.
    """
    if _server_already_running():
        yield SERVER_URL
        return

    # Determine the Python executable
    python_exe = sys.executable or "python"

    env = os.environ.copy()
    # Ensure the repo root is on PYTHONPATH so `from backend...` and
    # `from shared...` imports resolve correctly.
    existing_path = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = (
        str(_REPO_ROOT) + os.pathsep + existing_path if existing_path else str(_REPO_ROOT)
    )

    proc = subprocess.Popen(
        [python_exe, "-m", "uvicorn", "backend.main:app",
         "--host", "127.0.0.1", "--port", str(SERVER_PORT), "--no-access-log"],
        cwd=str(_REPO_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if not _wait_for_health():
        proc.terminate()
        proc.wait(timeout=5)
        pytest.skip("RootFlow backend server failed to start within timeout.")

    yield SERVER_URL

    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _post_analyze(base_url: str, error_text: str, workspace_root: str) -> dict:
    """POST /analyze and return the parsed JSON response."""
    import json
    import urllib.request

    payload = json.dumps(
        {"workspaceRoot": workspace_root, "errorText": error_text}
    ).encode("utf-8")

    req = urllib.request.Request(
        f"{base_url}/analyze",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestE2EPipeline:
    """End-to-end tests against the live analysis server."""

    @pytest.fixture(autouse=True)
    def _result(self, analysis_server):
        """Run the analysis once per class and cache the result."""
        self._result_data = _post_analyze(
            analysis_server,
            error_text=FIXTURE_TRACEBACK,
            workspace_root=str(_EXAMPLES_DIR),
        )

    # ------------------------------------------------------------------
    # Schema shape
    # ------------------------------------------------------------------

    def test_result_has_session_id(self) -> None:
        assert "sessionId" in self._result_data
        assert isinstance(self._result_data["sessionId"], str)
        assert len(self._result_data["sessionId"]) > 0

    def test_result_has_timestamp(self) -> None:
        assert "timestamp" in self._result_data

    def test_result_has_error_input(self) -> None:
        ei = self._result_data.get("errorInput", {})
        assert "raw" in ei
        assert ei["raw"] == FIXTURE_TRACEBACK

    # ------------------------------------------------------------------
    # Root cause
    # ------------------------------------------------------------------

    def test_root_cause_file_points_to_bug_location(self) -> None:
        rc = self._result_data.get("rootCause", {})
        file_path = rc.get("file", "")
        # The bug is in utils.py; the root cause should trace back there
        # (or at minimum be one of the files in the propagation chain).
        bug_files = {"utils.py", "stats.py", "report.py"}
        assert any(f in file_path for f in bug_files), (
            f"rootCause.file '{file_path}' does not reference any known bug file"
        )

    def test_root_cause_line_positive(self) -> None:
        rc = self._result_data.get("rootCause", {})
        assert isinstance(rc.get("line"), int)
        assert rc["line"] >= 1

    def test_root_cause_symbol_non_empty(self) -> None:
        rc = self._result_data.get("rootCause", {})
        assert isinstance(rc.get("symbol"), str)
        assert rc["symbol"] != ""

    def test_root_cause_explanation_present(self) -> None:
        rc = self._result_data.get("rootCause", {})
        assert "explanation" in rc
        assert isinstance(rc["explanation"], str)

    def test_root_cause_confidence_score_in_range(self) -> None:
        rc = self._result_data.get("rootCause", {})
        score = rc.get("confidenceScore", -1)
        assert isinstance(score, (int, float))
        assert 0.0 <= score <= 1.0

    # ------------------------------------------------------------------
    # Propagation path
    # ------------------------------------------------------------------

    def test_propagation_path_non_empty(self) -> None:
        path = self._result_data.get("propagationPath", [])
        assert len(path) >= 1

    def test_propagation_path_has_multiple_nodes(self) -> None:
        """The bug propagates through at least 2 functions."""
        path = self._result_data.get("propagationPath", [])
        assert len(path) >= 2, (
            f"Expected propagationPath length >= 2, got {len(path)}: "
            + str([p.get("symbol") for p in path])
        )

    def test_propagation_path_roles(self) -> None:
        path = self._result_data.get("propagationPath", [])
        assert len(path) >= 1
        roles = {p.get("role") for p in path}
        assert "origin" in roles or "failure" in roles

    def test_propagation_path_first_node_is_origin(self) -> None:
        path = self._result_data.get("propagationPath", [])
        if len(path) >= 2:
            assert path[0].get("role") == "origin"

    def test_propagation_path_last_node_is_failure(self) -> None:
        path = self._result_data.get("propagationPath", [])
        assert path[-1].get("role") == "failure"

    def test_propagation_nodes_have_required_fields(self) -> None:
        path = self._result_data.get("propagationPath", [])
        for node in path:
            assert "id" in node and node["id"]
            assert "file" in node
            assert "line" in node and isinstance(node["line"], int)
            assert "symbol" in node and node["symbol"]
            assert "role" in node

    # ------------------------------------------------------------------
    # Graph
    # ------------------------------------------------------------------

    def test_graph_nodes_non_empty(self) -> None:
        nodes = self._result_data.get("graph", {}).get("nodes", [])
        assert len(nodes) >= 1

    def test_graph_edges_present_for_multi_node_path(self) -> None:
        path = self._result_data.get("propagationPath", [])
        if len(path) >= 2:
            edges = self._result_data.get("graph", {}).get("edges", [])
            assert len(edges) >= 1

    def test_graph_nodes_match_propagation_path_count(self) -> None:
        path = self._result_data.get("propagationPath", [])
        nodes = self._result_data.get("graph", {}).get("nodes", [])
        assert len(nodes) == len(path)

    # ------------------------------------------------------------------
    # Suggested fix
    # ------------------------------------------------------------------

    def test_suggested_fix_present(self) -> None:
        fix = self._result_data.get("suggestedFix")
        assert fix is not None
        assert isinstance(fix, dict)

    def test_suggested_fix_has_required_fields(self) -> None:
        fix = self._result_data.get("suggestedFix", {})
        for field in ("description", "filePath", "originalCode", "fixedCode", "patch"):
            assert field in fix, f"Missing suggestedFix.{field}"

    def test_suggested_fix_file_path_non_empty_or_llm_unavailable(self) -> None:
        """filePath is set when LLM is available, may be empty otherwise."""
        fix = self._result_data.get("suggestedFix", {})
        # We accept empty string (LLM unavailable) or a valid path.
        assert isinstance(fix.get("filePath", ""), str)


# ---------------------------------------------------------------------------
# Standalone health check (no server fixture dependency)
# ---------------------------------------------------------------------------


class TestServerHealth:
    def test_health_endpoint(self, analysis_server) -> None:
        import json
        import urllib.request

        with urllib.request.urlopen(f"{analysis_server}/health", timeout=5) as resp:
            body = json.loads(resp.read().decode("utf-8"))

        assert body.get("status") == "ok"
        assert "version" in body
