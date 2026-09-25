/**
 * index.tsx — Webview entry point (Sub-Task 9)
 *
 * Injects global shell styles and mounts the root <App /> component onto
 * the #root element provided by the Webview HTML template.
 *
 * All application logic lives in App.tsx; all individual panels live in
 * their own component files (MetroGraph, NodeDetailPanel, FixPanel,
 * LoadingSkeleton, ErrorState, Tooltip).
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App, { SHELL_STYLES } from "./App";
import "./metro.css";

// Inject shell CSS once before any component renders so layout classes
// (.rf-shell, .rf-header, .rf-content, .rf-button, etc.) are available
// from the very first paint.
const styleEl = document.createElement("style");
styleEl.textContent = SHELL_STYLES;
document.head.appendChild(styleEl);

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
