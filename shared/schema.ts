/**
 * shared/schema.ts
 *
 * Canonical TypeScript interfaces for the RootFlow JSON contract.
 * Used by the VS Code extension host and the Webview React app.
 * Keep in sync with shared/schema.py.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export interface PropagationNode {
  id: string;
  file: string;
  line: number;
  symbol: string;
  role: "origin" | "propagation" | "failure";
  explanation: string;
}

export interface RelatedNode {
  id: string;
  file: string;
  symbol: string;
  relationship: string;
}

export interface GraphNode {
  id: string;
  label: string;
  role: "origin" | "propagation" | "failure" | "related";
  file: string;
  line: number;
  symbol: string;
}

export interface GraphEdge {
  source: string; // GraphNode.id
  target: string; // GraphNode.id
  label?: string;
}

// ---------------------------------------------------------------------------
// Top-level result
// ---------------------------------------------------------------------------

export interface ErrorInput {
  raw: string;
  file?: string;
  line?: number;
}

export interface RootCause {
  file: string;
  line: number;
  symbol: string;
  explanation: string;
  /** 0.0 – 1.0 */
  confidenceScore: number;
}

export interface SuggestedFix {
  description: string;
  filePath: string;
  originalCode: string;
  fixedCode: string;
  /** Unified diff */
  patch: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RootFlowResult {
  sessionId: string;
  timestamp: string;
  errorInput: ErrorInput;
  rootCause: RootCause;
  propagationPath: PropagationNode[];
  relatedNodes: RelatedNode[];
  suggestedFix: SuggestedFix;
  graph: Graph;
}
