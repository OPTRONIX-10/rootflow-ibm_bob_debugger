# @rootflow-plan.md   implement Sub-Task 3 and update the status in rootflow-plan.md

---

**Status:** active  **Date:** 2026-09-25

---

### 👤 User

@rootflow-plan.md   implement Sub-Task 3 and update the status in rootflow-plan.md

---

### 🤖 Assistant

> 🔧 called: read_file

Let me start by reading the plan file to understand what Sub-Task 3 entails.

> 🔧 **read_file** — rootflow-plan.md

### 🤖 Assistant

> 🔧 called: list_files

Now let me examine the existing project structure to understand what's already been built.

> 🔧 **list_files** — .

### 🤖 Assistant

> 🔧 called: read_file, read_file



> 🔧 **read_file** — backend/main.py

> 🔧 **read_file** — shared/schema.py

### 🤖 Assistant

> 🔧 called: read_file, read_file

Now let me check what's in the analyzer directory and tests directory:

> 🔧 **read_file** — backend/pyproject.toml

> 🔧 **read_file** — backend/analyzer/__init__.py

### 🤖 Assistant

> 🔧 called: update_todo_list

Now I have a full picture. Let me set up the todo list and start implementing Sub-Task 3.

> 🔧 **update_todo_list** — 
[-] Create backend/analyzer/error_parser.py — parse raw error/traceback text to extract initial failure (file, line, symbol)
[ ] Create backend/analyzer/ast_analyzer.py — parse files with tree-sitter, extract function defs and call sites
[ ] Create backend/analyzer/call_graph.py — CallGraphBuilder builds a networkx.DiGraph; expose get_callers/get_callees
[ ] Create backend/analyzer/propagation_tracer.py — PropagationTracer.trace(failure_symbol) -> List[PropagationNode] using backward BFS
[ ] Wire into POST /analyze in main.py — parse error → build call graph → trace → populate graph.nodes and graph.edges
[ ] Write backend/tests/test_call_graph.py with a two-file fixture
[ ] Update Sub-Task 3 status in rootflow-plan.md


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — backend/analyzer/error_parser.py

### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/error_parser.py — parse raw error/traceback text to extract initial failure (file, line, symbol)
[-] Create backend/analyzer/ast_analyzer.py — parse files with tree-sitter, extract function defs and call sites
[ ] Create backend/analyzer/call_graph.py — CallGraphBuilder builds a networkx.DiGraph; expose get_callers/get_callees
[ ] Create backend/analyzer/propagation_tracer.py — PropagationTracer.trace(failure_symbol) -> List[PropagationNode] using backward BFS
[ ] Wire into POST /analyze in main.py — parse error → build call graph → trace → populate graph.nodes and graph.edges
[ ] Write backend/tests/test_call_graph.py with a two-file fixture
[ ] Update Sub-Task 3 status in rootflow-plan.md


### 🤖 Assistant

> 🔧 called: execute_command

Now let me check what version of tree-sitter is installed to use the correct API:

> 🔧 **execute_command** — pip show tree-sitter tree-sitter-python 2>&1

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — python -m pip show tree-sitter tree-sitter-python 2>&1

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — python3 -m pip show tree-sitter tree-sitter-python 2>&1

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — Get-Command py -ErrorAction SilentlyContinue; py --version 2>&1

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -m pip show tree-sitter tree-sitter-python networkx 2>&1

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -m pip install tree-sitter tree-sitter-python networkx 2>&1

### 🤖 Assistant

> 🔧 called: execute_command

Installed. Now let me check the tree-sitter 0.26 API to make sure I use the right one:

> 🔧 **execute_command** — py -c "import tree_sitter; print(tree_sitter.__version__); import tree_sitter_python; lang = tree_sitter_python.language(); print(type(lang))" 2>&1

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -c "
from tree_sitter import Language, Parser
import tree_sitter_python as tspython

PY_LANGUAGE = Language(tspython.language())
parser = Parser(PY_LANGUAGE)
code = b'def foo():\n    pass\n'
tree = parser.parse(code)
root = tree.root_node
print(root.type)
for child in root.children:
    print(' ', child.type, child.start_point)
" 2>&1

### 🤖 Assistant

> 🔧 called: write_file

The tree-sitter 0.26 API uses `Language(tspython.language())` and `Parser(language)`. Now let me write the AST analyzer:

> 🔧 **write_file** — backend/analyzer/ast_analyzer.py

### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/error_parser.py — parse raw error/traceback text to extract initial failure (file, line, symbol)
[x] Create backend/analyzer/ast_analyzer.py — parse files with tree-sitter, extract function defs and call sites
[-] Create backend/analyzer/call_graph.py — CallGraphBuilder builds a networkx.DiGraph; expose get_callers/get_callees
[ ] Create backend/analyzer/propagation_tracer.py — PropagationTracer.trace(failure_symbol) -> List[PropagationNode] using backward BFS
[ ] Wire into POST /analyze in main.py — parse error → build call graph → trace → populate graph.nodes and graph.edges
[ ] Write backend/tests/test_call_graph.py with a two-file fixture
[ ] Update Sub-Task 3 status in rootflow-plan.md


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — """
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


### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/error_parser.py — parse raw error/traceback text to extract initial failure (file, line, symbol)
[x] Create backend/analyzer/ast_analyzer.py — parse files with tree-sitter, extract function defs and call sites
[x] Create backend/analyzer/call_graph.py — CallGraphBuilder builds a networkx.DiGraph; expose get_callers/get_callees
[-] Create backend/analyzer/propagation_tracer.py — PropagationTracer.trace(failure_symbol) -> List[PropagationNode] using backward BFS
[ ] Wire into POST /analyze in main.py — parse error → build call graph → trace → populate graph.nodes and graph.edges
[ ] Write backend/tests/test_call_graph.py with a two-file fixture
[ ] Update Sub-Task 3 status in rootflow-plan.md


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — """
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

            if idx == 0:
                role = "origin"
            elif idx == len(path_symbols) - 1:
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


### 🤖 Assistant

> 🔧 called: update_todo_list

Now wire everything into `main.py`:

> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/error_parser.py — parse raw error/traceback text to extract initial failure (file, line, symbol)
[x] Create backend/analyzer/ast_analyzer.py — parse files with tree-sitter, extract function defs and call sites
[x] Create backend/analyzer/call_graph.py — CallGraphBuilder builds a networkx.DiGraph; expose get_callers/get_callees
[x] Create backend/analyzer/propagation_tracer.py — PropagationTracer.trace(failure_symbol) -> List[PropagationNode] using backward BFS
[-] Wire into POST /analyze in main.py — parse error → build call graph → trace → populate graph.nodes and graph.edges
[ ] Write backend/tests/test_call_graph.py with a two-file fixture
[ ] Update Sub-Task 3 status in rootflow-plan.md


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — """RootFlow backend — FastAPI analysis server.

Runs on localhost:7331.  Full pipeline stages are wired in Sub-Tasks 3–5.
Stage 3 (AST / call-graph analysis) is now active.
Stages 4 (Git blame) and 5 (LLM reasoning) are stubbed and will be filled
by Sub-Tasks 4 and 5 respectively.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Analysis pipeline — Stage 3
from backend.analyzer.ast_analyzer import ASTAnalyzer
from backend.analyzer.call_graph import CallGraphBuilder
from backend.analyzer.error_parser import parse_error
from backend.analyzer.propagation_tracer import PropagationTracer

# Load environment variables from .env (WATSONX_API_KEY, etc.)
load_dotenv()

app = FastAPI(title="RootFlow Analysis Server", version="0.1.0")

# Allow the VS Code Webview origin (vscode-webview://) and localhost dev servers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response models (mirrors shared/schema.py)
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    workspaceRoot: str
    errorText: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict[str, str]:
    """Simple liveness probe used by the extension's ServerManager."""
    return {"status": "ok", "version": "0.1.0"}


@app.post("/analyze")
async def analyze(request: AnalyzeRequest) -> dict:  # type: ignore[return]
    """
    Full pipeline: error parsing → AST/call-graph → Git blame → LLM reasoning.

    Stage 3 (AST/call-graph) is active.
    Stages 4 and 5 are stubbed pending Sub-Tasks 4 and 5.
    """
    if not request.errorText.strip():
        raise HTTPException(status_code=422, detail="errorText must not be empty.")

    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    # Stage 3 — Parse error → build call graph → trace propagation path
    # ------------------------------------------------------------------
    failure = parse_error(request.errorText, workspace_root=request.workspaceRoot)

    try:
        analyzer = ASTAnalyzer(request.workspaceRoot)
        analyzer.analyze()

        builder = CallGraphBuilder(analyzer)
        builder.build()

        tracer = PropagationTracer(builder)
        propagation_path, graph_nodes, graph_edges = tracer.trace(failure)
    except Exception as exc:  # noqa: BLE001
        # Surface the error in the result rather than returning 500, so the
        # extension / Webview can display a meaningful message.
        return {
            "sessionId": session_id,
            "timestamp": now,
            "errorInput": {
                "raw": request.errorText,
                "file": failure.file or None,
                "line": failure.line or None,
            },
            "rootCause": {
                "file": failure.file,
                "line": failure.line,
                "symbol": failure.symbol,
                "explanation": f"AST analysis error: {exc}",
                "confidenceScore": 0.0,
                "introducedByCommit": None,
            },
            "propagationPath": [],
            "relatedNodes": [],
            "suggestedFix": {
                "description": "",
                "filePath": "",
                "originalCode": "",
                "fixedCode": "",
                "patch": "",
            },
            "graph": {"nodes": [], "edges": []},
        }

    # Derive rootCause from the origin node of the propagation path
    origin = propagation_path[0] if propagation_path else None
    root_cause_file = origin.file if origin else failure.file
    root_cause_line = origin.line if origin else failure.line
    root_cause_symbol = origin.symbol if origin else failure.symbol

    return {
        "sessionId": session_id,
        "timestamp": now,
        "errorInput": {
            "raw": request.errorText,
            "file": failure.file or None,
            "line": failure.line or None,
        },
        "rootCause": {
            "file": root_cause_file,
            "line": root_cause_line,
            "symbol": root_cause_symbol,
            # Explanation and confidence filled by LLM stage (Sub-Task 5).
            "explanation": "LLM reasoning not yet implemented (Sub-Task 5).",
            "confidenceScore": 0.0,
            # Git blame filled by Sub-Task 4.
            "introducedByCommit": None,
        },
        "propagationPath": [
            {
                "id": pn.id,
                "file": pn.file,
                "line": pn.line,
                "symbol": pn.symbol,
                "role": pn.role,
                "explanation": pn.explanation,
            }
            for pn in propagation_path
        ],
        "relatedNodes": [],
        "suggestedFix": {
            "description": "",
            "filePath": "",
            "originalCode": "",
            "fixedCode": "",
            "patch": "",
        },
        "graph": {
            "nodes": [
                {
                    "id": gn.id,
                    "label": gn.label,
                    "role": gn.role,
                    "file": gn.file,
                    "line": gn.line,
                    "symbol": gn.symbol,
                }
                for gn in graph_nodes
            ],
            "edges": [
                {
                    "source": ge.source,
                    "target": ge.target,
                    "label": ge.label,
                }
                for ge in graph_edges
            ],
        },
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("ROOTFLOW_PORT", "7331"))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=False)


### 🤖 Assistant

> 🔧 called: update_todo_list

Now write the test file:

> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/error_parser.py — parse raw error/traceback text to extract initial failure (file, line, symbol)
[x] Create backend/analyzer/ast_analyzer.py — parse files with tree-sitter, extract function defs and call sites
[x] Create backend/analyzer/call_graph.py — CallGraphBuilder builds a networkx.DiGraph; expose get_callers/get_callees
[x] Create backend/analyzer/propagation_tracer.py — PropagationTracer.trace(failure_symbol) -> List[PropagationNode] using backward BFS
[x] Wire into POST /analyze in main.py — parse error → build call graph → trace → populate graph.nodes and graph.edges
[-] Write backend/tests/test_call_graph.py with a two-file fixture
[ ] Update Sub-Task 3 status in rootflow-plan.md


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — """
backend/tests/test_call_graph.py

Unit tests for ASTAnalyzer, CallGraphBuilder, PropagationTracer, and
error_parser using synthetic two-file fixtures (no real workspace scanning).
"""

from __future__ import annotations

import pytest

from backend.analyzer.ast_analyzer import ASTAnalyzer
from backend.analyzer.call_graph import CallGraphBuilder
from backend.analyzer.error_parser import FailureLocation, parse_error
from backend.analyzer.propagation_tracer import PropagationTracer


# ---------------------------------------------------------------------------
# Synthetic fixture sources
# ---------------------------------------------------------------------------

# File A: defines `helper` and `process` which calls `helper`
FILE_A_SOURCE = """\
def helper(x):
    return x * 2


def process(items):
    result = []
    for item in items:
        result.append(helper(item))
    return result
"""

# File B: defines `validate` and `run` which calls `process` and `validate`
FILE_B_SOURCE = """\
def validate(data):
    if not data:
        raise ValueError("empty")
    return True


def run(data):
    if validate(data):
        return process(data)
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_analyzer(sources: dict[str, str]) -> ASTAnalyzer:
    """Build an ASTAnalyzer pre-loaded with synthetic sources (no disk I/O)."""
    analyzer = ASTAnalyzer(workspace_root="/fake/root")
    for path, src in sources.items():
        analyzer.analyze_source(src, file_path=path)
    return analyzer


# ---------------------------------------------------------------------------
# ASTAnalyzer tests
# ---------------------------------------------------------------------------


class TestASTAnalyzer:
    def test_extracts_function_definitions(self) -> None:
        analyzer = _make_analyzer({"a.py": FILE_A_SOURCE})
        symbols = {d.symbol for d in analyzer.function_defs}
        assert "helper" in symbols
        assert "process" in symbols

    def test_extracts_call_sites(self) -> None:
        analyzer = _make_analyzer({"a.py": FILE_A_SOURCE})
        # process() calls helper()
        callee_names = {cs.callee for cs in analyzer.call_sites}
        assert "helper" in callee_names

    def test_caller_assigned_correctly(self) -> None:
        analyzer = _make_analyzer({"a.py": FILE_A_SOURCE})
        calls_from_process = [
            cs for cs in analyzer.call_sites if cs.caller == "process"
        ]
        assert any(cs.callee == "helper" for cs in calls_from_process)

    def test_two_file_fixture(self) -> None:
        analyzer = _make_analyzer({"a.py": FILE_A_SOURCE, "b.py": FILE_B_SOURCE})
        symbols = {d.symbol for d in analyzer.function_defs}
        assert symbols == {"helper", "process", "validate", "run"}

    def test_line_numbers(self) -> None:
        analyzer = _make_analyzer({"a.py": FILE_A_SOURCE})
        helper_def = next(d for d in analyzer.function_defs if d.symbol == "helper")
        # tree-sitter returns 0-based rows; helper is at line 0
        assert helper_def.start_line == 0

    def test_nested_class_method(self) -> None:
        src = "class Foo:\n    def bar(self):\n        pass\n"
        analyzer = _make_analyzer({"c.py": src})
        symbols = {d.symbol for d in analyzer.function_defs}
        assert "Foo.bar" in symbols


# ---------------------------------------------------------------------------
# CallGraphBuilder tests
# ---------------------------------------------------------------------------


class TestCallGraphBuilder:
    def test_nodes_present(self) -> None:
        analyzer = _make_analyzer({"a.py": FILE_A_SOURCE, "b.py": FILE_B_SOURCE})
        builder = CallGraphBuilder(analyzer)
        builder.build()
        nodes = set(builder.all_symbols())
        assert "helper" in nodes
        assert "process" in nodes
        assert "validate" in nodes
        assert "run" in nodes

    def test_get_callers(self) -> None:
        analyzer = _make_analyzer({"a.py": FILE_A_SOURCE, "b.py": FILE_B_SOURCE})
        builder = CallGraphBuilder(analyzer)
        builder.build()
        # helper is called by process
        callers_of_helper = builder.get_callers("helper")
        assert "process" in callers_of_helper

    def test_get_callees(self) -> None:
        analyzer = _make_analyzer({"a.py": FILE_A_SOURCE, "b.py": FILE_B_SOURCE})
        builder = CallGraphBuilder(analyzer)
        builder.build()
        callees_of_process = builder.get_callees("process")
        assert "helper" in callees_of_process

    def test_get_callees_run(self) -> None:
        analyzer = _make_analyzer({"a.py": FILE_A_SOURCE, "b.py": FILE_B_SOURCE})
        builder = CallGraphBuilder(analyzer)
        builder.build()
        callees_of_run = builder.get_callees("run")
        # run calls validate and process
        assert "validate" in callees_of_run
        assert "process" in callees_of_run

    def test_get_definition(self) -> None:
        analyzer = _make_analyzer({"a.py": FILE_A_SOURCE})
        builder = CallGraphBuilder(analyzer)
        builder.build()
        defn = builder.get_definition("helper")
        assert defn is not None
        assert defn.file == "a.py"

    def test_no_self_loops(self) -> None:
        src = "def foo():\n    foo()\n"
        analyzer = _make_analyzer({"s.py": src})
        builder = CallGraphBuilder(analyzer)
        g = builder.build()
        assert not g.has_edge("foo", "foo")

    def test_build_is_idempotent(self) -> None:
        analyzer = _make_analyzer({"a.py": FILE_A_SOURCE})
        builder = CallGraphBuilder(analyzer)
        g1 = builder.build()
        g2 = builder.build()
        assert set(g1.nodes) == set(g2.nodes)


# ---------------------------------------------------------------------------
# PropagationTracer tests
# ---------------------------------------------------------------------------


class TestPropagationTracer:
    def _make_tracer(self, sources: dict[str, str]) -> PropagationTracer:
        analyzer = _make_analyzer(sources)
        builder = CallGraphBuilder(analyzer)
        builder.build()
        return PropagationTracer(builder)

    def test_single_node_when_no_callers(self) -> None:
        """A root function with no callers yields a single-node path."""
        tracer = self._make_tracer({"a.py": FILE_A_SOURCE})
        failure = FailureLocation(file="a.py", line=0, symbol="helper")
        path, nodes, edges = tracer.trace(failure)
        # helper has no callers → only the failure node
        assert len(path) == 1
        assert path[0].role == "failure"

    def test_chain_origin_to_failure(self) -> None:
        """run → process → helper: tracing from helper finds the full chain."""
        tracer = self._make_tracer({"a.py": FILE_A_SOURCE, "b.py": FILE_B_SOURCE})
        failure = FailureLocation(file="a.py", line=7, symbol="helper")
        path, nodes, edges = tracer.trace(failure)
        symbols = [p.symbol for p in path]
        # The path should start at the root caller and end at helper
        assert symbols[-1] == "helper"
        assert symbols[0] != "helper"  # there is at least one upstream caller

    def test_roles_assigned(self) -> None:
        tracer = self._make_tracer({"a.py": FILE_A_SOURCE, "b.py": FILE_B_SOURCE})
        failure = FailureLocation(file="a.py", line=7, symbol="helper")
        path, _, _ = tracer.trace(failure)
        assert path[0].role == "origin"
        assert path[-1].role == "failure"
        for pn in path[1:-1]:
            assert pn.role == "propagation"

    def test_graph_nodes_match_path(self) -> None:
        tracer = self._make_tracer({"a.py": FILE_A_SOURCE, "b.py": FILE_B_SOURCE})
        failure = FailureLocation(file="a.py", line=7, symbol="helper")
        path, graph_nodes, graph_edges = tracer.trace(failure)
        assert len(graph_nodes) == len(path)
        assert len(graph_edges) == len(path) - 1

    def test_graph_edge_direction(self) -> None:
        tracer = self._make_tracer({"a.py": FILE_A_SOURCE, "b.py": FILE_B_SOURCE})
        failure = FailureLocation(file="a.py", line=7, symbol="helper")
        path, _, edges = tracer.trace(failure)
        if edges:
            # Source of first edge should be path[0]'s id
            assert edges[0].source == path[0].id
            assert edges[0].target == path[1].id

    def test_line_numbers_one_based(self) -> None:
        """Propagation nodes expose 1-based line numbers."""
        tracer = self._make_tracer({"a.py": FILE_A_SOURCE})
        failure = FailureLocation(file="a.py", line=0, symbol="helper")
        path, _, _ = tracer.trace(failure)
        for pn in path:
            assert pn.line >= 1


# ---------------------------------------------------------------------------
# error_parser tests
# ---------------------------------------------------------------------------


class TestErrorParser:
    def test_traceback_extracts_innermost(self) -> None:
        tb = (
            'Traceback (most recent call last):\n'
            '  File "/workspace/a.py", line 5, in process\n'
            '    helper(item)\n'
            '  File "/workspace/a.py", line 2, in helper\n'
            '    return x * 2\n'
            'TypeError: unsupported operand type(s)\n'
        )
        loc = parse_error(tb)
        assert loc.file == "/workspace/a.py"
        assert loc.line == 2
        assert loc.symbol == "helper"

    def test_traceback_prefers_workspace(self) -> None:
        tb = (
            'Traceback (most recent call last):\n'
            '  File "/usr/lib/python3/site-packages/lib.py", line 10, in _internal\n'
            '    do_thing()\n'
            '  File "/workspace/a.py", line 5, in process\n'
            '    helper(item)\n'
            'RuntimeError: oops\n'
        )
        loc = parse_error(tb, workspace_root="/workspace")
        assert loc.file == "/workspace/a.py"
        assert loc.symbol == "process"

    def test_pytest_failed_line(self) -> None:
        output = "FAILED tests/test_foo.py::TestSuite::test_broken - AssertionError"
        loc = parse_error(output)
        assert loc.file == "tests/test_foo.py"
        assert loc.symbol == "test_broken"

    def test_fallback_returns_unknown(self) -> None:
        loc = parse_error("some random error message with no file info")
        assert loc.symbol == "<unknown>"
        assert loc.file == ""


### 🤖 Assistant

> 🔧 called: execute_command

Now let me install the remaining dependencies and run the tests:

> 🔧 **execute_command** — py -m pip install fastapi uvicorn pydantic python-dotenv pytest pytest-asyncio httpx 2>&1

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -m pytest backend/tests/test_call_graph.py -v 2>&1

### 🤖 Assistant

> 🔧 called: apply_diff

22/23 pass. The one failure: `helper` has no callers *in file A alone* but when both files are analyzed, `process` calls `helper`. The test used only `FILE_A_SOURCE`, but `process` calls `helper` within the same file, so `helper` does have a caller. The test expectation was wrong — fix the test to use a truly standalone function:

> 🔧 **apply_diff** — backend/tests/test_call_graph.py

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -m pytest backend/tests/test_call_graph.py -v 2>&1

### 🤖 Assistant

> 🔧 called: read_file

The single-node case sets `role="origin"` since there's only one node, and the `_reconstruct_path` returns just `[start_symbol]` which triggers the single-node branch — and in `trace()`, since `len(visited) == 1` it assigns `role="failure"` but wait — let me check: looking at the tracer code, when `len(path_symbols) == 1`, `idx == 0` and `idx == len(path_symbols) - 1 == 0`, so the `elif idx == len(path_symbols) - 1` branch assigns `role="failure"`. But the test says it's `"origin"`. Let me check:

> 🔧 **read_file** — backend/analyzer/propagation_tracer.py

### 🤖 Assistant

> 🔧 called: read_file



> 🔧 **read_file** — backend/analyzer/propagation_tracer.py

### 🤖 Assistant

> 🔧 called: apply_diff

When `len(path_symbols) == 1`, `idx == 0` triggers `role = "origin"` because the `if idx == 0` branch comes first. The single-node case should be `"failure"` since it is the failing function. The fix: check for single-node case explicitly, or reverse the condition order. The most semantically correct fix is: when there's only one node, it is the failure point (not the origin of anything), so assign `"failure"`:

> 🔧 **apply_diff** — backend/analyzer/propagation_tracer.py

### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — py -m pytest backend/tests/test_call_graph.py -v 2>&1

### 🤖 Assistant

> 🔧 called: update_todo_list

All 23 tests pass. Now update the plan:

> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/error_parser.py — parse raw error/traceback text to extract initial failure (file, line, symbol)
[x] Create backend/analyzer/ast_analyzer.py — parse files with tree-sitter, extract function defs and call sites
[x] Create backend/analyzer/call_graph.py — CallGraphBuilder builds a networkx.DiGraph; expose get_callers/get_callees
[x] Create backend/analyzer/propagation_tracer.py — PropagationTracer.trace(failure_symbol) -> List[PropagationNode] using backward BFS
[x] Wire into POST /analyze in main.py — parse error → build call graph → trace → populate graph.nodes and graph.edges
[x] Write backend/tests/test_call_graph.py with a two-file fixture
[-] Update Sub-Task 3 status in rootflow-plan.md


### 🤖 Assistant

> 🔧 called: apply_diff



> 🔧 **apply_diff** — <<<<<<< SEARCH
:start_line:167
-------
**Status:** `[ ] pending`
=======
**Status:** `[x] complete`
>>>>>>> REPLACE


### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — 
[x] Create backend/analyzer/error_parser.py — parse raw error/traceback text to extract initial failure (file, line, symbol)
[x] Create backend/analyzer/ast_analyzer.py — parse files with tree-sitter, extract function defs and call sites
[x] Create backend/analyzer/call_graph.py — CallGraphBuilder builds a networkx.DiGraph; expose get_callers/get_callees
[x] Create backend/analyzer/propagation_tracer.py — PropagationTracer.trace(failure_symbol) -> List[PropagationNode] using backward BFS
[x] Wire into POST /analyze in main.py — parse error → build call graph → trace → populate graph.nodes and graph.edges
[x] Write backend/tests/test_call_graph.py with a two-file fixture
[x] Update Sub-Task 3 status in rootflow-plan.md


### 🤖 Assistant

Sub-Task 3 is complete. Here's a summary of everything delivered:

---

## Sub-Task 3 — Delivered

### New files

| File | Purpose |
|---|---|
| [`backend/analyzer/error_parser.py`](backend/analyzer/error_parser.py) | Parses raw Python tracebacks, pytest output, and generic `file:line:` patterns into a `FailureLocation(file, line, symbol)`. Prefers workspace-local frames. |
| [`backend/analyzer/ast_analyzer.py`](backend/analyzer/ast_analyzer.py) | `ASTAnalyzer` walks the workspace with tree-sitter, extracting `FunctionDef` (file, line range, symbol, decorators) and `CallSite` (caller → callee, file, line) records. Handles nested functions, class methods, and skips `node_modules`/`site-packages`. |
| [`backend/analyzer/call_graph.py`](backend/analyzer/call_graph.py) | `CallGraphBuilder` turns the AST output into a `networkx.DiGraph`. Exposes `get_callers(symbol)`, `get_callees(symbol)`, `get_definition(symbol)`. Resolves short callee names to fully-qualified symbols with same-file preference. |
| [`backend/analyzer/propagation_tracer.py`](backend/analyzer/propagation_tracer.py) | `PropagationTracer.trace(failure)` does backward BFS (max depth 10) from the failure symbol, reconstructs the origin→failure linear path, assigns `"origin"/"propagation"/"failure"` roles, and returns `(List[PropagationNode], List[GraphNode], List[GraphEdge])`. |
| [`backend/tests/test_call_graph.py`](backend/tests/test_call_graph.py) | 23 unit tests across all four modules using synthetic two-file fixtures — all passing. |

### Modified files

| File | Change |
|---|---|
| [`backend/main.py`](backend/main.py) | `POST /analyze` now runs the full Stage 3 pipeline: `parse_error → ASTAnalyzer → CallGraphBuilder → PropagationTracer`. Populates `propagationPath` and `graph.nodes/edges` in the response. |
| [`rootflow-plan.md`](rootflow-plan.md) | Sub-Task 3 status updated to `[x] complete`. |