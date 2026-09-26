/**
 * App.tsx — Root application component for the RootFlow Webview
 *
 * Layout (redesigned):
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Header bar                                          │
 *   ├──────────────────────┬───────────────────────────────┤
 *   │                      │  Side panel                   │
 *   │  Metro Graph         │  ┌──────────────────────────┐ │
 *   │  (main area, flex:1) │  │  FixPanel (always shown, │ │
 *   │                      │  │  non-dismissable)         │ │
 *   │                      │  │  + commit history         │ │
 *   │                      │  └──────────────────────────┘ │
 *   │                      │  ┌──────────────────────────┐ │
 *   │                      │  │  NodeDetailPanel          │ │
 *   │                      │  │  (slides in when node     │ │
 *   │                      │  │   is selected)            │ │
 *   │                      │  └──────────────────────────┘ │
 *   └──────────────────────┴───────────────────────────────┘
 */

import React, { useState, useEffect } from "react";
import type { RootFlowResult, GraphNode, SuggestedFix } from "shared/schema";
import MetroGraph from "./MetroGraph";
import NodeDetailPanel from "./NodeDetailPanel";
import FixPanel from "./FixPanel";
import Tooltip from "./Tooltip";
import LoadingSkeleton from "./LoadingSkeleton";
import ErrorState from "./ErrorState";

// ─── VS Code API shim ─────────────────────────────────────────────────────────

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscodeApi = (function () {
  try {
    return acquireVsCodeApi();
  } catch {
    return { postMessage: () => {}, getState: () => null, setState: () => {} };
  }
})();

// ─── Inline shell styles ──────────────────────────────────────────────────────

export const SHELL_STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-foreground, #cccccc);
    font-family: var(--vscode-font-family, -apple-system, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    height: 100vh;
    overflow: hidden;
  }
  .rf-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  .rf-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
    background: var(--vscode-sideBar-background, #252526);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .rf-header__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground, #ccc);
  }
  .rf-header__subtitle {
    font-size: 12px;
    color: var(--vscode-descriptionForeground, #888);
    flex: 1;
  }
  .rf-header__confidence {
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #888);
  }

  /* ── Main content row: graph (left) + side panel (right) ── */
  .rf-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Graph fills remaining horizontal space */
  .rf-graph-area {
    flex: 1;
    overflow: auto;
    padding: 8px;
    min-width: 0;
  }

  /* ── Right side panel ──────────────────────────────────── */
  /*
   * Fixed-width panel on the right that always shows the FixPanel
   * and, when a node is selected, also shows the NodeDetailPanel
   * below it.  Uses flex-column + internal scroll so neither sub-
   * panel pushes the other off screen.
   */
  .rf-side-panel {
    width: 340px;
    min-width: 280px;
    max-width: 420px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--vscode-panel-border, #3c3c3c);
    background: var(--vscode-sideBar-background, #252526);
    overflow: hidden;
  }

  /* FixPanel sub-area — takes only as much space as it needs, scrolls if tall */
  .rf-side-panel__fix {
    flex-shrink: 0;
    overflow-y: auto;
    max-height: 55%;
    border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
  }

  /* NodeDetailPanel sub-area — fills remaining space below fix panel */
  .rf-side-panel__detail {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .rf-button {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none;
    padding: 5px 14px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
  }
  .rf-button:hover { opacity: 0.9; }

  .rf-tooltip {
    position: fixed;
    z-index: 1000;
    background: var(--vscode-editorWidget-background, #252526);
    border: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
    border-radius: 3px;
    padding: 6px 10px;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    max-width: 260px;
  }
  .rf-tooltip__symbol { font-weight: 600; font-size: 12px; }
  .rf-tooltip__file { font-size: 11px; color: var(--vscode-descriptionForeground, #888); margin-top: 2px; }
  .rf-tooltip__role {
    display: inline-block;
    margin-top: 4px;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .rf-tooltip__role--origin    { background: #e0525230; color: #e05252; }
  .rf-tooltip__role--propagation { background: #d4a01730; color: #d4a017; }
  .rf-tooltip__role--failure   { background: #c0392b30; color: #c0392b; }
  .rf-tooltip__role--related   { background: #8e9aad30; color: #8e9aad; }
  .rf-badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .rf-badge--origin      { background: #e0525230; color: #e05252; }
  .rf-badge--propagation { background: #d4a01730; color: #d4a017; }
  .rf-badge--failure     { background: #c0392b30; color: #c0392b; }
  .rf-badge--related     { background: #8e9aad30; color: #8e9aad; }
  code { font-family: var(--vscode-editor-font-family, monospace); }
`;

// ─── App component ────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const [result, setResult] = useState<RootFlowResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [tooltip, setTooltip] = useState<{
    node: GraphNode;
    x: number;
    y: number;
  } | null>(null);

  // ── Message listener ───────────────────────────────────────────────────────
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data as {
        command: string;
        data?: RootFlowResult;
        message?: string;
      };
      switch (msg.command) {
        case "loadResult":
          setLoading(false);
          setError(null);
          setSelectedNode(null);
          setResult(msg.data ?? null);
          break;
        case "loading":
          setLoading(true);
          setError(null);
          break;
        case "error":
          setLoading(false);
          setError(msg.message ?? "Unknown error");
          break;
      }
    }
    window.addEventListener("message", onMessage);
    vscodeApi.postMessage({ command: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // ── Node interaction ───────────────────────────────────────────────────────
  function handleNodeClick(node: GraphNode) {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    setTooltip(null);
  }

  function handleNodeHover(node: GraphNode | null, event?: React.MouseEvent) {
    if (!node) { setTooltip(null); return; }
    setTooltip({ node, x: event?.clientX ?? 0, y: event?.clientY ?? 0 });
  }

  // ── Extension host messaging ───────────────────────────────────────────────
  function handleOpenFile(file: string, line: number) {
    vscodeApi.postMessage({ command: "openFile", file, line });
  }

  function handleOpenDiff(hash: string) {
    vscodeApi.postMessage({ command: "openDiff", hash });
  }

  function handleApplyFix(fix: SuggestedFix) {
    vscodeApi.postMessage({
      command: "applyFix",
      filePath: fix.filePath,
      originalCode: fix.originalCode,
      fixedCode: fix.fixedCode,
      patch: fix.patch,
    });
  }

  function handleRetry() {
    vscodeApi.postMessage({ command: "retry" });
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rf-shell">
        <div className="rf-header">
          <span className="rf-header__title">RootFlow</span>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rf-shell">
        <div className="rf-header">
          <span className="rf-header__title">RootFlow</span>
        </div>
        <ErrorState message={error} onRetry={handleRetry} />
      </div>
    );
  }

  // ── Empty / initial state ──────────────────────────────────────────────────
  if (!result) {
    return (
      <div className="rf-shell">
        <div className="rf-header">
          <span className="rf-header__title">RootFlow</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: 12,
            padding: "2rem",
            color: "var(--vscode-descriptionForeground, #888)",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0 }}>
            Select error text in the editor or terminal, then run{" "}
            <strong style={{ color: "var(--vscode-foreground, #ccc)" }}>
              RootFlow: Analyze Bug
            </strong>
            .
          </p>
        </div>
      </div>
    );
  }

  // ── Derive props for child components ──────────────────────────────────────
  const selectedPropNode = selectedNode
    ? result.propagationPath.find((p) => p.id === selectedNode.id) ?? null
    : null;

  // Commit info is always sourced from rootCause (shown at bottom of FixPanel)
  const commitInfo = result.rootCause.introducedByCommit ?? null;

  // NodeDetailPanel for a clicked node — always passes null for commitInfo since
  // it's shown in the FixPanel instead
  const showFix = !!(
    result.suggestedFix &&
    (result.suggestedFix.patch || result.suggestedFix.description)
  );

  // Whether to show the right side panel at all
  const showSidePanel = showFix || selectedNode !== null;

  // ── Main result layout ─────────────────────────────────────────────────────
  return (
    <div className="rf-shell">
      {/* Header */}
      <div className="rf-header">
        <span className="rf-header__title">RootFlow</span>
        {result.rootCause && (
          <span className="rf-header__subtitle">
            Root cause:{" "}
            <code>{result.rootCause.symbol}</code> in{" "}
            <code>
              {result.rootCause.file}:{result.rootCause.line}
            </code>
          </span>
        )}
        <span className="rf-header__confidence">
          Confidence:{" "}
          {Math.round((result.rootCause.confidenceScore ?? 0) * 100)}%
        </span>
      </div>

      {/* Main content: graph on the left, side panel on the right */}
      <div className="rf-content">
        {/* Metro map — always fills available space */}
        <div className="rf-graph-area">
          <MetroGraph
            nodes={result.graph.nodes}
            edges={result.graph.edges}
            propagationPath={result.propagationPath}
            selectedNodeId={selectedNode?.id}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
          />
        </div>

        {/* Right side panel — contains FixPanel (always) + NodeDetailPanel
            (when a node is selected). Both are sub-panels; the map is never
            replaced or hidden. */}
        {showSidePanel && (
          <div className="rf-side-panel">
            {/* FixPanel: always visible when a fix exists, non-dismissable.
                Commit history from rootCause.introducedByCommit is always
                shown at the bottom of this panel. */}
            {showFix && (
              <div className="rf-side-panel__fix">
                <FixPanel
                  fix={result.suggestedFix}
                  confidenceScore={result.rootCause.confidenceScore ?? 0}
                  commitInfo={commitInfo}
                  onApply={handleApplyFix}
                  onOpenDiff={handleOpenDiff}
                />
              </div>
            )}

            {/* NodeDetailPanel: slide in when a node is clicked */}
            {selectedNode && (
              <div className="rf-side-panel__detail">
                <NodeDetailPanel
                  node={selectedNode}
                  propagationNode={selectedPropNode}
                  onOpenFile={handleOpenFile}
                  onClose={() => setSelectedNode(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <Tooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} />
      )}
    </div>
  );
};

export default App;
