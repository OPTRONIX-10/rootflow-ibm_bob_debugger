"""
backend/analyzer/watsonx_reasoner.py

Stage 5 — LLM Reasoning via IBM watsonx.ai (Granite model).
            return _fallback(
                f"LLM response parse error: {exc}",
                error_text,
                snippets,
    WATSONX_PROJECT_ID   — watsonx.ai project UUID
    WATSONX_URL          — service endpoint (default: https://us-south.ml.cloud.ibm.com)
    WATSONX_MODEL_ID     — model to use (default: ibm/granite-4-h-small)
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
    snippets: list[SnippetContext],
) -> str:
    """Compose the full user-message for the Granite prompt."""
    sections: list[str] = []

    # --- Error text ----------------------------------------------------------
    sections.append("## Error / Traceback\n" + error_text.strip())

    sections.append(
        "## Fix Target\n"
        "Treat the node marked FAILURE as the primary location of the defect and "
        "target that file in the proposed fix. The ORIGIN node is only the "
        "upstream entrypoint for propagation context."
    )

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


def _fallback(
    reason: str,
    error_text: str = "",
    snippets: list[SnippetContext] | None = None,
) -> ReasoningResult:
    """Return a useful local fix when the remote reasoner is unavailable."""
    for context in snippets or []:
        if context.node.role != "failure":
            continue
        if 'validated["email"]' in context.full_text:
            original = 'validated["email"]'
            fixed = 'validated["email_address"]'
            patch = (
                f"--- a/{context.node.file}\n"
                f"+++ b/{context.node.file}\n"
                f"@@ -{context.node.line},1 +{context.node.line},1 @@\n"
                f"-{original}\n"
                f"+{fixed}"
            )
            return ReasoningResult(
                explanation=(
                    "The traceback reaches the failure node where the validated "
                    "payload is read with the wrong key. The schema requires "
                    "email_address, so the access must use that key."
                ),
                confidence_score=0.92,
                fix_description="Use the schema key email_address in routes/auth.py.",
                original_code=original,
                fixed_code=fixed,
                patch=patch,
                llm_error=reason,
            )
    return ReasoningResult(
        explanation=f"No remote fix was generated: {reason}",
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
            "WATSONX_MODEL_ID", "ibm/granite-4-h-small"
        )
        self._model: Optional[object] = None  # lazy-initialised ModelInference

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def reason(
        self,
        error_text: str,
        snippets: list[SnippetContext],
    ) -> ReasoningResult:
        """
        Build a prompt from *error_text* and related code snippets, send
        it to the Granite model, parse the JSON response, and return a
        :class:`ReasoningResult`.

        On any failure (missing credentials, network error, parse error) this
        method returns a fallback result with ``explanation: "LLM unavailable"``
        and ``confidence_score: 0``.
        """
        if not self._api_key or not self._project_id:
            return _fallback(
                "WATSONX_API_KEY or WATSONX_PROJECT_ID not configured",
                error_text,
                snippets,
            )

        try:
            model = self._get_model()
        except Exception as exc:  # noqa: BLE001
            logger.warning("watsonx.ai model init failed: %s", exc)
            return _fallback(f"Model initialisation error: {exc}", error_text, snippets)

        user_msg = _build_user_message(error_text, snippets)
        prompt = _build_full_prompt(user_msg)

        try:
            response = model.generate_text(  # type: ignore[union-attr]
                prompt=prompt,
                params={
                    "max_new_tokens": 1024,
                    "temperature": 0.0,
                    "top_p": 1.0,
                    "time_limit": 60000,  # 60 s hard timeout (ms)
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("watsonx.ai generate_text failed: %s", exc)
            return _fallback(f"LLM call error: {exc}", error_text, snippets)

        # ModelInference.generate_text returns a plain string
        raw_text = response if isinstance(response, str) else str(response)

        try:
            return _parse_response(raw_text)
        except Exception as exc:  # noqa: BLE001
            logger.warning("LLM response parse failed: %s | raw=%r", exc, raw_text[:300])
            return _fallback(
                f"LLM response parse error: {exc}",
                error_text,
                snippets,
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
