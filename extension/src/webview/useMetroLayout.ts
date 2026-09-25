/**
 * useMetroLayout.ts
 *
 * Computes 2D positions for a metro-style graph layout.
 *
 * Strategy:
 *   - Causal nodes (origin → propagation… → failure) are placed on a central
 *     horizontal spine with equal spacing.
 *   - Related nodes are placed in a row above or below their nearest spine node,
 *     alternating to avoid overlapping.
 */

import { useMemo } from "react";
import type { GraphNode, GraphEdge, PropagationNode } from "shared/schema";

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

export interface MetroLayout {
  nodes: PositionedNode[];
  width: number;
  height: number;
}

const SPINE_Y = 200;          // vertical center of the spine
const SPINE_X_START = 80;     // left margin for first spine node
const SPINE_STEP = 180;       // horizontal gap between spine nodes
const BRANCH_OFFSET = 120;    // vertical distance from spine to branch node
const NODE_RADIUS = 24;       // bounding radius used for sizing the SVG

/**
 * Build an ordered list of node IDs along the causal spine, derived from
 * propagationPath ordering (origin first, failure last).
 */
function buildSpineOrder(
  propagationPath: PropagationNode[],
  nodes: GraphNode[]
): string[] {
  // Use the propagation path order if provided
  if (propagationPath.length > 0) {
    const ids = propagationPath.map((p) => p.id);
    // Append any causal nodes that appear in graph.nodes but not yet in the list
    // (shouldn't normally happen, but be safe)
    nodes.forEach((n) => {
      if (
        (n.role === "origin" || n.role === "propagation" || n.role === "failure") &&
        !ids.includes(n.id)
      ) {
        ids.push(n.id);
      }
    });
    return ids;
  }

  // Fallback: sort by role order
  const order: Record<string, number> = { origin: 0, propagation: 1, failure: 2, related: 3 };
  return nodes
    .filter((n) => n.role !== "related")
    .sort((a, b) => order[a.role] - order[b.role])
    .map((n) => n.id);
}

export function useMetroLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  propagationPath: PropagationNode[]
): MetroLayout {
  return useMemo(() => {
    if (nodes.length === 0) {
      return { nodes: [], width: 400, height: 400 };
    }

    const spineIds = buildSpineOrder(propagationPath, nodes);
    const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]));

    // Assign spine positions
    const posMap = new Map<string, { x: number; y: number }>();
    spineIds.forEach((id, i) => {
      posMap.set(id, { x: SPINE_X_START + i * SPINE_STEP, y: SPINE_Y });
    });

    // Assign related node positions — offset vertically from nearest spine neighbour
    const relatedNodes = nodes.filter((n) => n.role === "related");
    // Count how many related nodes are already attached above/below each spine node
    const aboveCount = new Map<string, number>();
    const belowCount = new Map<string, number>();

    relatedNodes.forEach((rn) => {
      // Find the spine node connected to this related node via edges
      const connectedSpineId = findNearestSpineId(rn.id, edges, spineIds);
      const spinePos = connectedSpineId ? posMap.get(connectedSpineId) : null;

      const above = aboveCount.get(connectedSpineId ?? "") ?? 0;
      const below = belowCount.get(connectedSpineId ?? "") ?? 0;

      let x: number;
      let y: number;

      if (spinePos) {
        // Alternate above/below
        if (above <= below) {
          y = SPINE_Y - BRANCH_OFFSET * (above + 1);
          aboveCount.set(connectedSpineId!, above + 1);
        } else {
          y = SPINE_Y + BRANCH_OFFSET * (below + 1);
          belowCount.set(connectedSpineId!, below + 1);
        }
        x = spinePos.x;
      } else {
        // No direct edge to spine — place to the right of the last spine node
        const lastSpineX =
          spineIds.length > 0
            ? SPINE_X_START + (spineIds.length - 1) * SPINE_STEP
            : SPINE_X_START;
        x = lastSpineX + SPINE_STEP;
        y = SPINE_Y + BRANCH_OFFSET;
      }

      posMap.set(rn.id, { x, y });
    });

    const positionedNodes: PositionedNode[] = nodes.map((n) => {
      const pos = posMap.get(n.id) ?? { x: 0, y: SPINE_Y };
      return { ...n, x: pos.x, y: pos.y };
    });

    // Compute bounding box
    const xs = positionedNodes.map((n) => n.x);
    const ys = positionedNodes.map((n) => n.y);
    const maxX = Math.max(...xs) + NODE_RADIUS + 80;
    const maxY = Math.max(...ys) + NODE_RADIUS + 80;
    const minY = Math.min(...ys) - NODE_RADIUS - 60;
    const height = maxY - minY + 120;

    return { nodes: positionedNodes, width: maxX + 40, height: Math.max(height, 300) };
  }, [nodes, edges, propagationPath]);
}

/** Find which spine node is directly connected to `nodeId` via an edge. */
function findNearestSpineId(
  nodeId: string,
  edges: GraphEdge[],
  spineIds: string[]
): string | undefined {
  for (const edge of edges) {
    if (edge.source === nodeId && spineIds.includes(edge.target)) {
      return edge.target;
    }
    if (edge.target === nodeId && spineIds.includes(edge.source)) {
      return edge.source;
    }
  }
  return undefined;
}
