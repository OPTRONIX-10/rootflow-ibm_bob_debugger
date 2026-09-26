/**
 * NodeDetailPanel.tsx
 *
 * Nested sub-panel inside the right side panel. Opens when a StationNode is
 * clicked. Shows:
 *   - File path + line number (clickable → sends openFile message to host)
 *   - Role badge
 *   - Syntax-highlighted code snippet (highlight.js)
 *   - Explanation text from the matching PropagationNode
 *
 * Commit history is now shown in FixPanel (always at bottom), not here.
 */

import React, { useEffect, useRef } from "react";
import type { GraphNode, PropagationNode } from "shared/schema";

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
  /** Called when user clicks the file path / line link */
  onOpenFile: (file: string, line: number) => void;
  /** Called when user closes the panel */
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function shortPath(file: string): string {
  const parts = file.replace(/\\/g, "/").split("/");
  return parts.slice(-3).join("/");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  node,
  propagationNode,
  onOpenFile,
  onClose,
}) => {
  const explanation = propagationNode?.explanation ?? "";
  const snippet =
    (propagationNode as (PropagationNode & { snippet?: string }) | null)
      ?.snippet ?? "";
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
      </div>
    </aside>
  );
};

export default NodeDetailPanel;
