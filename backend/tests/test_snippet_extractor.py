"""
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
        result = _extract(UNRELATED_IMPORT, start_line=3)
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
        # square is at line 2 (0-based)
        sq_snippet = extractor.extract_from_source(MULTIPLE_FUNCTIONS, start_line=2)
        # hypotenuse is at line 5 (0-based)
        hy_snippet = extractor.extract_from_source(MULTIPLE_FUNCTIONS, start_line=5)

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
        # async def fetch is at line 2 (0-based)
        result = _extract(ASYNC_FUNCTION, start_line=2)
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
