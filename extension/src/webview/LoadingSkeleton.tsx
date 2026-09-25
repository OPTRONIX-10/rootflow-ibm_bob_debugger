/**
 * LoadingSkeleton.tsx
 *
 * Animated placeholder shown while the backend analysis is in progress.
 * Replicates the metro graph layout with pulsing skeleton shapes so the
 * user sees a structural preview rather than a blank or spinning screen.
 *
 * All colours reference VS Code CSS custom properties so the skeleton
 * respects both dark and light themes automatically.
 */

import React from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SKELETON_STYLE = `
  @keyframes rf-skeleton-pulse {
    0%   { opacity: 1; }
    50%  { opacity: 0.4; }
    100% { opacity: 1; }
  }
  .rf-skeleton__pulse {
    animation: rf-skeleton-pulse 1.6s ease-in-out infinite;
  }
  .rf-skeleton__pulse--delay1 { animation-delay: 0.2s; }
  .rf-skeleton__pulse--delay2 { animation-delay: 0.4s; }
  .rf-skeleton__pulse--delay3 { animation-delay: 0.6s; }
  .rf-skeleton__pulse--delay4 { animation-delay: 0.8s; }
`;

/** A single skeleton station node */
const SkeletonNode: React.FC<{
  x: number;
  y: number;
  role: "origin" | "propagation" | "failure" | "related";
  delayClass?: string;
}> = ({ x, y, role, delayClass = "" }) => {
  const fill = "var(--vscode-editor-inactiveSelectionBackground, #3c3c3c)";
  const size = role === "related" ? 14 : 20;

  let shape: React.ReactNode;
  if (role === "origin" || role === "related") {
    shape = (
      <circle cx={x} cy={y} r={size} fill={fill} className={`rf-skeleton__pulse ${delayClass}`} />
    );
  } else if (role === "propagation") {
    const pts = `${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`;
    shape = (
      <polygon points={pts} fill={fill} className={`rf-skeleton__pulse ${delayClass}`} />
    );
  } else {
    shape = (
      <rect
        x={x - size}
        y={y - size}
        width={size * 2}
        height={size * 2}
        rx={5}
        fill={fill}
        className={`rf-skeleton__pulse ${delayClass}`}
      />
    );
  }

  return (
    <g>
      {shape}
      {/* Label placeholder bar */}
      <rect
        x={x - 30}
        y={y + size + 6}
        width={60}
        height={8}
        rx={4}
        fill={fill}
        opacity={0.6}
        className={`rf-skeleton__pulse ${delayClass}`}
      />
    </g>
  );
};

/** A skeleton connector line between two spine nodes */
const SkeletonLine: React.FC<{ x1: number; y1: number; x2: number; y2: number }> = ({
  x1, y1, x2, y2,
}) => (
  <line
    x1={x1} y1={y1} x2={x2} y2={y2}
    stroke="var(--vscode-editor-inactiveSelectionBackground, #3c3c3c)"
    strokeWidth={6}
    strokeLinecap="round"
    className="rf-skeleton__pulse"
  />
);

// ─── Main component ───────────────────────────────────────────────────────────

const LoadingSkeleton: React.FC = () => {
  // Simulate a 4-node spine: origin → propagation → propagation → failure
  // plus 2 related nodes hanging off the second spine node
  const spineY = 160;
  const spineNodes = [
    { x: 80,  y: spineY, role: "origin" as const,      delayClass: "" },
    { x: 240, y: spineY, role: "propagation" as const,  delayClass: "rf-skeleton__pulse--delay1" },
    { x: 400, y: spineY, role: "propagation" as const,  delayClass: "rf-skeleton__pulse--delay2" },
    { x: 560, y: spineY, role: "failure" as const,      delayClass: "rf-skeleton__pulse--delay3" },
  ];
  const relatedNodes = [
    { x: 240, y: spineY - 110, role: "related" as const, delayClass: "rf-skeleton__pulse--delay2" },
    { x: 400, y: spineY + 110, role: "related" as const, delayClass: "rf-skeleton__pulse--delay3" },
  ];
  const branchLines = [
    { x1: 240, y1: spineY, x2: 240, y2: spineY - 110 },
    { x1: 400, y1: spineY, x2: 400, y2: spineY + 110 },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        padding: "2rem",
      }}
      aria-busy="true"
      aria-label="Analyzing…"
    >
      {/* Inject keyframe styles */}
      <style>{SKELETON_STYLE}</style>

      {/* Legend skeleton */}
      <div
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 16,
          alignSelf: "flex-start",
          paddingLeft: 12,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "var(--vscode-editor-inactiveSelectionBackground, #3c3c3c)",
                display: "inline-block",
                animation: "rf-skeleton-pulse 1.6s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            />
            <span
              style={{
                width: 60,
                height: 8,
                borderRadius: 4,
                background: "var(--vscode-editor-inactiveSelectionBackground, #3c3c3c)",
                display: "inline-block",
                opacity: 0.6,
                animation: "rf-skeleton-pulse 1.6s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          </span>
        ))}
      </div>

      {/* SVG skeleton graph */}
      <svg
        width="100%"
        viewBox="0 0 660 320"
        aria-hidden="true"
        style={{ maxWidth: 680 }}
      >
        {/* Spine connector lines */}
        {spineNodes.slice(0, -1).map((n, i) => (
          <SkeletonLine
            key={`spine-${i}`}
            x1={n.x}
            y1={n.y}
            x2={spineNodes[i + 1].x}
            y2={spineNodes[i + 1].y}
          />
        ))}

        {/* Branch connector lines */}
        {branchLines.map((l, i) => (
          <SkeletonLine key={`branch-${i}`} {...l} />
        ))}

        {/* Spine nodes */}
        {spineNodes.map((n, i) => (
          <SkeletonNode key={`spine-node-${i}`} {...n} />
        ))}

        {/* Related nodes */}
        {relatedNodes.map((n, i) => (
          <SkeletonNode key={`related-node-${i}`} {...n} />
        ))}
      </svg>

      {/* Status text */}
      <p
        style={{
          marginTop: 20,
          fontSize: 12,
          color: "var(--vscode-descriptionForeground, #888)",
          animation: "rf-skeleton-pulse 1.6s ease-in-out infinite",
        }}
      >
        Analyzing codebase…
      </p>
    </div>
  );
};

export default LoadingSkeleton;
