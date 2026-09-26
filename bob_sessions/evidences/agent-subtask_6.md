# @rootflow-plan.md implement Sub-Task 6 and update the status in rootflow-plan.md

---

**Status:** active  **Date:** 2026-09-25

---

### 👤 User

@rootflow-plan.md implement Sub-Task 6 and update the status in rootflow-plan.md

---

### 🤖 Assistant

> 🔧 called: read_file

Let me start by reading the plan file to understand what Sub-Task 6 entails.

> 🔧 **read_file** — rootflow-plan.md

### 🤖 Assistant

> 🔧 called: list_files, list_files

Now let me examine the existing webview structure from previous sub-tasks to understand what's already in place.

> 🔧 **list_files** — extension/src/webview

> 🔧 **list_files** — extension

### 🤖 Assistant

> 🔧 called: read_file, read_file, read_file



> 🔧 **read_file** — extension/esbuild.js

> 🔧 **read_file** — extension/package.json

> 🔧 **read_file** — extension/src/webview/index.tsx

### 🤖 Assistant

> 🔧 called: read_file, read_file

Now let me read the shared schema to understand the TypeScript interfaces:

> 🔧 **read_file** — extension/tsconfig.json

> 🔧 **read_file** — shared/schema.ts

### 🤖 Assistant

> 🔧 called: update_todo_list

Now I have a full picture of the project. Let me set up the todo list and implement Sub-Task 6.

> 🔧 **update_todo_list** — [-] Sub-Task 6 — Webview: Metro-Style Visualization (D3 + SVG)
[ ] 6.1 Create useMetroLayout.ts hook — computes spine + branch node positions
[ ] 6.2 Create MetroLine.tsx — SVG curved paths between spine nodes
[ ] 6.3 Create StationNode.tsx — role-specific shapes (circle, diamond, square)
[ ] 6.4 Create MetroGraph.tsx — main component wiring D3 force layout + zoom/pan
[ ] 6.5 Add metro.css — role-based color palette + VS Code theme variables
[ ] 6.6 Update index.tsx webview entry to import MetroGraph
[ ] 6.7 Build the webview bundle and verify it compiles
[ ] 6.8 Update rootflow-plan.md Sub-Task 6 status to complete


### 🤖 Assistant

> 🔧 called: write_file

Now I'll create all the files. Let me start with the layout hook and component files:

> 🔧 **write_file** — extension/src/webview/useMetroLayout.ts

### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — /**
 * MetroLine.tsx
 *
 * Renders the connecting track lines between spine nodes (and branch lines to
 * related nodes) using SVG <path> elements with rounded cubic Bézier curves.
 */

import React from "react";
import type { GraphEdge } from "shared/schema";
import type { PositionedNode } from "./useMetroLayout";

interface MetroLineProps {
  edges: GraphEdge[];
  nodeMap: Map<string, PositionedNode>;
}

/** Pick a track colour based on the source node's role. */
function edgeColor(sourceRole: string | undefined): string {
  switch (sourceRole) {
    case "origin":
      return "var(--rf-color-origin, #e05252)";
    case "propagation":
      return "var(--rf-color-propagation, #d4a017)";
    case "failure":
      return "var(--rf-color-failure, #c0392b)";
    default:
      return "var(--rf-color-related, #8e9aad)";
  }
}

/**
 * Build a smooth cubic Bézier path between two points.
 * For horizontal neighbours the control points pull horizontally;
 * for vertical branches they create a natural S-curve.
 */
function buildPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);

  if (dy < 10) {
    // Near-horizontal: use horizontal control handles
    const cp = dx * 0.45;
    return `M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`;
  } else if (dx < 10) {
    // Near-vertical: straight line with slight rounding
    const cp = dy * 0.4;
    return `M ${x1} ${y1} C ${x1} ${y1 + cp}, ${x2} ${y2 - cp}, ${x2} ${y2}`;
  } else {
    // Diagonal: S-curve
    const cpx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cpx} ${y1}, ${cpx} ${y2}, ${x2} ${y2}`;
  }
}

const MetroLine: React.FC<MetroLineProps> = ({ edges, nodeMap }) => {
  return (
    <g className="metro-lines">
      {edges.map((edge) => {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) return null;

        const color = edgeColor(src.role);
        const d = buildPath(src.x, src.y, tgt.x, tgt.y);
        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y + tgt.y) / 2;

        return (
          <g key={`${edge.source}-${edge.target}`}>
            <path
              d={d}
              stroke={color}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              opacity={0.85}
            />
            {edge.label && (
              <text
                x={midX}
                y={midY - 8}
                textAnchor="middle"
                fontSize={10}
                fill="var(--vscode-descriptionForeground, #888)"
                className="edge-label"
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
};

export default MetroLine;


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — /**
 * StationNode.tsx
 *
 * Renders a single metro station node with a role-specific shape:
 *   - origin      → filled red circle with pulse ring
 *   - propagation → yellow diamond (rotated square)
 *   - failure     → filled red square with rounded corners
 *   - related     → grey circle (smaller, dashed border)
 */

import React from "react";
import type { PositionedNode } from "./useMetroLayout";

interface StationNodeProps {
  node: PositionedNode;
  selected: boolean;
  onClick: (node: PositionedNode) => void;
  onMouseEnter: (node: PositionedNode, event: React.MouseEvent) => void;
  onMouseLeave: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  origin: "var(--rf-color-origin, #e05252)",
  propagation: "var(--rf-color-propagation, #d4a017)",
  failure: "var(--rf-color-failure, #c0392b)",
  related: "var(--rf-color-related, #8e9aad)",
};

const ROLE_SIZES: Record<string, number> = {
  origin: 20,
  propagation: 18,
  failure: 20,
  related: 14,
};

/** Truncate a label to fit inside the node badge below it */
function truncateLabel(label: string, maxLen = 18): string {
  return label.length > maxLen ? label.slice(0, maxLen - 1) + "…" : label;
}

const StationNode: React.FC<StationNodeProps> = ({
  node,
  selected,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const { x, y, role, label } = node;
  const color = ROLE_COLORS[role] ?? ROLE_COLORS.related;
  const size = ROLE_SIZES[role] ?? 14;
  const strokeColor = selected
    ? "var(--vscode-focusBorder, #007acc)"
    : "var(--vscode-editor-background, #1e1e1e)";
  const strokeWidth = selected ? 3 : 2;

  const handleClick = () => onClick(node);
  const handleMouseEnter = (e: React.MouseEvent) => onMouseEnter(node, e);

  const sharedProps = {
    fill: color,
    stroke: strokeColor,
    strokeWidth,
    onClick: handleClick,
    onMouseEnter: handleMouseEnter,
    onMouseLeave,
    style: { cursor: "pointer" },
  };

  let shape: React.ReactNode;

  if (role === "origin") {
    // Circle with outer pulse ring
    shape = (
      <>
        {selected && (
          <circle cx={x} cy={y} r={size + 8} fill="none" stroke={color} strokeWidth={1.5} opacity={0.35} />
        )}
        <circle cx={x} cy={y} r={size} {...sharedProps} />
        {/* Inner white dot for detail */}
        <circle cx={x} cy={y} r={size * 0.35} fill="white" opacity={0.6} pointerEvents="none" />
      </>
    );
  } else if (role === "propagation") {
    // Diamond (rotated square)
    const half = size;
    const pts = `${x},${y - half} ${x + half},${y} ${x},${y + half} ${x - half},${y}`;
    shape = (
      <>
        <polygon points={pts} {...sharedProps} />
      </>
    );
  } else if (role === "failure") {
    // Rounded rectangle
    shape = (
      <>
        <rect
          x={x - size}
          y={y - size}
          width={size * 2}
          height={size * 2}
          rx={5}
          ry={5}
          {...sharedProps}
        />
        {/* X mark inside */}
        <line
          x1={x - size * 0.4}
          y1={y - size * 0.4}
          x2={x + size * 0.4}
          y2={y + size * 0.4}
          stroke="white"
          strokeWidth={2.5}
          opacity={0.7}
          pointerEvents="none"
        />
        <line
          x1={x + size * 0.4}
          y1={y - size * 0.4}
          x2={x - size * 0.4}
          y2={y + size * 0.4}
          stroke="white"
          strokeWidth={2.5}
          opacity={0.7}
          pointerEvents="none"
        />
      </>
    );
  } else {
    // Related: smaller dashed circle
    shape = (
      <circle
        cx={x}
        cy={y}
        r={size}
        fill={color}
        fillOpacity={0.5}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="4 2"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{ cursor: "pointer" }}
      />
    );
  }

  return (
    <g className={`station-node station-node--${role}`} aria-label={label}>
      {shape}
      {/* Label below the node */}
      <text
        x={x}
        y={y + size + 16}
        textAnchor="middle"
        fontSize={11}
        fill="var(--vscode-foreground, #cccccc)"
        fontFamily="var(--vscode-font-family, sans-serif)"
        pointerEvents="none"
      >
        {truncateLabel(label)}
      </text>
    </g>
  );
};

export default StationNode;


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — /**
 * MetroGraph.tsx
 *
 * Core visualization component.  Receives a RootFlowResult graph payload and
 * renders an interactive metro-style SVG map with:
 *   - A horizontal spine of causal nodes (origin → propagation → failure)
 *   - Branch lines from related nodes to their nearest spine neighbour
 *   - D3 zoom/pan on the root <svg>
 *   - onClick / onHover callbacks bubbled up to App state
 */

import React, { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";
import type { GraphNode, GraphEdge, PropagationNode } from "shared/schema";
import { useMetroLayout, PositionedNode } from "./useMetroLayout";
import MetroLine from "./MetroLine";
import StationNode from "./StationNode";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MetroGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  propagationPath: PropagationNode[];
  selectedNodeId?: string | null;
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null, event?: React.MouseEvent) => void;
}

// ─── Legend ──────────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { role: "origin", label: "Origin", shape: "circle" },
  { role: "propagation", label: "Propagation", shape: "diamond" },
  { role: "failure", label: "Failure", shape: "square" },
  { role: "related", label: "Related", shape: "circle-dash" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  origin: "var(--rf-color-origin, #e05252)",
  propagation: "var(--rf-color-propagation, #d4a017)",
  failure: "var(--rf-color-failure, #c0392b)",
  related: "var(--rf-color-related, #8e9aad)",
};

function LegendItem({ role, label, shape }: { role: string; label: string; shape: string }) {
  const color = ROLE_COLORS[role];
  let icon: React.ReactNode;
  if (shape === "diamond") {
    icon = <polygon points="8,0 16,8 8,16 0,8" fill={color} />;
  } else if (shape === "square") {
    icon = <rect x={1} y={1} width={14} height={14} rx={3} fill={color} />;
  } else if (shape === "circle-dash") {
    icon = <circle cx={8} cy={8} r={6} fill={color} fillOpacity={0.5} stroke={color} strokeWidth={1.5} strokeDasharray="3 2" />;
  } else {
    icon = <circle cx={8} cy={8} r={7} fill={color} />;
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16, fontSize: 11 }}>
      <svg width={16} height={16} style={{ flexShrink: 0 }}>{icon}</svg>
      <span style={{ color: "var(--vscode-descriptionForeground, #888)" }}>{label}</span>
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const MetroGraph: React.FC<MetroGraphProps> = ({
  nodes,
  edges,
  propagationPath,
  selectedNodeId,
  onNodeClick,
  onNodeHover,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);

  const layout = useMetroLayout(nodes, edges, propagationPath);
  const nodeMap = new Map<string, PositionedNode>(layout.nodes.map((n) => [n.id, n]));

  // ── D3 zoom/pan ────────────────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    const g = gRef.current;
    if (!svg || !g) return;

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        d3.select(g).attr("transform", event.transform.toString());
      });

    d3.select(svg).call(zoom);

    // Reset transform when layout changes (new result loaded)
    d3.select(svg).call(zoom.transform, d3.zoomIdentity.translate(20, 40).scale(1));

    return () => {
      d3.select(svg).on(".zoom", null);
    };
  }, [layout]);

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const handleNodeClick = useCallback(
    (node: PositionedNode) => onNodeClick?.(node),
    [onNodeClick]
  );

  const handleNodeHover = useCallback(
    (node: PositionedNode | null, event?: React.MouseEvent) =>
      onNodeHover?.(node, event),
    [onNodeHover]
  );

  if (nodes.length === 0) {
    return (
      <div className="metro-graph metro-graph--empty">
        <span>No graph data available.</span>
      </div>
    );
  }

  return (
    <div className="metro-graph">
      {/* Legend */}
      <div className="metro-graph__legend">
        {LEGEND_ITEMS.map((item) => (
          <LegendItem key={item.role} {...item} />
        ))}
      </div>

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        className="metro-graph__svg"
        width="100%"
        style={{ minHeight: layout.height + 80, display: "block" }}
        aria-label="Bug propagation metro map"
        role="img"
      >
        <g ref={gRef} className="metro-graph__scene">
          {/* Lines below nodes */}
          <MetroLine edges={edges} nodeMap={nodeMap} />

          {/* Station nodes */}
          {layout.nodes.map((node) => (
            <StationNode
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              onClick={handleNodeClick}
              onMouseEnter={(n, e) => handleNodeHover(n, e)}
              onMouseLeave={() => handleNodeHover(null)}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};

export default MetroGraph;


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — /**
 * metro.css
 *
 * Styles for the MetroGraph component and its children.
 * All colors reference VS Code CSS custom properties so the UI respects
 * both the dark and light themes automatically.
 *
 * Role-based CSS variables are declared on :root and can be overridden per-theme.
 */

/* ── Role color palette ──────────────────────────────────────────────────── */
:root {
  /* Dark theme defaults (VS Code default dark) */
  --rf-color-origin:      #e05252;
  --rf-color-propagation: #d4a017;
  --rf-color-failure:     #c0392b;
  --rf-color-related:     #8e9aad;
  --rf-color-spine-track: #4c9be8;

  --rf-surface:           var(--vscode-editor-background, #1e1e1e);
  --rf-border:            var(--vscode-panel-border, #3c3c3c);
  --rf-text:              var(--vscode-foreground, #cccccc);
  --rf-text-muted:        var(--vscode-descriptionForeground, #8c8c8c);
}

/* Light theme overrides via VS Code body class */
body.vscode-light {
  --rf-color-origin:      #cc3333;
  --rf-color-propagation: #a07800;
  --rf-color-failure:     #991f1f;
  --rf-color-related:     #6b7a90;
  --rf-color-spine-track: #1a6fcf;
}

/* High-contrast overrides */
body.vscode-high-contrast {
  --rf-color-origin:      #ff6666;
  --rf-color-propagation: #ffcc00;
  --rf-color-failure:     #ff3333;
  --rf-color-related:     #aaaaaa;
}

/* ── Metro graph container ───────────────────────────────────────────────── */
.metro-graph {
  display: flex;
  flex-direction: column;
  background: var(--rf-surface);
  border: 1px solid var(--rf-border);
  border-radius: 4px;
  overflow: hidden;
  width: 100%;
  height: 100%;
  min-height: 260px;
  box-sizing: border-box;
}

.metro-graph--empty {
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--rf-text-muted);
  font-size: 13px;
  font-family: var(--vscode-font-family, sans-serif);
}

/* ── Legend bar ──────────────────────────────────────────────────────────── */
.metro-graph__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--rf-border);
  background: var(--vscode-sideBar-background, #252526);
  font-family: var(--vscode-font-family, sans-serif);
  user-select: none;
}

/* ── SVG canvas ──────────────────────────────────────────────────────────── */
.metro-graph__svg {
  flex: 1;
  background: var(--rf-surface);
  cursor: grab;
  overflow: visible;
}

.metro-graph__svg:active {
  cursor: grabbing;
}

/* ── Metro lines ─────────────────────────────────────────────────────────── */
.metro-lines path {
  transition: stroke-opacity 0.15s ease;
}

.edge-label {
  font-family: var(--vscode-font-family, sans-serif);
  pointer-events: none;
  user-select: none;
}

/* ── Station nodes ───────────────────────────────────────────────────────── */
.station-node {
  transition: opacity 0.15s ease;
}

.station-node:hover {
  opacity: 0.88;
}

.station-node text {
  user-select: none;
  pointer-events: none;
  font-family: var(--vscode-font-family, sans-serif);
}

/* ── Focus outline (keyboard nav) ────────────────────────────────────────── */
.station-node:focus-visible circle,
.station-node:focus-visible rect,
.station-node:focus-visible polygon {
  outline: 2px solid var(--vscode-focusBorder, #007acc);
  outline-offset: 2px;
}


### 🤖 Assistant

> 🔧 called: write_file

Now update `index.tsx` to wire in the `MetroGraph` and accept messages from the extension host:

> 🔧 **write_file** — /**
 * index.tsx — Webview entry point (Sub-Tasks 6–9)
 *
 * Mounts the React app, listens for messages from the extension host, and
 * renders the MetroGraph with the received RootFlowResult.
 *
 * Message protocol (extension → webview):
 *   { command: 'loadResult', data: RootFlowResult }
 *   { command: 'loading' }
 *   { command: 'error', message: string }
 */

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import type { RootFlowResult, GraphNode } from "shared/schema";
import MetroGraph from "./MetroGraph";
import "./metro.css";

// ── VS Code API shim ──────────────────────────────────────────────────────────

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscodeApi = (function () {
  try {
    return acquireVsCodeApi();
  } catch {
    // Running outside VS Code (e.g. browser dev) — provide a no-op stub
    return { postMessage: () => {}, getState: () => null, setState: () => {} };
  }
})();

// ── Root App ──────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const [result, setResult] = useState<RootFlowResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [tooltip, setTooltip] = useState<{
    node: GraphNode;
    x: number;
    y: number;
  } | null>(null);

  // ── Message listener ───────────────────────────────────────────────────────
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data as { command: string; data?: RootFlowResult; message?: string };
      switch (msg.command) {
        case "loadResult":
          setLoading(false);
          setError(null);
          setSelectedNode(null);
          setResult(msg.data ?? null);
          break;
        case "loading":
          setLoading(true);
          setError(null);
          break;
        case "error":
          setLoading(false);
          setError(msg.message ?? "Unknown error");
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // ── Node interaction ───────────────────────────────────────────────────────
  function handleNodeClick(node: GraphNode) {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    setTooltip(null);
  }

  function handleNodeHover(node: GraphNode | null, event?: React.MouseEvent) {
    if (!node) {
      setTooltip(null);
      return;
    }
    setTooltip({ node, x: event?.clientX ?? 0, y: event?.clientY ?? 0 });
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rf-shell">
        <div className="rf-header">
          <span className="rf-header__title">RootFlow</span>
        </div>
        <div className="rf-loading">
          <div className="rf-loading__spinner" />
          <span>Analyzing…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rf-shell">
        <div className="rf-header">
          <span className="rf-header__title">RootFlow</span>
        </div>
        <div className="rf-error">
          <strong>Analysis failed</strong>
          <p>{error}</p>
          <button
            className="rf-button"
            onClick={() => vscodeApi.postMessage({ command: "retry" })}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rf-shell">
        <div className="rf-header">
          <span className="rf-header__title">RootFlow</span>
        </div>
        <div className="rf-empty">
          <p>Select error text in the editor or terminal, then run <strong>RootFlow: Analyze Bug</strong>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rf-shell">
      {/* Header */}
      <div className="rf-header">
        <span className="rf-header__title">RootFlow</span>
        {result.rootCause && (
          <span className="rf-header__subtitle">
            Root cause: <code>{result.rootCause.symbol}</code> in{" "}
            <code>{result.rootCause.file}:{result.rootCause.line}</code>
          </span>
        )}
        <span className="rf-header__confidence">
          Confidence: {Math.round((result.rootCause.confidenceScore ?? 0) * 100)}%
        </span>
      </div>

      {/* Graph */}
      <div className="rf-graph-area">
        <MetroGraph
          nodes={result.graph.nodes}
          edges={result.graph.edges}
          propagationPath={result.propagationPath}
          selectedNodeId={selectedNode?.id}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
        />
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="rf-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="rf-tooltip__symbol">{tooltip.node.symbol}</div>
          <div className="rf-tooltip__file">
            {tooltip.node.file}:{tooltip.node.line}
          </div>
          <div className={`rf-tooltip__role rf-tooltip__role--${tooltip.node.role}`}>
            {tooltip.node.role}
          </div>
        </div>
      )}

      {/* Selected node detail strip */}
      {selectedNode && (
        <div className="rf-detail-strip">
          <div className="rf-detail-strip__header">
            <span className={`rf-badge rf-badge--${selectedNode.role}`}>
              {selectedNode.role}
            </span>
            <strong>{selectedNode.symbol}</strong>
            <span className="rf-detail-strip__location">
              {selectedNode.file}:{selectedNode.line}
            </span>
            <button
              className="rf-detail-strip__close"
              onClick={() => setSelectedNode(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {/* Explanation from matching propagation node */}
          {(() => {
            const pNode = result.propagationPath.find((p) => p.id === selectedNode.id);
            return pNode?.explanation ? (
              <p className="rf-detail-strip__explanation">{pNode.explanation}</p>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
};

// ── Inline shell styles (injected once, no external CSS loader needed) ────────

const shellStyles = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-foreground, #cccccc);
    font-family: var(--vscode-font-family, -apple-system, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    height: 100vh;
    overflow: hidden;
  }
  .rf-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  .rf-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
    background: var(--vscode-sideBar-background, #252526);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .rf-header__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground, #ccc);
  }
  .rf-header__subtitle {
    font-size: 12px;
    color: var(--vscode-descriptionForeground, #888);
    flex: 1;
  }
  .rf-header__confidence {
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #888);
  }
  .rf-graph-area {
    flex: 1;
    overflow: auto;
    padding: 8px;
  }
  .rf-loading, .rf-error, .rf-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 12px;
    padding: 2rem;
    color: var(--vscode-descriptionForeground, #888);
  }
  .rf-loading__spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--vscode-panel-border, #555);
    border-top-color: var(--vscode-focusBorder, #007acc);
    border-radius: 50%;
    animation: rf-spin 0.8s linear infinite;
  }
  @keyframes rf-spin { to { transform: rotate(360deg); } }
  .rf-button {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none;
    padding: 5px 14px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
  }
  .rf-button:hover { opacity: 0.9; }
  .rf-tooltip {
    position: fixed;
    z-index: 1000;
    background: var(--vscode-editorWidget-background, #252526);
    border: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
    border-radius: 3px;
    padding: 6px 10px;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    max-width: 260px;
  }
  .rf-tooltip__symbol { font-weight: 600; font-size: 12px; }
  .rf-tooltip__file { font-size: 11px; color: var(--vscode-descriptionForeground, #888); margin-top: 2px; }
  .rf-tooltip__role {
    display: inline-block;
    margin-top: 4px;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .rf-tooltip__role--origin    { background: #e0525230; color: #e05252; }
  .rf-tooltip__role--propagation { background: #d4a01730; color: #d4a017; }
  .rf-tooltip__role--failure   { background: #c0392b30; color: #c0392b; }
  .rf-tooltip__role--related   { background: #8e9aad30; color: #8e9aad; }
  .rf-detail-strip {
    border-top: 1px solid var(--vscode-panel-border, #3c3c3c);
    background: var(--vscode-sideBar-background, #252526);
    padding: 8px 16px;
    flex-shrink: 0;
    font-size: 12px;
  }
  .rf-detail-strip__header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .rf-detail-strip__location { color: var(--vscode-descriptionForeground, #888); flex: 1; }
  .rf-detail-strip__close {
    background: none; border: none; cursor: pointer;
    color: var(--vscode-foreground, #ccc); font-size: 16px; line-height: 1;
    margin-left: auto;
  }
  .rf-detail-strip__explanation { margin: 6px 0 0; color: var(--vscode-foreground, #ccc); }
  .rf-badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .rf-badge--origin      { background: #e0525230; color: #e05252; }
  .rf-badge--propagation { background: #d4a01730; color: #d4a017; }
  .rf-badge--failure     { background: #c0392b30; color: #c0392b; }
  .rf-badge--related     { background: #8e9aad30; color: #8e9aad; }
  code { font-family: var(--vscode-editor-font-family, monospace); }
`;

// ── Mount ─────────────────────────────────────────────────────────────────────

const styleEl = document.createElement("style");
styleEl.textContent = shellStyles;
document.head.appendChild(styleEl);

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}


### 🤖 Assistant

> 🔧 called: read_file

Now the esbuild config needs to handle CSS files. Let me check if it currently supports CSS import:

> 🔧 **read_file** — extension/esbuild.js

### 🤖 Assistant

> 🔧 called: apply_diff

The webview config doesn't output CSS separately. esbuild supports CSS injection into the JS bundle with the `loader` option. I need to add CSS loading support and set up a CSS output file so the webview HTML can load it. Let me update esbuild.js to handle CSS:

> 🔧 **apply_diff** — extension/esbuild.js

### 🤖 Assistant

> 🔧 called: update_todo_list

Now let's build the webview bundle to verify everything compiles:

> 🔧 **update_todo_list** — [x] Sub-Task 6 — Webview: Metro-Style Visualization (D3 + SVG)
[x] 6.1 Create useMetroLayout.ts hook — computes spine + branch node positions
[x] 6.2 Create MetroLine.tsx — SVG curved paths between spine nodes
[x] 6.3 Create StationNode.tsx — role-specific shapes (circle, diamond, square)
[x] 6.4 Create MetroGraph.tsx — main component wiring D3 force layout + zoom/pan
[x] 6.5 Add metro.css — role-based color palette + VS Code theme variables
[x] 6.6 Update index.tsx webview entry to import MetroGraph
[-] 6.7 Build the webview bundle and verify it compiles
[ ] 6.8 Update rootflow-plan.md Sub-Task 6 status to complete


### 🤖 Assistant

> 🔧 called: execute_command



> 🔧 **execute_command** — node esbuild.js --webview 2>&1

### 🤖 Assistant

> 🔧 called: execute_command

Clean build. Let me verify the output artefacts were produced:

> 🔧 **execute_command** — Get-ChildItem dist\ | Select-Object Name, Length, LastWriteTime

### 🤖 Assistant

> 🔧 called: apply_diff

Both `webview.js` and `webview.css` are emitted. Now update the plan file:

> 🔧 **apply_diff** — rootflow-plan.md

### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — [x] Sub-Task 6 — Webview: Metro-Style Visualization (D3 + SVG)
[x] 6.1 Create useMetroLayout.ts hook — computes spine + branch node positions
[x] 6.2 Create MetroLine.tsx — SVG curved paths between spine nodes
[x] 6.3 Create StationNode.tsx — role-specific shapes (circle, diamond, square)
[x] 6.4 Create MetroGraph.tsx — main component wiring D3 force layout + zoom/pan
[x] 6.5 Add metro.css — role-based color palette + VS Code theme variables
[x] 6.6 Update index.tsx webview entry to import MetroGraph
[x] 6.7 Build the webview bundle and verify it compiles
[x] 6.8 Update rootflow-plan.md Sub-Task 6 status to complete


### 🤖 Assistant

Sub-Task 6 is complete. Here's a summary of everything implemented:

---

### What was built

**5 new files** in [`extension/src/webview/`](extension/src/webview/):

| File | Purpose |
|------|---------|
| [`useMetroLayout.ts`](extension/src/webview/useMetroLayout.ts) | `useMemo` hook — places causal nodes on a horizontal spine at equal steps, branches related nodes above/below their nearest spine neighbour, returns `PositionedNode[]` + bounding dimensions |
| [`MetroLine.tsx`](extension/src/webview/MetroLine.tsx) | Renders SVG `<path>` tracks between nodes — near-horizontal edges get Bézier control handles, branch edges get S-curves; colour follows the source node's role |
| [`StationNode.tsx`](extension/src/webview/StationNode.tsx) | Renders role-specific station shapes: **origin** = red circle with inner dot; **propagation** = yellow diamond; **failure** = red rounded square with × mark; **related** = small dashed grey circle |
| [`MetroGraph.tsx`](extension/src/webview/MetroGraph.tsx) | Main component — wires `useMetroLayout`, `<MetroLine>`, `<StationNode>`, and D3 `zoom` behaviour; exposes `onNodeClick` / `onNodeHover` callbacks; includes a role legend |
| [`metro.css`](extension/src/webview/metro.css) | Role-based CSS custom properties (`--rf-color-*`); dark/light/high-contrast overrides via VS Code body class; `.metro-graph`, `.station-node`, `.edge-label` styles |

**2 updated files:**

- [`index.tsx`](extension/src/webview/index.tsx) — replaced the stub with a full `App` that listens for `loadResult` / `loading` / `error` messages, holds `selectedNode` + `tooltip` state, renders `MetroGraph` in a header/graph/detail-strip shell, and injects all shell CSS at runtime (no external loader needed)
- [`esbuild.js`](extension/esbuild.js) — added `loader: { ".css": "css" }` so `import "./metro.css"` is bundled into `dist/webview.css`

Build output: `dist/webview.js` (1.1 MB) + `dist/webview.css` (2.3 KB) — zero errors.