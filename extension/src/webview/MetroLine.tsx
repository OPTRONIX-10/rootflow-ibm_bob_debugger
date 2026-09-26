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
  propagationPath: PositionedNode[];
}

/** Pick a track colour based on the source node's role. */
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

const MetroLine: React.FC<MetroLineProps> = ({
  edges,
  nodeMap,
  propagationPath,
}) => {
  const causalNodes = propagationPath.filter((node) => node.role !== "related");
  const trainPath = causalNodes
    .map((node, index) => `${index === 0 ? "M" : "L"} ${node.x} ${node.y}`)
    .join(" ");

  return (
    <g className="metro-lines">
      {causalNodes.length > 1 && (
        <g className="metro-train" aria-label="Bug propagation train">
          <path
            d={trainPath}
            fill="none"
            stroke="var(--rf-color-route, #f3b23c)"
            strokeWidth={12}
            strokeLinecap="round"
            opacity={0.18}
          />
          <path
            d={trainPath}
            fill="none"
            stroke="var(--rf-color-route, #f3b23c)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray="12 10"
            className="metro-train__animated-track"
          />
          <g className="metro-train__car">
            <rect x={-15} y={-9} width={30} height={18} rx={6} fill="#f3b23c" stroke="#1d2430" strokeWidth={2} />
            <rect x={-8} y={-5} width={7} height={6} rx={1.5} fill="#17324d" />
            <rect x={2} y={-5} width={7} height={6} rx={1.5} fill="#17324d" />
            <circle cx={-8} cy={9} r={3} fill="#1d2430" />
            <circle cx={8} cy={9} r={3} fill="#1d2430" />
            <animateMotion dur="5s" repeatCount="indefinite" rotate="auto" path={trainPath} />
          </g>
        </g>
      )}
      {edges.map((edge) => {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) return null;

        const related = src.role === "related" || tgt.role === "related";
        const color = related
          ? "var(--rf-color-related, #ffffff)"
          : "var(--rf-color-route, #f3b23c)";
        const d = buildPath(src.x, src.y, tgt.x, tgt.y);
        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y + tgt.y) / 2;

        return (
          <g key={`${edge.source}-${edge.target}`}>
            <path
              d={d}
              stroke={color}
              strokeWidth={related ? 2 : 6}
              fill="none"
              strokeLinecap="round"
              opacity={related ? 0.35 : 0.95}
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
