/**
 * FixPanel.tsx
 *
 * Side-panel section that surfaces the LLM-suggested fix.
 *
 * Always rendered when `suggestedFix` is present (non-dismissable).
 * Shows:
 *   - Confidence score badge
 *   - Fix description text
 *   - DiffView: syntax-coloured unified diff
 *   - "Apply Fix" button
 *   - Introducing commit block at the bottom (always shown when available)
 */

import React from "react";
import type { SuggestedFix } from "shared/schema";
import DiffView from "./DiffView";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FixPanelProps {
  fix: SuggestedFix;
  explanation: string;
  /** 0.0 – 1.0 confidence from rootCause */
  confidenceScore: number;
  /** Called when the user clicks "Apply Fix" */
  onApply: (fix: SuggestedFix) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confidenceClass(score: number): string {
  if (score >= 0.75) return "rf-fix__badge--high";
  if (score >= 0.45) return "rf-fix__badge--medium";
  return "rf-fix__badge--low";
}

function confidenceLabel(score: number): string {
  return `${Math.round(score * 100)}% confidence`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const FixPanel: React.FC<FixPanelProps> = ({
  fix,
  explanation,
  confidenceScore,
  onApply,
}) => {
  return (
    <section className="rf-fix" aria-label="Suggested fix">
      {/* ── Header row ───────────────────────────────────────────────────── */}
      <div className="rf-fix__header">
        <span className="rf-fix__title">Suggested Fix</span>
        <span className={`rf-fix__badge ${confidenceClass(confidenceScore)}`}>
          {confidenceLabel(confidenceScore)}
        </span>
        <div className="rf-fix__actions">
          <button
            className="rf-button rf-fix__apply-btn"
            onClick={() => onApply(fix)}
            title="Apply the suggested patch to the workspace file"
          >
            Apply Fix
          </button>
        </div>
      </div>

      {/* ── Description ──────────────────────────────────────────────────── */}
      {fix.description && (
        <p className="rf-fix__description">{fix.description}</p>
      )}
      {explanation && !fix.description && (
        <p className="rf-fix__description">{explanation}</p>
      )}

      {/* ── File path ────────────────────────────────────────────────────── */}
      <div className="rf-fix__filepath">
        <span className="rf-fix__filepath-label">File</span>
        <code className="rf-fix__filepath-value">{fix.filePath}</code>
      </div>

      {/* ── Diff view ────────────────────────────────────────────────────── */}
      <div className="rf-fix__diff">
        <div className="rf-fix__diff-label">Patch</div>
        <DiffView patch={fix.patch} />
      </div>

    </section>
  );
};

export default FixPanel;
