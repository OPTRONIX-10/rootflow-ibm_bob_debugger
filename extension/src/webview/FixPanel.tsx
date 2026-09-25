/**
 * FixPanel.tsx
 *
 * Bottom-sheet panel that surfaces the LLM-suggested fix for the analyzed bug.
 *
 * Always rendered when `suggestedFix` is present and the panel has not been
 * dismissed.  Shows:
 *   - Confidence score badge (from rootCause.confidenceScore)
 *   - Fix description text
 *   - DiffView: syntax-coloured unified diff of originalCode → fixedCode
 *   - "Apply Fix" button → posts { command: 'applyFix', filePath, originalCode, fixedCode, patch }
 *   - "Dismiss" button → hides the panel without modifying the file
 *
 * The panel is purely presentational; the parent (App / index.tsx) supplies
 * the `onApply` and `onDismiss` callbacks.
 */

import React from "react";
import type { SuggestedFix } from "shared/schema";
import DiffView from "./DiffView";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FixPanelProps {
  fix: SuggestedFix;
  /** 0.0 – 1.0 confidence from rootCause */
  confidenceScore: number;
  /** Called when the user clicks "Apply Fix" */
  onApply: (fix: SuggestedFix) => void;
  /** Called when the user clicks "Dismiss" */
  onDismiss: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Maps a 0–1 confidence score to a CSS modifier class. */
function confidenceClass(score: number): string {
  if (score >= 0.75) return "rf-fix__badge--high";
  if (score >= 0.45) return "rf-fix__badge--medium";
  return "rf-fix__badge--low";
}

/** Formats a 0–1 confidence score as a percentage string. */
function confidenceLabel(score: number): string {
  return `${Math.round(score * 100)}% confidence`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const FixPanel: React.FC<FixPanelProps> = ({
  fix,
  confidenceScore,
  onApply,
  onDismiss,
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
          <button
            className="rf-button rf-button--secondary rf-fix__dismiss-btn"
            onClick={onDismiss}
            title="Dismiss this suggestion without applying"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* ── Description ──────────────────────────────────────────────────── */}
      {fix.description && (
        <p className="rf-fix__description">{fix.description}</p>
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
