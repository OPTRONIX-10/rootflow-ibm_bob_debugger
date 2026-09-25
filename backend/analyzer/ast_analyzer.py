"""
backend/analyzer/ast_analyzer.py

Parse Python source files with tree-sitter and extract:
- Function definitions: (file, start_line, symbol_name, end_line)
- Call sites: (caller_symbol, callee_name, file, line)

Uses tree-sitter 0.21+ API (Language + Parser).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

from tree_sitter import Language, Node, Parser
import tree_sitter_python as tspython

# ---------------------------------------------------------------------------
# Language singleton
# ---------------------------------------------------------------------------

_PY_LANGUAGE = Language(tspython.language())


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class FunctionDef:
    """A discovered function definition."""

    file: str
    start_line: int  # 0-based row from tree-sitter
    end_line: int
    symbol: str  # fully-qualified name (outer.inner for nested)
    decorators: list[str] = field(default_factory=list)


@dataclass
class CallSite:
    """A function call discovered inside a function body."""

    file: str
    line: int          # 0-based row
    caller: str        # symbol name of the enclosing function
    callee: str        # name of the called function/method


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _make_parser() -> Parser:
    return Parser(_PY_LANGUAGE)


def _get_identifier(node: Node, source: bytes) -> str:
    """Return the UTF-8 text of *node* clipped to 256 chars."""
    return source[node.start_byte:node.end_byte].decode("utf-8", errors="replace")[:256]


def _collect_functions(
    node: Node,
    source: bytes,
    file_path: str,
    parent_name: str = "",
) -> list[FunctionDef]:
    """Recursively collect all function_definition nodes."""
    results: list[FunctionDef] = []

    for child in node.children:
        if child.type in ("function_definition", "decorated_definition"):
            func_node = child
            decorators: list[str] = []

            if child.type == "decorated_definition":
                # The last child is the actual function_definition
                for sub in child.children:
                    if sub.type == "decorator":
                        decorators.append(_get_identifier(sub, source))
                    elif sub.type == "function_definition":
                        func_node = sub

            # Extract name from the function_definition node
            name_node = func_node.child_by_field_name("name")
            if name_node is None:
                continue
            raw_name = _get_identifier(name_node, source)
            full_name = f"{parent_name}.{raw_name}" if parent_name else raw_name

            results.append(
                FunctionDef(
                    file=file_path,
                    start_line=func_node.start_point[0],
                    end_line=func_node.end_point[0],
                    symbol=full_name,
                    decorators=decorators,
                )
            )

            # Recurse into body for nested functions / methods
            body = func_node.child_by_field_name("body")
            if body:
                results.extend(
                    _collect_functions(body, source, file_path, parent_name=full_name)
                )

        elif child.type == "class_definition":
            # Recurse into class bodies so methods get a "ClassName.method" name
            name_node = child.child_by_field_name("name")
            class_name = _get_identifier(name_node, source) if name_node else "UnknownClass"
            full_class = f"{parent_name}.{class_name}" if parent_name else class_name
            body = child.child_by_field_name("body")
            if body:
                results.extend(
                    _collect_functions(body, source, file_path, parent_name=full_class)
                )
        else:
            # Generic descend (e.g. if-blocks at module level)
            results.extend(
                _collect_functions(child, source, file_path, parent_name=parent_name)
            )

    return results


def _collect_calls(
    node: Node,
    source: bytes,
    file_path: str,
    caller: str,
) -> list[CallSite]:
    """
    Walk *node* collecting call_expression nodes.
    *caller* is the enclosing function symbol name.
    """
    results: list[CallSite] = []

    for child in node.children:
        if child.type == "call":
            func_part = child.child_by_field_name("function")
            if func_part is not None:
                callee = _get_identifier(func_part, source)
                # Normalize attribute access: "obj.method" → "method"
                if "." in callee:
                    callee = callee.rsplit(".", 1)[-1]
                results.append(
                    CallSite(
                        file=file_path,
                        line=child.start_point[0],
                        caller=caller,
                        callee=callee,
                    )
                )
            # Also descend into the call's arguments
            args = child.child_by_field_name("arguments")
            if args:
                results.extend(_collect_calls(args, source, file_path, caller))
        else:
            results.extend(_collect_calls(child, source, file_path, caller))

    return results


def _iter_python_files(root: str) -> Iterator[Path]:
    """Yield all .py files under *root*, skipping common non-project dirs."""
    skip = {
        "node_modules", "site-packages", "__pycache__", ".git",
        ".venv", "venv", ".tox", "build", "dist", ".eggs",
    }
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skip dirs in-place
        dirnames[:] = [d for d in dirnames if d not in skip]
        for fname in filenames:
            if fname.endswith(".py"):
                yield Path(dirpath) / fname


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


class ASTAnalyzer:
    """
    Parse every Python file in *workspace_root* and extract function
    definitions and call sites.

    Call :meth:`analyze` once; then access:
    - :attr:`function_defs` — list of :class:`FunctionDef`
    - :attr:`call_sites` — list of :class:`CallSite`
    """

    def __init__(self, workspace_root: str) -> None:
        self.workspace_root = workspace_root
        self._parser = _make_parser()
        self.function_defs: list[FunctionDef] = []
        self.call_sites: list[CallSite] = []

    def analyze(self) -> None:
        """Walk the workspace and populate :attr:`function_defs` and :attr:`call_sites`."""
        self.function_defs = []
        self.call_sites = []

        for py_file in _iter_python_files(self.workspace_root):
            self._analyze_file(str(py_file))

    def analyze_source(self, source: str, file_path: str = "<string>") -> None:
        """
        Analyze a single source string instead of scanning the workspace.
        Useful for tests.  Results are *appended* to the existing lists.
        """
        self._analyze_source_bytes(source.encode("utf-8"), file_path)

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    def _analyze_file(self, file_path: str) -> None:
        try:
            source = Path(file_path).read_bytes()
        except OSError:
            return
        self._analyze_source_bytes(source, file_path)

    def _analyze_source_bytes(self, source: bytes, file_path: str) -> None:
        tree = self._parser.parse(source)
        root = tree.root_node

        # 1. Collect function definitions
        defs = _collect_functions(root, source, file_path)
        self.function_defs.extend(defs)

        # 2. Build a lookup: line → symbol so we can assign callers
        #    (functions are sorted so we can binary-search, but a simple
        #     range scan is fine for typical file sizes)
        def _symbol_at_line(line: int) -> str:
            """Return the innermost function that contains *line*."""
            candidates = [
                d for d in defs if d.start_line <= line <= d.end_line
            ]
            if not candidates:
                return "<module>"
            # Pick the one with the latest start_line (innermost)
            return max(candidates, key=lambda d: d.start_line).symbol

        # 3. Collect call sites inside each function body
        for func_def in defs:
            # Find the actual function_definition node for this symbol
            # by re-parsing: simpler to just walk root and match by line.
            self._collect_calls_for_func(root, source, file_path, func_def)

    def _collect_calls_for_func(
        self,
        root: Node,
        source: bytes,
        file_path: str,
        func_def: FunctionDef,
    ) -> None:
        """Find the function node for *func_def* and collect its calls."""
        target_line = func_def.start_line
        func_node = self._find_func_node(root, target_line)
        if func_node is None:
            return
        body = func_node.child_by_field_name("body")
        if body is None:
            return
        calls = _collect_calls(body, source, file_path, func_def.symbol)
        self.call_sites.extend(calls)

    def _find_func_node(self, node: Node, start_line: int) -> Node | None:
        """Return the function_definition node whose start row == *start_line*."""
        if node.type == "function_definition" and node.start_point[0] == start_line:
            return node
        for child in node.children:
            result = self._find_func_node(child, start_line)
            if result is not None:
                return result
        return None
