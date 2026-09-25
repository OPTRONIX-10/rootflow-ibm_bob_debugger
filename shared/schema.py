"""
shared/schema.py

Canonical Pydantic models for the RootFlow JSON contract.
Used by the FastAPI backend.  Keep in sync with shared/schema.ts.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------


class CommitInfo(BaseModel):
    hash: str
    author: str
    date: str
    message: str
    diff: str


class PropagationNode(BaseModel):
    id: str
    file: str
    line: int
    symbol: str
    role: Literal["origin", "propagation", "failure"]
    explanation: str


class RelatedNode(BaseModel):
    id: str
    file: str
    symbol: str
    relationship: str


class GraphNode(BaseModel):
    id: str
    label: str
    role: Literal["origin", "propagation", "failure", "related"]
    file: str
    line: int
    symbol: str


class GraphEdge(BaseModel):
    source: str  # GraphNode.id
    target: str  # GraphNode.id
    label: Optional[str] = None


# ---------------------------------------------------------------------------
# Top-level result
# ---------------------------------------------------------------------------


class ErrorInput(BaseModel):
    raw: str
    file: Optional[str] = None
    line: Optional[int] = None


class RootCause(BaseModel):
    file: str
    line: int
    symbol: str
    explanation: str
    confidence_score: float = Field(ge=0.0, le=1.0, alias="confidenceScore")
    introduced_by_commit: Optional[CommitInfo] = Field(
        default=None, alias="introducedByCommit"
    )

    model_config = {"populate_by_name": True}


class SuggestedFix(BaseModel):
    description: str
    file_path: str = Field(alias="filePath")
    original_code: str = Field(alias="originalCode")
    fixed_code: str = Field(alias="fixedCode")
    patch: str  # unified diff

    model_config = {"populate_by_name": True}


class Graph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class RootFlowResult(BaseModel):
    session_id: str = Field(alias="sessionId")
    timestamp: str
    error_input: ErrorInput = Field(alias="errorInput")
    root_cause: RootCause = Field(alias="rootCause")
    propagation_path: list[PropagationNode] = Field(alias="propagationPath")
    related_nodes: list[RelatedNode] = Field(alias="relatedNodes")
    suggested_fix: SuggestedFix = Field(alias="suggestedFix")
    graph: Graph

    model_config = {"populate_by_name": True}
