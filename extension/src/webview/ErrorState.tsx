/**
 * ErrorState.tsx
 *
 * Full-panel error state displayed when the backend returns an error or is
 * unreachable.  Shows:
 *   - An error icon (SVG inline, no external assets)
 *   - The human-readable error message from the server
 *   - A "Retry" button that posts { command: 'retry' } to the extension host
 *
 * All colours reference VS Code CSS custom properties so the component
 * respects both dark and light themes automatically.
 */

import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ErrorStateProps {
  /** The error message to display (from the backend or extension host). */
  message: string;
  /** Called when the user clicks the Retry button. */
  onRetry: () => void;
}

// ─── Inline SVG error icon ────────────────────────────────────────────────────

const ErrorIcon: React.FC = () => (
  <svg
    width={40}
    height={40}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <circle cx={12} cy={12} r={10} fill="var(--vscode-inputValidation-errorBackground, rgba(241,76,76,0.15))" />
    <circle cx={12} cy={12} r={10} stroke="var(--vscode-inputValidation-errorBorder, #f14c4c)" strokeWidth={1.5} />
    {/* Exclamation mark — stem */}
    <line
      x1={12} y1={7.5}
      x2={12} y2={13.5}
      stroke="var(--vscode-inputValidation-errorBorder, #f14c4c)"
      strokeWidth={2}
      strokeLinecap="round"
    />
    {/* Exclamation mark — dot */}
    <circle cx={12} cy={16.5} r={1.1} fill="var(--vscode-inputValidation-errorBorder, #f14c4c)" />
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        gap: 12,
        padding: "2rem",
        color: "var(--vscode-foreground, #cccccc)",
        textAlign: "center",
      }}
      role="alert"
      aria-live="assertive"
    >
      <ErrorIcon />

      <strong
        style={{
          fontSize: 14,
          color: "var(--vscode-foreground, #ccc)",
        }}
      >
        Analysis failed
      </strong>

      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "var(--vscode-descriptionForeground, #888)",
          maxWidth: 420,
          lineHeight: 1.6,
          wordBreak: "break-word",
        }}
      >
        {message}
      </p>

      <button
        className="rf-button"
        onClick={onRetry}
        style={{ marginTop: 8 }}
        aria-label="Retry analysis"
      >
        Retry
      </button>
    </div>
  );
};

export default ErrorState;
