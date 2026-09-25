/**
 * Tooltip.tsx
 *
 * A lightweight absolutely-positioned tooltip shown when hovering a station node.
 * Displays the symbol name, file:line, and role badge.
 *
 * Positioning: the parent container must be `position: relative` (or the
 * webview root must be the positioning context).  The tooltip follows the
 * mouse cursor via clientX/clientY injected by the hover handler in App.
 */

import React from "react";
import type { GraphNode } from "shared/schema";

export interface TooltipProps {
  node: GraphNode;
  /** Viewport X coordinate of the mouse cursor when the hover event fired. */
  x: number;
  /** Viewport Y coordinate of the mouse cursor when the hover event fired. */
  y: number;
}

const Tooltip: React.FC<TooltipProps> = ({ node, x, y }) => {
  return (
    <div
      className="rf-tooltip"
      style={{
        position: "fixed",
        left: x + 14,
        top: y - 12,
        zIndex: 1000,
        pointerEvents: "none",
      }}
      role="tooltip"
      aria-live="polite"
    >
      <div className="rf-tooltip__symbol">{node.symbol}</div>
      <div className="rf-tooltip__file">
        {node.file}:{node.line}
      </div>
      <div className={`rf-tooltip__role rf-tooltip__role--${node.role}`}>
        {node.role}
      </div>
    </div>
  );
};

export default Tooltip;
