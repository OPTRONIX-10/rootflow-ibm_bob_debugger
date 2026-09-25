/**
 * DiffView.tsx
 *
 * Renders a unified diff string as a syntax-coloured block.
 *
 * Line colouring rules:
 *   + lines (additions, excluding +++)  → green
 *   - lines (deletions, excluding ---)  → red
 *   @@ hunk headers                    → muted / blue
 *   everything else                    → default foreground
 *
 * All colours reference VS Code CSS custom properties so the block
 * respects both dark and light themes automatically.
 */

import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiffViewProps {
  /** Unified diff string (e.g. suggestedFix.patch) */
  patch: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type LineKind = "add" | "del" | "hunk" | "header" | "context";

function classifyLine(line: string): LineKind {
  if (line.startsWith("+++") || line.startsWith("---")) return "header";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  if (line.startsWith("@@")) return "hunk";
  return "context";
}

const KIND_CLASS: Record<LineKind, string> = {
  add: "rf-diff__line rf-diff__line--add",
  del: "rf-diff__line rf-diff__line--del",
  hunk: "rf-diff__line rf-diff__line--hunk",
  header: "rf-diff__line rf-diff__line--header",
  context: "rf-diff__line",
};

// ─── Component ────────────────────────────────────────────────────────────────

const DiffView: React.FC<DiffViewProps> = ({ patch }) => {
  if (!patch || !patch.trim()) {
    return (
      <p className="rf-diff__empty">No diff available.</p>
    );
  }

  const lines = patch.split("\n");

  return (
    <pre className="rf-diff__pre">
      <code className="rf-diff__code">
        {lines.map((line, i) => {
          const kind = classifyLine(line);
          return (
            <span key={i} className={KIND_CLASS[kind]}>
              {line}
              {"\n"}
            </span>
          );
        })}
      </code>
    </pre>
  );
};

export default DiffView;
