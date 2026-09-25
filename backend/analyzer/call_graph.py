"""
backend/analyzer/call_graph.py

Build a directed function-level call graph from the data produced by
ASTAnalyzer, then expose the reverse-lookup helpers the propagation tracer
needs.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable

import networkx as nx

from backend.analyzer.ast_analyzer import ASTAnalyzer, CallSite, FunctionDef


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------


@dataclass
class CallEdge:
    caller: str   # symbol name
    callee: str   # symbol name (matched or best-guess)
    file: str     # file where the call appears
    line: int     # 0-based line number of the call site


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


class CallGraphBuilder:
    """
    Build a directed call graph from an :class:`ASTAnalyzer` result.

    Nodes are symbol names (strings).
    Directed edges run ``caller → callee``.

    Usage::

        analyzer = ASTAnalyzer(workspace_root)
        analyzer.analyze()
        builder = CallGraphBuilder(analyzer)
        graph = builder.build()
        callers = builder.get_callers("some_function")
    """

    def __init__(self, analyzer: ASTAnalyzer) -> None:
        self._analyzer = analyzer
        self._graph: nx.DiGraph = nx.DiGraph()
        self._built = False

        # symbol_name → FunctionDef  (last-write wins for duplicates)
        self._def_index: dict[str, FunctionDef] = {}
        # short name (bare function name) → list of fully-qualified symbols
        self._short_to_full: dict[str, list[str]] = defaultdict(list)

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def build(self) -> nx.DiGraph:
        """
        Construct and return the call graph DiGraph.
        Idempotent — calling twice rebuilds from scratch.
        """
        self._graph = nx.DiGraph()
        self._def_index = {}
        self._short_to_full = defaultdict(list)

        self._index_definitions(self._analyzer.function_defs)
        self._add_edges(self._analyzer.call_sites)
        self._built = True
        return self._graph

    @property
    def graph(self) -> nx.DiGraph:
        """The underlying DiGraph.  Call :meth:`build` first."""
        if not self._built:
            self.build()
        return self._graph

    def get_callers(self, symbol: str) -> list[str]:
        """
        Return all symbols that call *symbol* (direct predecessors in the graph).
        Performs a best-effort name-resolution if *symbol* is a short name.
        """
        g = self.graph
        candidates = self._resolve(symbol)
        result: list[str] = []
        for name in candidates:
            if g.has_node(name):
                result.extend(g.predecessors(name))
        return list(dict.fromkeys(result))  # deduplicate preserving order

    def get_callees(self, symbol: str) -> list[str]:
        """
        Return all symbols called by *symbol* (direct successors in the graph).
        """
        g = self.graph
        candidates = self._resolve(symbol)
        result: list[str] = []
        for name in candidates:
            if g.has_node(name):
                result.extend(g.successors(name))
        return list(dict.fromkeys(result))

    def get_definition(self, symbol: str) -> FunctionDef | None:
        """Return the :class:`FunctionDef` for *symbol*, or ``None``."""
        if not self._built:
            self.build()
        # Try exact match first, then short-name resolution
        if symbol in self._def_index:
            return self._def_index[symbol]
        candidates = self._short_to_full.get(symbol, [])
        return self._def_index.get(candidates[0]) if candidates else None

    def all_symbols(self) -> list[str]:
        """Return all known symbol names (nodes in the graph)."""
        return list(self.graph.nodes)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _index_definitions(self, defs: Iterable[FunctionDef]) -> None:
        for d in defs:
            self._graph.add_node(d.symbol, file=d.file, line=d.start_line)
            self._def_index[d.symbol] = d
            # Short name = last component after the last "."
            short = d.symbol.rsplit(".", 1)[-1]
            self._short_to_full[short].append(d.symbol)

    def _add_edges(self, call_sites: Iterable[CallSite]) -> None:
        for cs in call_sites:
            caller = cs.caller
            # Resolve the callee name to a known full symbol
            resolved = self._resolve_callee(cs.callee, preferred_file=cs.file)
            if resolved is None:
                # Add an unresolved callee node so the graph stays connected
                resolved = cs.callee
                if not self._graph.has_node(resolved):
                    self._graph.add_node(resolved, file="", line=0)

            if not self._graph.has_node(caller):
                self._graph.add_node(caller, file=cs.file, line=0)

            # Avoid self-loops
            if caller != resolved:
                self._graph.add_edge(caller, resolved, file=cs.file, line=cs.line)

    def _resolve(self, symbol: str) -> list[str]:
        """
        Given a name (possibly short), return all matching full symbol names.
        """
        if symbol in self._def_index:
            return [symbol]
        return self._short_to_full.get(symbol, [symbol])

    def _resolve_callee(
        self, callee: str, preferred_file: str = ""
    ) -> str | None:
        """
        Map a callee name (possibly short/unqualified) to a known full symbol.
        Prefers a match in *preferred_file* to reduce false edges across files.
        Returns ``None`` if no match is found.
        """
        # 1. Exact match
        if callee in self._def_index:
            return callee

        # 2. Short-name match
        candidates = self._short_to_full.get(callee, [])
        if not candidates:
            return None
        if len(candidates) == 1:
            return candidates[0]

        # 3. Prefer same-file candidate
        same_file = [c for c in candidates if self._def_index[c].file == preferred_file]
        if same_file:
            return same_file[0]

        return candidates[0]
