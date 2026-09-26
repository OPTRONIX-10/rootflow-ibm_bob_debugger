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
import type { SuggestedFix, CommitInfo } from "shared/schema";
import DiffView from "./DiffView";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FixPanelProps {
  fix: SuggestedFix;
  /** 0.0 – 1.0 confidence from rootCause */
  confidenceScore: number;
  /** Commit that introduced the bug (always shown at bottom, regardless of selected node) */
  commitInfo: CommitInfo | null;
  /** Called when the user clicks "Apply Fix" */
  onApply: (fix: SuggestedFix) => void;
  /** Called when the user clicks a commit hash */
  onOpenDiff: (hash: string) => void;
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
  confidenceScore,
  commitInfo,
  onApply,
  onOpenDiff,
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

      {/* ── Introducing commit (always shown at bottom when available) ───── */}
      {commitInfo && (
        <div className="rf-fix__commit">
          <div className="rf-fix__commit-title">Bug-Introducing Commit</div>
          <div className="rf-fix__commit-meta">
            <span className="rf-fix__commit-label">Hash</span>
            <button
              className="rf-fix__commit-hash"
              onClick={() => onOpenDiff(commitInfo.hash)}
              title="Open diff in Source Control"
            >
              {commitInfo.hash.slice(0, 8)}
            </button>
          </div>
          <div className="rf-fix__commit-meta">
            <span className="rf-fix__commit-label">Author</span>
            <span className="rf-fix__commit-value">{commitInfo.author}</span>
          </div>
          <div className="rf-fix__commit-meta">
            <span className="rf-fix__commit-label">Date</span>
            <span className="rf-fix__commit-value">{commitInfo.date}</span>
          </div>
          <div className="rf-fix__commit-meta">
            <span className="rf-fix__commit-label">Message</span>
            <span className="rf-fix__commit-value rf-fix__commit-message">
              {commitInfo.message}
            </span>
          </div>
          {commitInfo.diff && (
            <details className="rf-fix__commit-diff-details">
              <summary className="rf-fix__commit-diff-summary">Show diff</summary>
              <pre className="rf-fix__commit-diff-pre">
                <code className="rf-fix__commit-diff-code">
                  {commitInfo.diff.split("\n").map((line, i) => {
                    let cls = "rf-ndp__diff-line";
                    if (line.startsWith("+") && !line.startsWith("+++")) cls += " rf-ndp__diff-line--add";
                    else if (line.startsWith("-") && !line.startsWith("---")) cls += " rf-ndp__diff-line--del";
                    else if (line.startsWith("@@")) cls += " rf-ndp__diff-line--hunk";
                    return (
                      <span key={i} className={cls}>
                        {line}
                        {"\n"}
                      </span>
                    );
                  })}
                </code>
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
};

export default FixPanel;
