/**
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
