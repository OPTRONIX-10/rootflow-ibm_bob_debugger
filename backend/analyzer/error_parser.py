"""
backend/analyzer/error_parser.py

Parse raw Python error text (tracebacks, pytest output, exception messages) to
extract the *innermost* failure location: file path, line number, and function
(symbol) name.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------


@dataclass
class FailureLocation:
    """The innermost failure site extracted from an error/traceback string."""

    file: str
    line: int
    symbol: str  # function name, or "<module>" if at module level


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# Standard Python traceback frame:
#   File "/path/to/file.py", line 42, in some_function
_TRACEBACK_FRAME_RE = re.compile(
    r'File "(?P<file>[^"]+)", line (?P<line>\d+), in (?P<symbol>\S+)'
)

# pytest short-form failure location:
#   FAILED tests/test_foo.py::TestClass::test_method
_PYTEST_FAILED_RE = re.compile(
    r"FAILED\s+(?P<file>[^\s:]+)::(?:[^:]+::)*(?P<symbol>[^\s:]+)"
)

# Simple "filename:line:col: error" style (mypy, flake8, etc.)
_FILE_LINE_COL_RE = re.compile(
    r"(?P<file>[\w/\\.\-]+\.py):(?P<line>\d+)(?::\d+)?\s*:"
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse_error(error_text: str, workspace_root: Optional[str] = None) -> FailureLocation:
    """
    Extract the most relevant failure location from *error_text*.

    Strategy (tried in order):
    1. All Python traceback frames — pick the **last** (innermost) one whose
       file is inside *workspace_root* (if provided), otherwise the last one.
    2. pytest ``FAILED`` line — yields file + symbol (line defaults to 0).
    3. Generic ``file:line:`` pattern — first match wins.
    4. Fallback: return a sentinel with empty fields so the pipeline can
       continue gracefully.

    Returns a :class:`FailureLocation`.
    """
    root = Path(workspace_root).resolve() if workspace_root else None

    # --- Strategy 1: traceback frames ---
    frames = _TRACEBACK_FRAME_RE.findall(error_text)
    # frames is list of (file, line, symbol) tuples
    if frames:
        # Prefer the innermost frame that belongs to the workspace.
        candidate = None
        for file_str, line_str, symbol in reversed(frames):
            if root is not None:
                try:
                    if not Path(file_str).resolve().is_relative_to(root):
                        continue
                except ValueError:
                    continue
            candidate = (file_str, int(line_str), symbol)
            break
        if candidate is None:
            # No workspace match — take the last frame unconditionally.
            file_str, line_str, symbol = frames[-1]
            candidate = (file_str, int(line_str), symbol)
        return FailureLocation(file=candidate[0], line=candidate[1], symbol=candidate[2])

    # --- Strategy 2: pytest FAILED line ---
    m = _PYTEST_FAILED_RE.search(error_text)
    if m:
        return FailureLocation(file=m.group("file"), line=0, symbol=m.group("symbol"))

    # --- Strategy 3: generic file:line pattern ---
    m = _FILE_LINE_COL_RE.search(error_text)
    if m:
        return FailureLocation(file=m.group("file"), line=int(m.group("line")), symbol="<module>")

    # --- Fallback ---
    return FailureLocation(file="", line=0, symbol="<unknown>")
