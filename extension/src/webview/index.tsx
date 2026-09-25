import React from "react";
import ReactDOM from "react-dom/client";

// NOTE: Full App implementation is added in Sub-Tasks 6–9.
// This stub mounts the React root so the Webview bundle compiles.

const App: React.FC = () => {
  return (
    <div
      style={{
        fontFamily: "var(--vscode-font-family, sans-serif)",
        color: "var(--vscode-foreground)",
        padding: "2rem",
      }}
    >
      <h1>RootFlow</h1>
      <p>Waiting for analysis result…</p>
    </div>
  );
};

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
