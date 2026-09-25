/**
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
