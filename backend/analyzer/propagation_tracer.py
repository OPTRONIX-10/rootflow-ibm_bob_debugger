"""
backend/analyzer/propagation_tracer.py

Walk the call graph *backward* from the failure symbol (BFS, max depth 10)
to produce an ordered PropagationNode list: origin → … → failure.
"""

from __future__ import annotations

import uuid
from collections import deque
from typing import Optional

from backend.analyzer.call_graph import CallGraphBuilder
from backend.analyzer.error_parser import FailureLocation

# Import the shared schema model so the pipeline returns typed objects.
import sys
import os

# Allow importing from the shared package regardless of working directory.
_repo_root = os.path.join(os.path.dirname(__file__), "..", "..", "shared")
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

from shared.schema import GraphEdge, GraphNode, PropagationNode

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_DEPTH = 10  # as specified in the plan


# ---------------------------------------------------------------------------
# Public class
# ---------------------------------------------------------------------------


class PropagationTracer:
    """
    Trace backward through the call graph from a failure symbol to discover
    the probable root-cause call chain.

    Usage::

        tracer = PropagationTracer(call_graph_builder)
        nodes, graph_nodes, graph_edges = tracer.trace(failure_location)
    """

    def __init__(self, builder: CallGraphBuilder) -> None:
        self._builder = builder

    def trace(
        self,
        failure: FailureLocation,
    ) -> tuple[list[PropagationNode], list[GraphNode], list[GraphEdge]]:
        """
        Walk the call graph backward from *failure.symbol*.

        Returns a 3-tuple:
        - ``propagation_path``: ordered list [origin, …, failure] of
          :class:`PropagationNode` objects.
        - ``graph_nodes``: all :class:`GraphNode` objects for the result JSON.
        - ``graph_edges``: all :class:`GraphEdge` objects for the result JSON.

        If the failure symbol is not found in the graph, returns a single-node
        path containing just the failure location.
        """
        failure_symbol = failure.symbol
        g = self._builder.graph

        # ------------------------------------------------------------------
        # 1. BFS backward from the failure node (traverse caller edges)
        # ------------------------------------------------------------------
        # visited: symbol → (depth, parent_symbol | None)
        visited: dict[str, tuple[int, Optional[str]]] = {}
        queue: deque[tuple[str, int]] = deque()

        start_symbol = self._best_match(failure_symbol)
        queue.append((start_symbol, 0))
        visited[start_symbol] = (0, None)

        while queue:
            current, depth = queue.popleft()
            if depth >= MAX_DEPTH:
                continue
            for caller in self._builder.get_callers(current):
                if caller not in visited:
                    visited[caller] = (depth + 1, current)
                    queue.append((caller, depth + 1))

        # ------------------------------------------------------------------
        # 2. Reconstruct the linear path: deepest-caller → failure
        # ------------------------------------------------------------------
        # The "origin" is the node with the greatest BFS depth (furthest
        # upstream in the backward traversal).
        if len(visited) == 1:
            # No callers found — failure is the only node
            path_symbols = [start_symbol]
        else:
            origin = max(visited, key=lambda s: visited[s][0])
            path_symbols = self._reconstruct_path(origin, start_symbol, visited)

        # ------------------------------------------------------------------
        # 3. Build PropagationNode list
        # ------------------------------------------------------------------
        propagation_path: list[PropagationNode] = []
        id_map: dict[str, str] = {}  # symbol → node id

        for idx, sym in enumerate(path_symbols):
            node_id = str(uuid.uuid4())
            id_map[sym] = node_id

            n = len(path_symbols)
            if n == 1:
                role = "failure"
            elif idx == 0:
                role = "origin"
            elif idx == n - 1:
                role = "failure"
            else:
                role = "propagation"

            func_def = self._builder.get_definition(sym)
            file_path = func_def.file if func_def else failure.file
            line = func_def.start_line if func_def else failure.line

            propagation_path.append(
                PropagationNode(
                    id=node_id,
                    file=file_path,
                    line=line + 1,  # convert 0-based to 1-based
                    symbol=sym,
                    role=role,
                    explanation="",  # filled by LLM stage (Sub-Task 5)
                )
            )

        # ------------------------------------------------------------------
        # 4. Build GraphNode / GraphEdge lists
        # ------------------------------------------------------------------
        graph_nodes: list[GraphNode] = [
            GraphNode(
                id=pn.id,
                label=pn.symbol.rsplit(".", 1)[-1],  # short name as label
                role=pn.role,
                file=pn.file,
                line=pn.line,
                symbol=pn.symbol,
            )
            for pn in propagation_path
        ]

        graph_edges: list[GraphEdge] = []
        for i in range(len(propagation_path) - 1):
            src = propagation_path[i]
            tgt = propagation_path[i + 1]
            graph_edges.append(
                GraphEdge(source=src.id, target=tgt.id, label="calls")
            )

        return propagation_path, graph_nodes, graph_edges

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _best_match(self, symbol: str) -> str:
        """
        Find the best matching node name in the graph for *symbol*.
        Falls back to *symbol* itself if nothing matches.
        """
        g = self._builder.graph
        if g.has_node(symbol):
            return symbol
        # Try short-name lookup
        candidates = [n for n in g.nodes if n == symbol or n.endswith(f".{symbol}")]
        return candidates[0] if candidates else symbol

    @staticmethod
    def _reconstruct_path(
        origin: str,
        failure: str,
        visited: dict[str, tuple[int, Optional[str]]],
    ) -> list[str]:
        """
        Follow the parent pointers from *origin* toward *failure* to build
        the ordered path list [origin, …, failure].
        """
        # Build child map: parent → child (the node that discovered the parent)
        child_map: dict[str, str] = {}
        for sym, (_, parent) in visited.items():
            if parent is not None:
                child_map[parent] = sym

        path = [origin]
        current = origin
        seen = {origin}
        while current != failure:
            nxt = child_map.get(current)
            if nxt is None or nxt in seen:
                # Can't continue — append failure directly
                if path[-1] != failure:
                    path.append(failure)
                break
            path.append(nxt)
            seen.add(nxt)
            current = nxt

        return path
