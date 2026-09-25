"""RootFlow backend — FastAPI analysis server.

Runs on localhost:7331.  Full pipeline stages are wired in Sub-Tasks 3–5.
Stage 3 (AST / call-graph analysis) is active.
Stage 4 (Git blame) is active.
Stage 5 (LLM reasoning via IBM watsonx.ai Granite) is active.
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

# Analysis pipeline — Stage 4
from backend.analyzer.git_analyzer import GitAnalyzer

# Analysis pipeline — Stage 5
from backend.analyzer.snippet_extractor import SnippetExtractor
from backend.analyzer.watsonx_reasoner import SnippetContext, WatsonxReasoner

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

    # ------------------------------------------------------------------
    # Stage 4 — Git blame: identify the introducing commit for the origin
    # ------------------------------------------------------------------
    introduced_by_commit = None
    git_analyzer = GitAnalyzer(request.workspaceRoot)
    if git_analyzer.last_error is None:
        commit_info = git_analyzer.blame(root_cause_file, root_cause_line)
        if commit_info is not None:
            introduced_by_commit = {
                "hash": commit_info.hash,
                "author": commit_info.author,
                "date": commit_info.date,
                "message": commit_info.message,
                "diff": commit_info.diff,
            }

    # ------------------------------------------------------------------
    # Stage 5 — LLM reasoning: snippet extraction + watsonx.ai call
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

    # Build a concise Git blame summary for the prompt
    git_summary = ""
    if introduced_by_commit:
        ic = introduced_by_commit
        git_summary = (
            f"Commit {ic['hash'][:8]} by {ic['author']} on {ic['date']}:\n"
            f"  {ic['message']}"
        )

    reasoner = WatsonxReasoner()
    reasoning = reasoner.reason(
        error_text=request.errorText,
        snippets=snippet_contexts,
        git_summary=git_summary,
    )

    # Enrich propagation nodes with per-node explanations if the LLM produced
    # a single explanation (the model reasons holistically; individual node
    # explanations default to the root-cause explanation for the origin node
    # and are left empty for intermediate nodes).
    if propagation_path:
        propagation_path[0] = propagation_path[0].model_copy(
            update={"explanation": reasoning.explanation}
        )

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
            "explanation": reasoning.explanation,
            "confidenceScore": reasoning.confidence_score,
            "introducedByCommit": introduced_by_commit,
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
            "description": reasoning.fix_description,
            "filePath": root_cause_file,
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


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("ROOTFLOW_PORT", "7331"))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=False)
