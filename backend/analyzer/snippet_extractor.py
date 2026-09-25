"""
backend/analyzer/snippet_extractor.py

Extract function-level code snippets from already-parsed tree-sitter ASTs.

For every propagation node the LLM prompt must include:
  1. All import statements directly referenced by the function body.
  2. Any decorators applied to the function.
  3. The complete function signature (name, parameters, return annotation).
  4. The full function body, untruncated.

No file is read from disk — we reuse the ASTAnalyzer result and raw source
bytes that were already parsed in Stage 3.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from tree_sitter import Language, Node, Parser
import tree_sitter_python as tspython

_PY_LANGUAGE = Language(tspython.language())


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------


@dataclass
class CodeSnippet:
    """A self-contained function snippet ready for LLM consumption."""

    imports: list[str]       # import lines directly referenced by this function
    decorators: list[str]    # decorator lines (e.g. "@staticmethod")
    signature: str           # "def foo(x: int) -> bool:"
    body: str                # indented body text
    full_text: str           # decorators + signature + body as one block


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _parse_source(source: bytes) -> Node:
    parser = Parser(_PY_LANGUAGE)
    return parser.parse(source).root_node


def _node_text(node: Node, source: bytes) -> str:
    return source[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _collect_top_level_imports(root: Node, source: bytes) -> list[tuple[str, str]]:
    """
    Return list of (names_string, import_line_text) for every top-level
    import statement in *root*.

    *names_string* is a comma-joined string of all names introduced by the
    import so we can quickly check whether a function body uses them.
    """
    imports: list[tuple[str, str]] = []
    for child in root.children:
        if child.type in ("import_statement", "import_from_statement"):
            text = _node_text(child, source)
            # Collect all name nodes to build the names_string
            names: list[str] = []
            for n in child.children:
                if n.type in ("dotted_name", "aliased_import"):
                    # aliased_import: "x as y" → expose "y"
                    alias = n.child_by_field_name("alias")
                    if alias:
                        names.append(_node_text(alias, source))
                    else:
                        names.append(_node_text(n, source).split(".")[-1])
                elif n.type == "wildcard_import":
                    names.append("*")
            imports.append((",".join(names), text))
    return imports


def _collect_identifiers(node: Node, source: bytes) -> set[str]:
    """Recursively collect all identifier text values under *node*."""
    ids: set[str] = set()
    if node.type == "identifier":
        ids.add(_node_text(node, source))
    for child in node.children:
        ids |= _collect_identifiers(child, source)
    return ids


_FUNC_NODE_TYPES = frozenset({"function_definition", "async_function_definition"})


def _find_func_node_at_line(root: Node, start_line: int) -> Optional[Node]:
    """
    Return the *function_definition* (or *async_function_definition*) node
    whose start row matches *start_line* (0-based).  Searches the entire tree.
    """
    if root.type in _FUNC_NODE_TYPES and root.start_point[0] == start_line:
        return root
    for child in root.children:
        result = _find_func_node_at_line(child, start_line)
        if result is not None:
            return result
    return None


# ---------------------------------------------------------------------------
# Public class
# ---------------------------------------------------------------------------


class SnippetExtractor:
    """
    Extract :class:`CodeSnippet` objects from Python source files.

    Usage — from an already-loaded source string::

        extractor = SnippetExtractor()
        snippet = extractor.extract_from_source(source_str, start_line, decorators)

    Usage — from a file on disk (loads once, then cached)::

        extractor = SnippetExtractor()
        snippet = extractor.extract_from_file(file_path, start_line, decorators)
    """

    def __init__(self) -> None:
        # Cache parsed roots to avoid re-reading files
        self._cache: dict[str, tuple[bytes, Node]] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract_from_file(
        self,
        file_path: str,
        start_line: int,             # 0-based, as stored in FunctionDef
        decorator_texts: Optional[list[str]] = None,
    ) -> Optional[CodeSnippet]:
        """
        Load *file_path* (cached), find the function at *start_line*, and
        return a :class:`CodeSnippet`.  Returns ``None`` if the file cannot
        be read or no function is found at *start_line*.
        """
        if file_path not in self._cache:
            try:
                source = Path(file_path).read_bytes()
            except OSError:
                return None
            root = _parse_source(source)
            self._cache[file_path] = (source, root)
        source, root = self._cache[file_path]
        return self._extract(source, root, start_line, decorator_texts or [])

    def extract_from_source(
        self,
        source: str,
        start_line: int,
        decorator_texts: Optional[list[str]] = None,
        file_path: str = "<string>",
    ) -> Optional[CodeSnippet]:
        """
        Parse *source* directly (no disk I/O).  Useful for tests and when
        the caller already has the source string in memory.
        """
        source_bytes = source.encode("utf-8")
        root = _parse_source(source_bytes)
        return self._extract(source_bytes, root, start_line, decorator_texts or [])

    # ------------------------------------------------------------------
    # Private implementation
    # ------------------------------------------------------------------

    def _extract(
        self,
        source: bytes,
        root: Node,
        start_line: int,
        decorator_texts: list[str],
    ) -> Optional[CodeSnippet]:
        func_node = _find_func_node_at_line(root, start_line)
        if func_node is None:
            return None

        # --- Signature -------------------------------------------------------
        # "signature" = everything up to (and including) the colon that ends
        # the function header, i.e. before the body block.
        body_node = func_node.child_by_field_name("body")
        if body_node:
            sig_bytes = source[func_node.start_byte:body_node.start_byte]
        else:
            sig_bytes = source[func_node.start_byte:func_node.end_byte]
        signature = sig_bytes.decode("utf-8", errors="replace").rstrip()

        # --- Body ------------------------------------------------------------
        body_text = ""
        if body_node:
            body_text = _node_text(body_node, source)

        # --- Relevant imports ------------------------------------------------
        all_imports = _collect_top_level_imports(root, source)
        identifiers = _collect_identifiers(func_node, source)
        relevant_imports: list[str] = []
        for names_str, import_line in all_imports:
            if names_str == "*":
                relevant_imports.append(import_line)
                continue
            for name in names_str.split(","):
                name = name.strip()
                if name and name in identifiers:
                    relevant_imports.append(import_line)
                    break

        # --- Full text -------------------------------------------------------
        parts: list[str] = []
        if decorator_texts:
            parts.extend(decorator_texts)
        parts.append(signature)
        if body_text:
            parts.append(body_text)
        full_text = "\n".join(parts)

        return CodeSnippet(
            imports=relevant_imports,
            decorators=decorator_texts,
            signature=signature,
            body=body_text,
            full_text=full_text,
        )
