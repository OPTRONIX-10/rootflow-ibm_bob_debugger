# @rootflow-plan.md implement Sub-Task 5 and update the status in rootflow-plan.md

---

**Status:** active  **Date:** 2026-09-25

---

### 👤 User

@rootflow-plan.md implement Sub-Task 5 and update the status in rootflow-plan.md

---

### 🤖 Assistant

> 🔧 called: read_file

Let me start by reading the rootflow-plan.md to understand what Sub-Task 5 entails.

> 🔧 **read_file** — rootflow-plan.md

### 🤖 Assistant

> 🔧 called: list_files, read_file

Now let me explore the existing backend structure to understand what's already been built:

> 🔧 **read_file** — backend/.env.example

> 🔧 **list_files** — backend

### 🤖 Assistant

> 🔧 called: read_file, read_file



> 🔧 **read_file** — backend/main.py

> 🔧 **read_file** — backend/analyzer/ast_analyzer.py

### 🤖 Assistant

> 🔧 called: read_file, read_file



> 🔧 **read_file** — backend/analyzer/propagation_tracer.py

> 🔧 **read_file** — shared/schema.py

### 🤖 Assistant

> 🔧 called: read_file, read_file

Now let me look at the existing tests for patterns:

> 🔧 **read_file** — backend/tests/test_git_analyzer.py

> 🔧 **read_file** — backend/tests/test_call_graph.py

### 🤖 Assistant

> 🔧 called: update_todo_list

Now I have a thorough understanding of the codebase. Let me set up the todo list and implement Sub-Task 5:

> 🔧 **update_todo_list** — 
[-] Create backend/analyzer/snippet_extractor.py — SnippetExtractor class
[ ] Create backend/analyzer/watsonx_reasoner.py — WatsonxReasoner class
[ ] Update backend/.env.example and README with WATSONX env vars
[ ] Integrate LLM stage into POST /analyze in main.py
[ ] Write backend/tests/test_snippet_extractor.py
[ ] Write backend/tests/test_watsonx_reasoner.py
[ ] Update rootflow-plan.md Sub-Task 5 status to complete


### 🤖 Assistant

> 🔧 called: read_file



> 🔧 **read_file** — backend/analyzer/call_graph.py

### 🤖 Assistant

> 🔧 called: write_file

Now I have all the context I need. Let me implement all the files for Sub-Task 5:

> 🔧 **write_file** — backend/analyzer/snippet_extractor.py

### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/snippet_extractor.py — SnippetExtractor class
[-] Create backend/analyzer/watsonx_reasoner.py — WatsonxReasoner class
[ ] Update backend/.env.example and README with WATSONX env vars
[ ] Integrate LLM stage into POST /analyze in main.py
[ ] Write backend/tests/test_snippet_extractor.py
[ ] Write backend/tests/test_watsonx_reasoner.py
[ ] Update rootflow-plan.md Sub-Task 5 status to complete


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — """
backend/analyzer/watsonx_reasoner.py

Stage 5 — LLM Reasoning via IBM watsonx.ai (Granite model).

Builds a structured prompt from the propagation context (error text, Git blame
summary, and per-node code snippets), calls the Granite model, parses the JSON
response, and returns a :class:`ReasoningResult`.

Environment variables (loaded by main.py via python-dotenv):
    WATSONX_API_KEY      — IAM API key for watsonx.ai
    WATSONX_PROJECT_ID   — watsonx.ai project UUID
    WATSONX_URL          — service endpoint (default: https://us-south.ml.cloud.ibm.com)
    WATSONX_MODEL_ID     — model to use (default: ibm-granite/granite-4.0-h-small)
"""

from __future__ import annotations

import json
import logging
import os
import re
import textwrap
from dataclasses import dataclass, field
from typing import Optional

from shared.schema import PropagationNode

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class SnippetContext:
    """Pairing of a propagation node with its extracted code snippet text."""

    node: PropagationNode
    full_text: str  # from CodeSnippet.full_text; empty string if unavailable


@dataclass
class ReasoningResult:
    """Structured output from the LLM reasoning stage."""

    explanation: str
    confidence_score: float        # 0.0–1.0
    fix_description: str
    original_code: str
    fixed_code: str
    patch: str                     # unified diff
    llm_error: Optional[str] = None  # set if LLM call or parse failed


# ---------------------------------------------------------------------------
# Response schema that the model must follow (embedded in the prompt)
# ---------------------------------------------------------------------------

_RESPONSE_SCHEMA = """{
  "explanation": "<string: root-cause explanation>",
  "confidence_score": <float 0.0–1.0>,
  "fix_description": "<string: plain-English description of the fix>",
  "original_code": "<string: the exact broken lines>",
  "fixed_code": "<string: the corrected replacement lines>",
  "patch": "<string: unified diff of the fix>"
}"""

# ---------------------------------------------------------------------------
# System and user message templates
# ---------------------------------------------------------------------------

_SYSTEM_MESSAGE = textwrap.dedent("""\
    You are an expert debugging assistant.
    Analyze the following bug report and code evidence.
    Respond ONLY in valid JSON that exactly matches the schema provided.
    Do not include any text, markdown fences, or commentary outside the JSON object.
""").strip()


def _build_user_message(
    error_text: str,
    git_summary: str,
    snippets: list[SnippetContext],
) -> str:
    """Compose the full user-message for the Granite prompt."""
    sections: list[str] = []

    # --- Error text ----------------------------------------------------------
    sections.append("## Error / Traceback\n" + error_text.strip())

    # --- Git blame summary ---------------------------------------------------
    if git_summary.strip():
        sections.append("## Git Blame Summary (origin node)\n" + git_summary.strip())

    # --- Propagation path snippets -------------------------------------------
    for ctx in snippets:
        node = ctx.node
        label = (
            f"## Propagation Node [{node.role.upper()}] "
            f"{node.symbol}  ({node.file}:{node.line})"
        )
        code_block = ctx.full_text.strip() if ctx.full_text.strip() else "(source unavailable)"
        sections.append(f"{label}\n```python\n{code_block}\n```")

    # --- Response schema instruction -----------------------------------------
    sections.append(
        "## Required JSON Response Schema\n"
        "Respond with a single JSON object matching this schema exactly:\n"
        + _RESPONSE_SCHEMA
    )

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Prompt assembly for ModelInference (text-in / text-out)
# ---------------------------------------------------------------------------


def _build_full_prompt(user_message: str) -> str:
    """
    Assemble a single text prompt for the Granite model.
    Granite 3.x supports a <|system|> / <|user|> / <|assistant|> chat format.
    """
    return (
        f"<|system|>\n{_SYSTEM_MESSAGE}\n<|user|>\n{user_message}\n<|assistant|>\n"
    )


# ---------------------------------------------------------------------------
# JSON response parsing
# ---------------------------------------------------------------------------


def _parse_response(raw: str) -> ReasoningResult:
    """
    Attempt to extract a JSON object from *raw* model output.

    The model may produce markdown fences, leading text, etc.
    We try: strict JSON parse → extract first {...} block → fallback.
    """
    # 1. Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip()
    cleaned = cleaned.rstrip("`").strip()

    # 2. Extract the first JSON object via a greedy brace-match
    brace_depth = 0
    start = -1
    obj_str = ""
    for i, ch in enumerate(cleaned):
        if ch == "{":
            if brace_depth == 0:
                start = i
            brace_depth += 1
        elif ch == "}":
            brace_depth -= 1
            if brace_depth == 0 and start != -1:
                obj_str = cleaned[start:i + 1]
                break

    if not obj_str:
        raise ValueError(f"No JSON object found in model output: {raw[:200]!r}")

    data = json.loads(obj_str)

    # Validate required keys
    required = {
        "explanation", "confidence_score", "fix_description",
        "original_code", "fixed_code", "patch",
    }
    missing = required - data.keys()
    if missing:
        raise ValueError(f"LLM response missing keys: {missing}")

    # Coerce and clamp confidence_score
    try:
        score = float(data["confidence_score"])
    except (TypeError, ValueError):
        score = 0.0
    score = max(0.0, min(1.0, score))

    return ReasoningResult(
        explanation=str(data.get("explanation", "")),
        confidence_score=score,
        fix_description=str(data.get("fix_description", "")),
        original_code=str(data.get("original_code", "")),
        fixed_code=str(data.get("fixed_code", "")),
        patch=str(data.get("patch", "")),
    )


# ---------------------------------------------------------------------------
# Graceful fallback
# ---------------------------------------------------------------------------


def _fallback(reason: str) -> ReasoningResult:
    return ReasoningResult(
        explanation="LLM unavailable",
        confidence_score=0.0,
        fix_description="",
        original_code="",
        fixed_code="",
        patch="",
        llm_error=reason,
    )


# ---------------------------------------------------------------------------
# Public class
# ---------------------------------------------------------------------------


class WatsonxReasoner:
    """
    Call IBM watsonx.ai Granite model to produce root-cause explanations and
    fix suggestions.

    Parameters
    ----------
    api_key:
        IAM API key.  Defaults to ``os.environ["WATSONX_API_KEY"]``.
    project_id:
        watsonx.ai project UUID.  Defaults to ``os.environ["WATSONX_PROJECT_ID"]``.
    url:
        Service endpoint.  Defaults to ``os.environ.get("WATSONX_URL")``.
    model_id:
        Model identifier.  Defaults to ``os.environ.get("WATSONX_MODEL_ID")``.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        project_id: Optional[str] = None,
        url: Optional[str] = None,
        model_id: Optional[str] = None,
    ) -> None:
        self._api_key = api_key or os.environ.get("WATSONX_API_KEY", "")
        self._project_id = project_id or os.environ.get("WATSONX_PROJECT_ID", "")
        self._url = url or os.environ.get(
            "WATSONX_URL", "https://us-south.ml.cloud.ibm.com"
        )
        self._model_id = model_id or os.environ.get(
            "WATSONX_MODEL_ID", "ibm-granite/granite-4.0-h-small"
        )
        self._model: Optional[object] = None  # lazy-initialised ModelInference

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def reason(
        self,
        error_text: str,
        snippets: list[SnippetContext],
        git_summary: str = "",
    ) -> ReasoningResult:
        """
        Build a prompt from *error_text*, *snippets*, and *git_summary*, send
        it to the Granite model, parse the JSON response, and return a
        :class:`ReasoningResult`.

        On any failure (missing credentials, network error, parse error) this
        method returns a fallback result with ``explanation: "LLM unavailable"``
        and ``confidence_score: 0``.
        """
        if not self._api_key or not self._project_id:
            return _fallback("WATSONX_API_KEY or WATSONX_PROJECT_ID not configured")

        try:
            model = self._get_model()
        except Exception as exc:  # noqa: BLE001
            logger.warning("watsonx.ai model init failed: %s", exc)
            return _fallback(f"Model initialisation error: {exc}")

        user_msg = _build_user_message(error_text, git_summary, snippets)
        prompt = _build_full_prompt(user_msg)

        try:
            response = model.generate_text(  # type: ignore[union-attr]
                prompt=prompt,
                params={
                    "max_new_tokens": 1024,
                    "temperature": 0.0,
                    "top_p": 1.0,
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("watsonx.ai generate_text failed: %s", exc)
            return _fallback(f"LLM call error: {exc}")

        # ModelInference.generate_text returns a plain string
        raw_text = response if isinstance(response, str) else str(response)

        try:
            return _parse_response(raw_text)
        except Exception as exc:  # noqa: BLE001
            logger.warning("LLM response parse failed: %s | raw=%r", exc, raw_text[:300])
            return ReasoningResult(
                explanation="LLM parse error",
                confidence_score=0.0,
                fix_description="",
                original_code="",
                fixed_code="",
                patch="",
                llm_error=f"Parse error: {exc}",
            )

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    def _get_model(self) -> object:
        """Lazily initialise and cache the ModelInference instance."""
        if self._model is None:
            from ibm_watsonx_ai.foundation_models import ModelInference
            from ibm_watsonx_ai import Credentials

            credentials = Credentials(
                url=self._url,
                api_key=self._api_key,
            )
            self._model = ModelInference(
                model_id=self._model_id,
                credentials=credentials,
                project_id=self._project_id,
            )
        return self._model


### 🤖 Assistant

> 🔧 called: update_todo_list

Now let's update `main.py` to integrate Stage 5, write the tests, and update the README:

> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/snippet_extractor.py — SnippetExtractor class
[x] Create backend/analyzer/watsonx_reasoner.py — WatsonxReasoner class
[-] Integrate LLM stage into POST /analyze in main.py
[ ] Update backend/.env.example and README with WATSONX env vars
[ ] Write backend/tests/test_snippet_extractor.py
[ ] Write backend/tests/test_watsonx_reasoner.py
[ ] Update rootflow-plan.md Sub-Task 5 status to complete


### 🤖 Assistant

> 🔧 called: apply_diff



> 🔧 **apply_diff** — backend/main.py

### 🤖 Assistant

> 🔧 called: update_todo_list

Now write the two test files:

> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/snippet_extractor.py — SnippetExtractor class
[x] Create backend/analyzer/watsonx_reasoner.py — WatsonxReasoner class
[x] Integrate LLM stage into POST /analyze in main.py
[ ] Update backend/.env.example and README with WATSONX env vars
[-] Write backend/tests/test_snippet_extractor.py
[ ] Write backend/tests/test_watsonx_reasoner.py
[ ] Update rootflow-plan.md Sub-Task 5 status to complete


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — """
backend/tests/test_snippet_extractor.py

Unit tests for SnippetExtractor (Sub-Task 5).

All tests operate on in-memory source strings via
``SnippetExtractor.extract_from_source()`` — no disk I/O required.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure repo root is on sys.path
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.analyzer.snippet_extractor import CodeSnippet, SnippetExtractor


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SIMPLE_FUNCTION = """\
import os
import re

def greet(name: str) -> str:
    pattern = re.compile(r"[^a-zA-Z]")
    clean = pattern.sub("", name)
    path = os.path.join("/greetings", clean)
    return f"Hello, {clean}!"
"""

DECORATED_FUNCTION = """\
import functools

def decorator(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)
    return wrapper

@decorator
def process(data):
    return list(data)
"""

CLASS_METHOD_SOURCE = """\
import json

class Parser:
    def parse(self, text: str) -> dict:
        return json.loads(text)
"""

MULTIPLE_FUNCTIONS = """\
import math

def square(x):
    return x ** 2

def hypotenuse(a, b):
    return math.sqrt(square(a) + square(b))
"""

UNRELATED_IMPORT = """\
import os
import sys

def foo():
    return 42
"""

ASYNC_FUNCTION = """\
import asyncio

async def fetch(url: str) -> bytes:
    await asyncio.sleep(0)
    return b""
"""


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _extract(source: str, start_line: int, decorators: list[str] | None = None) -> CodeSnippet | None:
    extractor = SnippetExtractor()
    return extractor.extract_from_source(source, start_line=start_line, decorator_texts=decorators)


# ---------------------------------------------------------------------------
# Tests — basic extraction
# ---------------------------------------------------------------------------


class TestSnippetExtractorBasic:
    def test_returns_code_snippet(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3)
        assert isinstance(result, CodeSnippet)

    def test_signature_contains_def(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3)
        assert result is not None
        assert "def greet" in result.signature

    def test_signature_contains_parameters(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3)
        assert result is not None
        assert "name" in result.signature

    def test_signature_contains_return_annotation(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3)
        assert result is not None
        assert "str" in result.signature

    def test_body_is_non_empty(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3)
        assert result is not None
        assert result.body.strip() != ""

    def test_body_contains_function_statements(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3)
        assert result is not None
        assert "pattern" in result.body
        assert "return" in result.body

    def test_full_text_contains_signature_and_body(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3)
        assert result is not None
        assert "def greet" in result.full_text
        assert "return" in result.full_text


# ---------------------------------------------------------------------------
# Tests — import resolution
# ---------------------------------------------------------------------------


class TestSnippetExtractorImports:
    def test_used_imports_included(self) -> None:
        """Imports actually referenced in the function body are included."""
        result = _extract(SIMPLE_FUNCTION, start_line=3)
        assert result is not None
        import_texts = " ".join(result.imports)
        assert "re" in import_texts
        assert "os" in import_texts

    def test_unused_imports_excluded(self) -> None:
        """Imports not referenced in the function body are excluded."""
        result = _extract(UNRELATED_IMPORT, start_line=4)
        assert result is not None
        # 'foo' uses neither os nor sys
        import_texts = " ".join(result.imports)
        assert "os" not in import_texts
        assert "sys" not in import_texts

    def test_imports_is_list_of_strings(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3)
        assert result is not None
        assert isinstance(result.imports, list)
        for item in result.imports:
            assert isinstance(item, str)

    def test_multiple_functions_correct_imports(self) -> None:
        """hypotenuse uses math; square does not."""
        extractor = SnippetExtractor()
        # square is at line 3
        sq_snippet = extractor.extract_from_source(MULTIPLE_FUNCTIONS, start_line=3)
        # hypotenuse is at line 6
        hy_snippet = extractor.extract_from_source(MULTIPLE_FUNCTIONS, start_line=6)

        assert sq_snippet is not None
        assert hy_snippet is not None

        sq_imports = " ".join(sq_snippet.imports)
        hy_imports = " ".join(hy_snippet.imports)

        assert "math" not in sq_imports
        assert "math" in hy_imports


# ---------------------------------------------------------------------------
# Tests — decorators
# ---------------------------------------------------------------------------


class TestSnippetExtractorDecorators:
    def test_decorators_passed_through(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3, decorators=["@staticmethod"])
        assert result is not None
        assert result.decorators == ["@staticmethod"]

    def test_decorators_appear_in_full_text(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3, decorators=["@staticmethod"])
        assert result is not None
        assert "@staticmethod" in result.full_text

    def test_decorators_before_signature_in_full_text(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3, decorators=["@my_decorator"])
        assert result is not None
        dec_pos = result.full_text.find("@my_decorator")
        sig_pos = result.full_text.find("def greet")
        assert dec_pos < sig_pos

    def test_no_decorators_default(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3)
        assert result is not None
        assert result.decorators == []


# ---------------------------------------------------------------------------
# Tests — edge cases
# ---------------------------------------------------------------------------


class TestSnippetExtractorEdgeCases:
    def test_returns_none_for_wrong_line(self) -> None:
        """Line 0 in SIMPLE_FUNCTION is an import, not a function."""
        result = _extract(SIMPLE_FUNCTION, start_line=0)
        assert result is None

    def test_async_function(self) -> None:
        """async def functions are parsed correctly."""
        # async def fetch is at line 3
        result = _extract(ASYNC_FUNCTION, start_line=3)
        assert result is not None
        assert "fetch" in result.signature

    def test_class_method(self) -> None:
        """Methods inside a class are extracted by their start line."""
        # parse is at line 3 (0-based)
        result = _extract(CLASS_METHOD_SOURCE, start_line=3)
        assert result is not None
        assert "def parse" in result.signature
        assert "json" in " ".join(result.imports)

    def test_full_text_non_empty(self) -> None:
        result = _extract(SIMPLE_FUNCTION, start_line=3)
        assert result is not None
        assert result.full_text.strip() != ""


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — """
backend/tests/test_watsonx_reasoner.py

Unit tests for WatsonxReasoner (Sub-Task 5).

Strategy
--------
- All tests mock ``ModelInference`` via ``unittest.mock.patch`` so no real
  network calls or credentials are required.
- Tests cover: credential-guard fallback, successful parsing, JSON-in-fence
  handling, partial/missing key fallback, and confidence-score clamping.
"""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# Ensure repo root is on sys.path
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.analyzer.watsonx_reasoner import (
    ReasoningResult,
    SnippetContext,
    WatsonxReasoner,
    _build_user_message,
    _parse_response,
)
from shared.schema import PropagationNode


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_node(role: str = "origin", symbol: str = "foo") -> PropagationNode:
    return PropagationNode(
        id=str(uuid.uuid4()),
        file="a.py",
        line=1,
        symbol=symbol,
        role=role,  # type: ignore[arg-type]
        explanation="",
    )


def _make_snippet_ctx(role: str = "origin", symbol: str = "foo", code: str = "def foo():\n    pass") -> SnippetContext:
    return SnippetContext(node=_make_node(role=role, symbol=symbol), full_text=code)


_VALID_LLM_RESPONSE: dict[str, Any] = {
    "explanation": "The bug is in foo because x is None.",
    "confidence_score": 0.87,
    "fix_description": "Add a None check before using x.",
    "original_code": "return x.value",
    "fixed_code": "return x.value if x is not None else 0",
    "patch": "--- a/foo.py\n+++ b/foo.py\n@@ -1 +1 @@\n-return x.value\n+return x.value if x is not None else 0",
}


def _mock_model(response: str) -> MagicMock:
    """Return a mock ModelInference whose generate_text() returns *response*."""
    mock = MagicMock()
    mock.generate_text.return_value = response
    return mock


# ---------------------------------------------------------------------------
# Tests — credential guard
# ---------------------------------------------------------------------------


class TestWatsonxReasonerCredentialGuard:
    def test_missing_api_key_returns_fallback(self) -> None:
        reasoner = WatsonxReasoner(api_key="", project_id="proj-123")
        result = reasoner.reason("some error", [])
        assert result.explanation == "LLM unavailable"
        assert result.confidence_score == 0.0
        assert result.llm_error is not None

    def test_missing_project_id_returns_fallback(self) -> None:
        reasoner = WatsonxReasoner(api_key="my-key", project_id="")
        result = reasoner.reason("some error", [])
        assert result.explanation == "LLM unavailable"
        assert result.confidence_score == 0.0
        assert result.llm_error is not None

    def test_both_missing_returns_fallback(self) -> None:
        reasoner = WatsonxReasoner(api_key="", project_id="")
        result = reasoner.reason("some error", [])
        assert result.explanation == "LLM unavailable"


# ---------------------------------------------------------------------------
# Tests — model initialisation failure
# ---------------------------------------------------------------------------


class TestWatsonxReasonerModelInitFailure:
    def test_import_error_returns_fallback(self) -> None:
        """If ibm_watsonx_ai is not installed, reason() returns fallback."""
        reasoner = WatsonxReasoner(api_key="key", project_id="proj")
        with patch.object(reasoner, "_get_model", side_effect=ImportError("no module")):
            result = reasoner.reason("error text", [])
        assert result.explanation == "LLM unavailable"
        assert result.llm_error is not None

    def test_runtime_error_returns_fallback(self) -> None:
        reasoner = WatsonxReasoner(api_key="key", project_id="proj")
        with patch.object(reasoner, "_get_model", side_effect=RuntimeError("connection refused")):
            result = reasoner.reason("error text", [])
        assert result.explanation == "LLM unavailable"


# ---------------------------------------------------------------------------
# Tests — successful reasoning
# ---------------------------------------------------------------------------


class TestWatsonxReasonerSuccess:
    def _make_reasoner_with_mock(self, response_dict: dict) -> tuple[WatsonxReasoner, MagicMock]:
        reasoner = WatsonxReasoner(api_key="test-key", project_id="test-proj")
        mock_model = _mock_model(json.dumps(response_dict))
        reasoner._model = mock_model
        return reasoner, mock_model

    def test_explanation_populated(self) -> None:
        reasoner, _ = self._make_reasoner_with_mock(_VALID_LLM_RESPONSE)
        result = reasoner.reason("TypeError: x is None", [_make_snippet_ctx()])
        assert result.explanation == _VALID_LLM_RESPONSE["explanation"]

    def test_confidence_score_populated(self) -> None:
        reasoner, _ = self._make_reasoner_with_mock(_VALID_LLM_RESPONSE)
        result = reasoner.reason("err", [_make_snippet_ctx()])
        assert result.confidence_score == pytest.approx(0.87)

    def test_fix_description_populated(self) -> None:
        reasoner, _ = self._make_reasoner_with_mock(_VALID_LLM_RESPONSE)
        result = reasoner.reason("err", [_make_snippet_ctx()])
        assert result.fix_description == _VALID_LLM_RESPONSE["fix_description"]

    def test_original_code_populated(self) -> None:
        reasoner, _ = self._make_reasoner_with_mock(_VALID_LLM_RESPONSE)
        result = reasoner.reason("err", [_make_snippet_ctx()])
        assert result.original_code == _VALID_LLM_RESPONSE["original_code"]

    def test_fixed_code_populated(self) -> None:
        reasoner, _ = self._make_reasoner_with_mock(_VALID_LLM_RESPONSE)
        result = reasoner.reason("err", [_make_snippet_ctx()])
        assert result.fixed_code == _VALID_LLM_RESPONSE["fixed_code"]

    def test_patch_populated(self) -> None:
        reasoner, _ = self._make_reasoner_with_mock(_VALID_LLM_RESPONSE)
        result = reasoner.reason("err", [_make_snippet_ctx()])
        assert result.patch == _VALID_LLM_RESPONSE["patch"]

    def test_llm_error_is_none_on_success(self) -> None:
        reasoner, _ = self._make_reasoner_with_mock(_VALID_LLM_RESPONSE)
        result = reasoner.reason("err", [_make_snippet_ctx()])
        assert result.llm_error is None

    def test_model_generate_text_called_once(self) -> None:
        reasoner, mock_model = self._make_reasoner_with_mock(_VALID_LLM_RESPONSE)
        reasoner.reason("err", [_make_snippet_ctx()])
        mock_model.generate_text.assert_called_once()


# ---------------------------------------------------------------------------
# Tests — JSON-in-markdown-fence handling
# ---------------------------------------------------------------------------


class TestWatsonxReasonerFenceHandling:
    def test_json_wrapped_in_backtick_fence(self) -> None:
        fenced = "```json\n" + json.dumps(_VALID_LLM_RESPONSE) + "\n```"
        result = _parse_response(fenced)
        assert result.explanation == _VALID_LLM_RESPONSE["explanation"]

    def test_json_wrapped_in_plain_fence(self) -> None:
        fenced = "```\n" + json.dumps(_VALID_LLM_RESPONSE) + "\n```"
        result = _parse_response(fenced)
        assert result.confidence_score == pytest.approx(0.87)

    def test_json_with_leading_text(self) -> None:
        prefixed = "Sure, here is the analysis:\n" + json.dumps(_VALID_LLM_RESPONSE)
        result = _parse_response(prefixed)
        assert result.fix_description == _VALID_LLM_RESPONSE["fix_description"]


# ---------------------------------------------------------------------------
# Tests — parse failure fallback
# ---------------------------------------------------------------------------


class TestWatsonxReasonerParseFallback:
    def _make_reasoner_with_bad_response(self, response: str) -> WatsonxReasoner:
        reasoner = WatsonxReasoner(api_key="key", project_id="proj")
        reasoner._model = _mock_model(response)
        return reasoner

    def test_empty_response_returns_parse_error(self) -> None:
        reasoner = self._make_reasoner_with_bad_response("")
        result = reasoner.reason("err", [])
        assert result.explanation == "LLM parse error"
        assert result.confidence_score == 0.0

    def test_non_json_response_returns_parse_error(self) -> None:
        reasoner = self._make_reasoner_with_bad_response("I cannot help with that.")
        result = reasoner.reason("err", [])
        assert result.explanation == "LLM parse error"
        assert result.llm_error is not None

    def test_missing_key_returns_parse_error(self) -> None:
        incomplete = {k: v for k, v in _VALID_LLM_RESPONSE.items() if k != "patch"}
        reasoner = self._make_reasoner_with_bad_response(json.dumps(incomplete))
        result = reasoner.reason("err", [])
        assert result.explanation == "LLM parse error"

    def test_generate_text_exception_returns_fallback(self) -> None:
        reasoner = WatsonxReasoner(api_key="key", project_id="proj")
        mock_model = MagicMock()
        mock_model.generate_text.side_effect = ConnectionError("timeout")
        reasoner._model = mock_model
        result = reasoner.reason("err", [])
        assert result.explanation == "LLM unavailable"


# ---------------------------------------------------------------------------
# Tests — confidence score clamping
# ---------------------------------------------------------------------------


class TestConfidenceScoreClamping:
    def test_score_above_one_clamped(self) -> None:
        data = dict(_VALID_LLM_RESPONSE, confidence_score=1.5)
        result = _parse_response(json.dumps(data))
        assert result.confidence_score == 1.0

    def test_score_below_zero_clamped(self) -> None:
        data = dict(_VALID_LLM_RESPONSE, confidence_score=-0.3)
        result = _parse_response(json.dumps(data))
        assert result.confidence_score == 0.0

    def test_score_zero_point_five(self) -> None:
        data = dict(_VALID_LLM_RESPONSE, confidence_score=0.5)
        result = _parse_response(json.dumps(data))
        assert result.confidence_score == pytest.approx(0.5)

    def test_non_numeric_score_defaults_to_zero(self) -> None:
        data = dict(_VALID_LLM_RESPONSE, confidence_score="high")
        result = _parse_response(json.dumps(data))
        assert result.confidence_score == 0.0


# ---------------------------------------------------------------------------
# Tests — prompt construction
# ---------------------------------------------------------------------------


class TestBuildUserMessage:
    def test_error_text_in_message(self) -> None:
        msg = _build_user_message("TypeError: NoneType", "", [])
        assert "TypeError: NoneType" in msg

    def test_git_summary_in_message(self) -> None:
        msg = _build_user_message("err", "Commit abc123 by Alice", [])
        assert "abc123" in msg

    def test_snippet_context_in_message(self) -> None:
        ctx = _make_snippet_ctx(code="def foo():\n    return 1")
        msg = _build_user_message("err", "", [ctx])
        assert "def foo()" in msg

    def test_no_git_summary_skips_section(self) -> None:
        msg = _build_user_message("err", "", [])
        assert "Git Blame" not in msg

    def test_node_role_in_message(self) -> None:
        ctx = _make_snippet_ctx(role="failure", symbol="broken_func")
        msg = _build_user_message("err", "", [ctx])
        assert "FAILURE" in msg

    def test_response_schema_instruction_present(self) -> None:
        msg = _build_user_message("err", "", [])
        assert "confidence_score" in msg
        assert "fix_description" in msg


### 🤖 Assistant

> 🔧 called: update_todo_list

Now update the `.env.example` and backend README:

> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/snippet_extractor.py — SnippetExtractor class
[x] Create backend/analyzer/watsonx_reasoner.py — WatsonxReasoner class
[x] Integrate LLM stage into POST /analyze in main.py
[x] Write backend/tests/test_snippet_extractor.py
[x] Write backend/tests/test_watsonx_reasoner.py
[-] Update backend/.env.example and README with WATSONX env vars
[ ] Update rootflow-plan.md Sub-Task 5 status to complete


### 🤖 Assistant

> 🔧 called: read_file



> 🔧 **read_file** — backend/README.md

### 🤖 Assistant

> 🔧 called: apply_diff



> 🔧 **apply_diff** — backend/README.md

### 🤖 Assistant

> 🔧 called: execute_command

Now let's run the tests to validate everything:

> 🔧 **execute_command** — python -m pytest backend/tests/test_snippet_extractor.py backend/tests/test_watsonx_reasoner.py -v 2>&1

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -m pytest backend/tests/test_snippet_extractor.py backend/tests/test_watsonx_reasoner.py -v 2>&1

### 🤖 Assistant

> 🔧 called: execute_command

3 failures — let me diagnose them. The issues are:
1. `UNRELATED_IMPORT` — `def foo` is at line 4 (0-based), but looking at the source: line 0=`import os`, 1=`import sys`, 2=blank, 3=blank, 4=`def foo():`. Let me check the actual line numbers.
2. `MULTIPLE_FUNCTIONS` — `def square` starts at line 2 (0-based), not 3.
3. `ASYNC_FUNCTION` — `async def fetch` uses `async_function_definition` node type, not `function_definition`.

Let me fix the `SnippetExtractor` to handle `async_function_definition`, and fix the test line numbers:

> 🔧 **execute_command** — py -c "
src = '''import os
import sys

def foo():
    return 42
'''
lines = src.split('\n')
for i, l in enumerate(lines):
    print(i, repr(l))
"

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -c "
src = '''import math

def square(x):
    return x ** 2

def hypotenuse(a, b):
    return math.sqrt(square(a) + square(b))
'''
lines = src.split('\n')
for i, l in enumerate(lines):
    print(i, repr(l))
"

### 🤖 Assistant

> 🔧 called: apply_diff

So `foo` is at line 3 (correct), `square` at line 2, `hypotenuse` at line 5. And the `async def` needs the extractor to handle `async_function_definition`. Let me fix both:

> 🔧 **apply_diff** — backend/analyzer/snippet_extractor.py

### 🤖 Assistant

> 🔧 called: apply_diff

Now fix the three failing test line numbers:

> 🔧 **apply_diff** — <<<<<<< SEARCH
:start_line:155
-------
    def test_unused_imports_excluded(self) -> None:
        """Imports not referenced in the function body are excluded."""
        result = _extract(UNRELATED_IMPORT, start_line=4)
=======
    def test_unused_imports_excluded(self) -> None:
        """Imports not referenced in the function body are excluded."""
        result = _extract(UNRELATED_IMPORT, start_line=3)
>>>>>>> REPLACE

<<<<<<< SEARCH
:start_line:171
-------
        extractor = SnippetExtractor()
        # square is at line 3
        sq_snippet = extractor.extract_from_source(MULTIPLE_FUNCTIONS, start_line=3)
        # hypotenuse is at line 6
        hy_snippet = extractor.extract_from_source(MULTIPLE_FUNCTIONS, start_line=6)
=======
        extractor = SnippetExtractor()
        # square is at line 2 (0-based)
        sq_snippet = extractor.extract_from_source(MULTIPLE_FUNCTIONS, start_line=2)
        # hypotenuse is at line 5 (0-based)
        hy_snippet = extractor.extract_from_source(MULTIPLE_FUNCTIONS, start_line=5)
>>>>>>> REPLACE

<<<<<<< SEARCH
:start_line:228
-------
    def test_async_function(self) -> None:
        """async def functions are parsed correctly."""
        # async def fetch is at line 3
        result = _extract(ASYNC_FUNCTION, start_line=3)
=======
    def test_async_function(self) -> None:
        """async def functions are parsed correctly."""
        # async def fetch is at line 2 (0-based)
        result = _extract(ASYNC_FUNCTION, start_line=2)
>>>>>>> REPLACE


### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -m pytest backend/tests/test_snippet_extractor.py backend/tests/test_watsonx_reasoner.py -v 2>&1

### 🤖 Assistant

> 🔧 called: execute_command

All 49 tests pass. Let's also make sure the existing tests are still green:

> 🔧 **execute_command** — py -m pytest backend/tests/ -v 2>&1

### 🤖 Assistant

> 🔧 called: apply_diff

87/87 passing. Now update the plan:

> 🔧 **apply_diff** — <<<<<<< SEARCH
:start_line:221
-------
### Sub-Task 5 — Python Backend: LLM Reasoning Stage (watsonx.ai Granite)

**Status:** `[ ] pending`
=======
### Sub-Task 5 — Python Backend: LLM Reasoning Stage (watsonx.ai Granite)

**Status:** `[x] complete`
>>>>>>> REPLACE


### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/snippet_extractor.py — SnippetExtractor class
[x] Create backend/analyzer/watsonx_reasoner.py — WatsonxReasoner class
[x] Integrate LLM stage into POST /analyze in main.py
[x] Update backend/.env.example and README with WATSONX env vars
[x] Write backend/tests/test_snippet_extractor.py
[x] Write backend/tests/test_watsonx_reasoner.py
[x] Update rootflow-plan.md Sub-Task 5 status to complete


### 🤖 Assistant

Sub-Task 5 is fully implemented. Here's a summary of everything delivered:

---

## Sub-Task 5 — Completed

### New files

**[`backend/analyzer/snippet_extractor.py`](backend/analyzer/snippet_extractor.py)**
- `SnippetExtractor` class extracts [`CodeSnippet`](backend/analyzer/snippet_extractor.py) objects from tree-sitter ASTs (no second disk read — reuses already-parsed data from Stage 3)
- Enforces the snippet rule: resolves only the imports actually referenced by each function's body (via identifier scanning), captures decorator texts, full signature, and full body
- Handles `function_definition` and `async_function_definition` nodes
- Supports both file-based (`extract_from_file`) and in-memory (`extract_from_source`) usage; file results are cached

**[`backend/analyzer/watsonx_reasoner.py`](backend/analyzer/watsonx_reasoner.py)**
- `WatsonxReasoner` lazily initialises `ModelInference` from `ibm_watsonx_ai`
- Builds a structured prompt: system message + error text + Git blame summary + one labelled code block per propagation node + embedded JSON response schema
- Uses Granite's `<|system|>/<|user|>/<|assistant|>` chat format; `temperature=0` for deterministic output
- `_parse_response` strips markdown fences, extracts the first `{…}` object, validates all 6 required keys, and clamps `confidence_score` to `[0, 1]`
- Graceful fallbacks: missing credentials → `"LLM unavailable"`; network/init error → `"LLM unavailable"`; parse failure → `"LLM parse error"` — all with `confidenceScore: 0`

**[`backend/tests/test_snippet_extractor.py`](backend/tests/test_snippet_extractor.py)** — 19 tests across basic extraction, import resolution, decorators, and edge cases

**[`backend/tests/test_watsonx_reasoner.py`](backend/tests/test_watsonx_reasoner.py)** — 30 tests covering credential guard, mocked model success, JSON-in-fence handling, parse fallbacks, confidence clamping, and prompt construction

### Modified files

**[`backend/main.py`](backend/main.py)** — Stage 5 wired into `POST /analyze`:
- `SnippetExtractor` runs over every propagation node after Stage 4
- `WatsonxReasoner.reason()` receives the assembled context
- `rootCause.explanation`, `confidenceScore`, and the full `suggestedFix` block now come from the LLM result

**[`backend/README.md`](backend/README.md)** — expanded env-var table with `Required`/`Default` columns, graceful-degradation note, and pipeline-stages table

**`rootflow-plan.md`** — Sub-Task 5 status updated to `[x] complete`

**Test suite: 87/87 passed ✅**