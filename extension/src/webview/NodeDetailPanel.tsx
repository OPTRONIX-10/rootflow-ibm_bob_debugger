/**
 * NodeDetailPanel.tsx
 *
 * Slide-in detail panel displayed on the right side of the Webview when a
 * StationNode is clicked.  Shows:
 *   - File path + line number (clickable → sends openFile message to host)
 *   - Role badge
 *   - Syntax-highlighted code snippet (highlight.js, auto-language detection)
 *   - Explanation text from the matching PropagationNode
 *   - For the origin node: the full introducedByCommit block with a clickable
 *     commit hash that sends openDiff to the host
 *
 * The panel is purely presentational; all interaction callbacks (openFile,
 * openDiff, onClose) are injected by the parent (App / index.tsx).
 */

import React, { useEffect, useRef } from "react";
import type { GraphNode, PropagationNode, CommitInfo } from "shared/schema";

// ─── highlight.js import ─────────────────────────────────────────────────────
// Only import the core + languages we actually need to keep the bundle lean.
// The webview bundle is browser-side so dynamic import is fine, but we use
// static imports to keep esbuild happy and avoid async first-render flash.
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";

hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NodeDetailPanelProps {
  node: GraphNode;
  propagationNode: PropagationNode | null;
  commitInfo: CommitInfo | null;
  /** Called when user clicks the file path / line link */
  onOpenFile: (file: string, line: number) => void;
  /** Called when user clicks the commit hash */
  onOpenDiff: (hash: string) => void;
  /** Called when user closes the panel */
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a highlight.js language hint from a file extension. */
function langFromFile(file: string): string {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    py: "python",
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
  };
  return map[ext] ?? "plaintext";
}

/** Shorten a full file path to the last 3 segments for display. */
function shortPath(file: string): string {
  const parts = file.replace(/\\/g, "/").split("/");
  return parts.slice(-3).join("/");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Syntax-highlighted code block using highlight.js. */
const CodeBlock: React.FC<{ code: string; file: string }> = ({ code, file }) => {
  const codeRef = useRef<HTMLElement>(null);
  const lang = langFromFile(file);

  useEffect(() => {
    const el = codeRef.current;
    if (!el) return;
    el.removeAttribute("data-highlighted");
    try {
      if (lang !== "plaintext") {
        const result = hljs.highlight(code, { language: lang });
        el.innerHTML = result.value;
      } else {
        el.textContent = code;
      }
      el.setAttribute("data-highlighted", "yes");
    } catch {
      el.textContent = code;
    }
  }, [code, lang]);

  return (
    <pre className="rf-ndp__code-pre">
      <code ref={codeRef} className={`rf-ndp__code language-${lang}`} />
    </pre>
  );
};

/** Commit info block rendered for the origin node. */
const CommitBlock: React.FC<{
  commit: CommitInfo;
  onOpenDiff: (hash: string) => void;
}> = ({ commit, onOpenDiff }) => (
  <div className="rf-ndp__commit">
    <div className="rf-ndp__section-title">Introducing Commit</div>
    <div className="rf-ndp__commit-meta">
      <span className="rf-ndp__commit-field-label">Hash</span>
      <button
        className="rf-ndp__commit-hash"
        onClick={() => onOpenDiff(commit.hash)}
        title="Open diff in Source Control"
      >
        {commit.hash.slice(0, 8)}
      </button>
    </div>
    <div className="rf-ndp__commit-meta">
      <span className="rf-ndp__commit-field-label">Author</span>
      <span className="rf-ndp__commit-value">{commit.author}</span>
    </div>
    <div className="rf-ndp__commit-meta">
      <span className="rf-ndp__commit-field-label">Date</span>
      <span className="rf-ndp__commit-value">{commit.date}</span>
    </div>
    <div className="rf-ndp__commit-meta">
      <span className="rf-ndp__commit-field-label">Message</span>
      <span className="rf-ndp__commit-value rf-ndp__commit-message">
        {commit.message}
      </span>
    </div>
    {commit.diff && (
      <details className="rf-ndp__diff-details">
        <summary className="rf-ndp__diff-summary">Show diff</summary>
        <pre className="rf-ndp__diff-pre">
          <code className="rf-ndp__diff-code">
            {commit.diff.split("\n").map((line, i) => {
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
);

// ─── Main component ───────────────────────────────────────────────────────────

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  node,
  propagationNode,
  commitInfo,
  onOpenFile,
  onOpenDiff,
  onClose,
}) => {
  const explanation = propagationNode?.explanation ?? "";
  // Use the snippet stored on the propagation node when available,
  // otherwise fall back to a placeholder so the code block always renders.
  const snippet = (propagationNode as (PropagationNode & { snippet?: string }) | null)?.snippet ?? "";
  const hasCode = snippet.trim().length > 0;

  return (
    <aside className="rf-ndp" aria-label={`Detail: ${node.symbol}`}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="rf-ndp__header">
        <span className={`rf-badge rf-badge--${node.role}`}>{node.role}</span>
        <span className="rf-ndp__symbol" title={node.symbol}>
          {node.symbol}
        </span>
        <button
          className="rf-ndp__close"
          onClick={onClose}
          aria-label="Close detail panel"
        >
          ×
        </button>
      </div>

      {/* ── File / line link ───────────────────────────────────────────────── */}
      <div className="rf-ndp__location">
        <button
          className="rf-ndp__file-link"
          onClick={() => onOpenFile(node.file, node.line)}
          title={`Open ${node.file} at line ${node.line}`}
        >
          {shortPath(node.file)}
          <span className="rf-ndp__line-num">:{node.line}</span>
        </button>
      </div>

      <div className="rf-ndp__body">
        {/* ── Code snippet ─────────────────────────────────────────────────── */}
        {hasCode ? (
          <div className="rf-ndp__section">
            <div className="rf-ndp__section-title">Code Snippet</div>
            <CodeBlock code={snippet} file={node.file} />
          </div>
        ) : (
          <div className="rf-ndp__section">
            <div className="rf-ndp__section-title">Code Snippet</div>
            <p className="rf-ndp__no-snippet">
              No snippet available for this node.
            </p>
          </div>
        )}

        {/* ── Explanation ──────────────────────────────────────────────────── */}
        {explanation && (
          <div className="rf-ndp__section">
            <div className="rf-ndp__section-title">Explanation</div>
            <p className="rf-ndp__explanation">{explanation}</p>
          </div>
        )}

        {/* ── Commit info (origin node only) ───────────────────────────────── */}
        {node.role === "origin" && commitInfo && (
          <CommitBlock commit={commitInfo} onOpenDiff={onOpenDiff} />
        )}
        {node.role === "origin" && !commitInfo && (
          <div className="rf-ndp__section">
            <div className="rf-ndp__section-title">Introducing Commit</div>
            <p className="rf-ndp__muted">
              File is not tracked by Git or commit information is unavailable.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default NodeDetailPanel;
