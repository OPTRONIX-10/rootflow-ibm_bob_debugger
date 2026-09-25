"""
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
        """A standalone function with no callers yields a single-node path."""
        # standalone_fn is not called by anything else in this fixture
        src = "def standalone_fn():\n    pass\n"
        tracer = self._make_tracer({"s.py": src})
        failure = FailureLocation(file="s.py", line=0, symbol="standalone_fn")
        path, nodes, edges = tracer.trace(failure)
        # standalone_fn has no callers → only the failure node
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
