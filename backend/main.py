"""RootFlow backend — FastAPI analysis server.

Runs on localhost:7331.  Full pipeline stages are wired in Sub-Tasks 3–5.
Stage 3 (AST / call-graph analysis) is active.
Stage 4 (related-code context) is active.
Stage 5 (LLM reasoning via IBM watsonx.ai Granite) is active.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
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

# Analysis pipeline — Stage 5
from backend.analyzer.snippet_extractor import SnippetExtractor
from backend.analyzer.watsonx_reasoner import (
    SnippetContext,
    WatsonxReasoner,
    _fallback,
)
from shared.schema import RootFlowResult

# Load environment variables from .env (WATSONX_API_KEY, etc.)
# Resolve relative to this file so the server works regardless of cwd.
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

app = FastAPI(title="RootFlow Analysis Server", version="0.1.0")

# Allow the VS Code Webview origin (vscode-webview://) and localhost dev servers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_patch_file(patch: str, workspace_root: str) -> str | None:
    """
    Parse the '--- a/<path>' or '--- <path>' header from a unified diff and
    return the resolved absolute file path within *workspace_root*.

    Returns None if the patch is empty, malformed, or the resolved path does
    not exist on disk (so the caller can fall back to root_cause_file).
    """
    import re
    from pathlib import Path

    if not patch.strip():
        return None

    for line in patch.splitlines():
        # Match "--- a/some/path" or "--- some/path" (no a/ prefix)
        m = re.match(r"^---\s+(?:a/)?(.+)$", line)
        if m:
            rel = m.group(1).strip()
            # Strip any trailing tab-separated metadata (e.g. timestamps)
            rel = re.split(r"\t", rel)[0].strip()
            if rel in ("/dev/null", ""):
                continue
            candidate = Path(workspace_root) / rel
            if candidate.is_file():
                return str(candidate)
            # Also try the path as-is (might already be absolute)
            candidate2 = Path(rel)
            if candidate2.is_absolute() and candidate2.is_file():
                return str(candidate2)
    return None


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


@app.post("/analyze", response_model=RootFlowResult)
async def analyze(request: AnalyzeRequest) -> RootFlowResult:
    """
    Full pipeline: error parsing → AST/call-graph → related-code context → LLM reasoning.

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

    # The propagation origin is the upstream entrypoint, not necessarily the
    # file containing the failing operation. Keep rootCause anchored to the
    # innermost traceback frame so generated fixes target the actual defect.
    root_cause_file = failure.file
    root_cause_line = failure.line
    root_cause_symbol = failure.symbol

    # ------------------------------------------------------------------
    # Stage 4 — Related-code context for LLM reasoning
    # ------------------------------------------------------------------
    extractor = SnippetExtractor()
    snippet_contexts: list[SnippetContext] = []
    for pn in propagation_path:
        func_def = builder.get_definition(pn.symbol)
        if func_def is not None:
            snippet = extractor.extract_from_file(
                file_path=func_def.file,
                start_line=func_def.start_line,
                decorator_texts=func_def.decorators,
            )
            full_text = snippet.full_text if snippet else ""
        else:
            full_text = ""
        snippet_contexts.append(SnippetContext(node=pn, full_text=full_text))

    # Include definitions from files imported by the traced functions. This
    # gives the reasoner the contracts that explain the failure, such as a
    # schema in a related models/ folder.
    traced_files = {pn.file for pn in propagation_path}
    related_nodes = []
    for definition in analyzer.function_defs:
        if definition.file in traced_files or definition.file == failure.file:
            continue
        related_nodes.append({
            "id": str(uuid.uuid4()),
            "file": definition.file,
            "symbol": definition.symbol,
            "relationship": "related workspace definition",
        })
        snippet = extractor.extract_from_file(
            file_path=definition.file,
            start_line=definition.start_line,
            decorator_texts=definition.decorators,
        )
        if snippet:
            snippet_contexts.append(
                SnippetContext(
                    node=propagation_path[-1].model_copy(
                        update={
                            "id": str(uuid.uuid4()),
                            "file": definition.file,
                            "line": definition.start_line + 1,
                            "symbol": definition.symbol,
                            "role": "failure",
                        }
                    ),
                    full_text=snippet.full_text,
                )
            )

    reasoner = WatsonxReasoner()
    reasoning = reasoner.reason(
        error_text=request.errorText,
        snippets=snippet_contexts,
    )

    # Never send a model patch to the editor when it targets another file or
    # contains source text that is not present at the traceback location.
    # Models can produce plausible but unrelated fixes for a multi-file bug;
    # fall back to the local evidence-based fix instead.
    failure_source = ""
    try:
        failure_source = Path(root_cause_file).read_text(encoding="utf-8")
    except OSError:
        pass
    patch_file = _extract_patch_file(reasoning.patch, request.workspaceRoot)
    patch_targets_failure = (
        patch_file is None
        or Path(patch_file).resolve() == Path(root_cause_file).resolve()
    )
    original_matches_failure = (
        bool(reasoning.original_code)
        and reasoning.original_code in failure_source
    )
    if not patch_targets_failure or not original_matches_failure:
        reasoning = _fallback(
            "Model fix did not match the traceback failure location",
            request.errorText,
            snippet_contexts,
        )

    # Enrich propagation nodes with per-node explanations if the LLM produced
    # a single explanation (the model reasons holistically; individual node
    # explanations default to the root-cause explanation for the origin node
    # and are left empty for intermediate nodes).
    if propagation_path:
        propagation_path[0] = propagation_path[0].model_copy(
            update={"explanation": reasoning.explanation}
        )

    # Determine which file the fix targets.
    # Priority: parse the "--- a/<path>" header from the patch (most reliable),
    # then fall back to the root_cause_file.
    fix_file_path = _extract_patch_file(reasoning.patch, request.workspaceRoot) or root_cause_file

    response = {
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
            "explanation": reasoning.explanation,
            "confidenceScore": reasoning.confidence_score,
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
        "relatedNodes": related_nodes,
        "suggestedFix": {
            "description": reasoning.fix_description,
            "filePath": fix_file_path,
            "originalCode": reasoning.original_code,
            "fixedCode": reasoning.fixed_code,
            "patch": reasoning.patch,
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
    # Validate and normalize aliases before FastAPI serializes the response.
    # This prevents a late serialization failure from reaching the client as
    # an apparently empty 200 response.
    result =  RootFlowResult.model_validate(response)
    print(result)
    return result


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("ROOTFLOW_PORT", "7331"))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=False)
