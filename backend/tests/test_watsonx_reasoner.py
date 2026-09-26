"""
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
        assert result.explanation.startswith("No remote fix was generated:")
        assert result.confidence_score == 0.0

    def test_non_json_response_returns_parse_error(self) -> None:
        reasoner = self._make_reasoner_with_bad_response("I cannot help with that.")
        result = reasoner.reason("err", [])
        assert result.explanation.startswith("No remote fix was generated:")
        assert result.llm_error is not None

    def test_missing_key_returns_parse_error(self) -> None:
        incomplete = {k: v for k, v in _VALID_LLM_RESPONSE.items() if k != "patch"}
        reasoner = self._make_reasoner_with_bad_response(json.dumps(incomplete))
        result = reasoner.reason("err", [])
        assert result.explanation.startswith("No remote fix was generated:")

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

    def test_snippet_context_in_message(self) -> None:
        ctx = _make_snippet_ctx(code="def foo():\n    return 1")
        msg = _build_user_message("err", "", [ctx])
        assert "def foo()" in msg

    def test_fix_target_instruction_in_message(self) -> None:
        msg = _build_user_message("err", [])
        assert "FAILURE node" in msg
        assert "ORIGIN node" in msg

    def test_node_role_in_message(self) -> None:
        ctx = _make_snippet_ctx(role="failure", symbol="broken_func")
        msg = _build_user_message("err", "", [ctx])
        assert "FAILURE" in msg

    def test_response_schema_instruction_present(self) -> None:
        msg = _build_user_message("err", "", [])
        assert "confidence_score" in msg
        assert "fix_description" in msg
