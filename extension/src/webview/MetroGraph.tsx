/**
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

  // Build spine track: a background line connecting all spine (non-related) nodes
  const spineNodes = layout.nodes.filter((n) => n.role !== "related");
  const spineY = spineNodes.length > 0 ? spineNodes[0].y : 200;
  const spineXs = spineNodes.map((n) => n.x).sort((a, b) => a - b);
  const spineTrackX1 = spineXs.length > 0 ? spineXs[0] : 0;
  const spineTrackX2 = spineXs.length > 0 ? spineXs[spineXs.length - 1] : 0;

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
          {/* Spine background track — a thick muted line behind the main stations */}
          {spineXs.length > 1 && (
            <line
              x1={spineTrackX1}
              y1={spineY}
              x2={spineTrackX2}
              y2={spineY}
              stroke="var(--rf-color-spine-track, #4c9be8)"
              strokeWidth={6}
              strokeLinecap="round"
              opacity={0.25}
            />
          )}

          {/* Causal-path lines (coloured by role) */}
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
