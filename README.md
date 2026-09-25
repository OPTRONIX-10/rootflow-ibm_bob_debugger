# RootFlow

> **Automatic bug root-cause analysis, propagation tracing, and fix suggestion — rendered as an interactive metro-style visualization inside VS Code.**

Given a failing test or error message, RootFlow:

1. Parses the error to identify the failure site.
2. Traverses the workspace codebase with `tree-sitter` to build a function-level call graph.
3. Traces the call path backward from the failure to candidate root-cause sites.
4. Uses `gitpython` to identify the exact commit that introduced the root-cause code.
5. Sends the assembled evidence to IBM watsonx.ai (Granite) for natural-language explanation and a suggested fix.
6. Renders the entire result as an interactive 2D metro-style graph in a VS Code Webview panel.

---

## Project Layout

```
rootflow/
├── extension/              VS Code extension (TypeScript)
│   ├── src/
│   │   ├── extension.ts    Extension host entry point
│   │   └── webview/        React + D3.js Webview app
│   │       └── index.tsx   Webview entry point
│   ├── package.json        Extension manifest & npm scripts
│   ├── tsconfig.json       TypeScript compiler config
│   └── esbuild.js          Build script (extension + webview bundles)
│
├── backend/                Python analysis server (FastAPI)
│   ├── analyzer/           Pipeline stage modules (Sub-Tasks 3–5)
│   ├── tests/              pytest test suite
│   ├── main.py             FastAPI app — POST /analyze
│   ├── pyproject.toml      Project metadata & dependencies
│   ├── requirements.txt    Pip-installable dependency list
│   └── .env.example        Environment variable template
│
├── shared/                 Shared data contract
│   ├── schema.ts           TypeScript interfaces (RootFlowResult, …)
│   └── schema.py           Pydantic models (RootFlowResult, …)
│
└── README.md               This file
```

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 18 LTS |
| npm | 9 |
| Python | 3.11 |
| Git | 2.38 |
| VS Code | 1.85 |

---

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Copy the environment variable template and fill in your IBM watsonx.ai credentials:

```bash
cp .env.example .env
# Edit .env and set WATSONX_API_KEY, WATSONX_PROJECT_ID, WATSONX_URL, WATSONX_MODEL_ID
```

### 2. Extension

```bash
cd extension
npm install
npm run build
```

---

## Running

### Start the backend server

```bash
cd backend
python main.py
# Server listens on http://127.0.0.1:7331
# Health check: GET http://127.0.0.1:7331/health
```

### Run the extension in VS Code (development)

1. Open the `extension/` folder in VS Code.
2. Press **F5** to launch the **Extension Development Host**.
3. In the new VS Code window, select an error message in the editor or terminal and run:
   - **Command Palette** → `RootFlow: Analyze Bug`
   - Right-click in the editor → `RootFlow: Analyze Bug`
   - Keyboard shortcut: `Ctrl+Shift+R` (Windows/Linux) / `Cmd+Shift+R` (macOS)

---

## Environment Variables

All variables are read by the backend from the `backend/.env` file (or from the system environment).

| Variable | Required | Description |
|---|---|---|
| `WATSONX_API_KEY` | Yes | IBM watsonx.ai API key |
| `WATSONX_PROJECT_ID` | Yes | watsonx.ai project ID |
| `WATSONX_URL` | Yes | watsonx.ai service endpoint URL |
| `WATSONX_MODEL_ID` | Yes | Granite model ID (e.g. `ibm/granite-13b-instruct-v2`) |
| `ROOTFLOW_PORT` | No | Override the default server port (default: `7331`) |

---

## Extension Configuration

The following settings are available in VS Code under **Settings → RootFlow**:

| Setting | Default | Description |
|---|---|---|
| `rootflow.pythonPath` | `"python"` | Path to the Python interpreter used to start the backend server |

---

## Architecture

```
VS Code Extension Host (TypeScript)
  │  captures error text from editor selection / terminal
  │  spawns / manages the backend process
  │  sends POST /analyze → receives RootFlowResult JSON
  │  opens Webview panel and posts result
  ▼
Webview (React + D3.js + SVG)
  │  renders metro-style propagation graph
  │  node click → NodeDetailPanel (code, explanation, Git commit)
  │  FixPanel → one-click patch apply
  ▼  (messages back to extension host)
VS Code API  →  file open / diff view / WorkspaceEdit

Backend Analysis Server  localhost:7331  (Python + FastAPI)
  Stage 1 — Error Parser        extracts (file, line, symbol) from traceback
  Stage 2 — AST / Call Graph    tree-sitter parse → networkx DiGraph
  Stage 3 — Propagation Tracer  backward BFS from failure to root cause
  Stage 4 — Git Blame           gitpython → CommitInfo for origin node
  Stage 5 — LLM Reasoning       watsonx.ai Granite → explanation + fix patch
```

---

## Development Notes

- The **backend** and **extension** are developed and versioned together in this monorepo but are independent processes at runtime.
- The **shared/** directory is the single source of truth for the JSON contract. Edit `schema.ts` and `schema.py` in tandem; do not diverge field names.
- The backend server is stateless — each `POST /analyze` call is independent.
- `node_modules`, `site-packages`, and external library code are **excluded** from call-graph traversal and blame analysis. Only workspace files are processed.

---

## Sub-Task Status

| # | Sub-Task | Status |
|---|---|---|
| 1 | Project Scaffolding | ✅ Complete |
| 2 | Extension: Input Capture & Server Bridge | ⬜ Pending |
| 3 | Backend: AST & Call-Graph Analysis | ⬜ Pending |
| 4 | Backend: Git Blame & Commit Identification | ⬜ Pending |
| 5 | Backend: LLM Reasoning (watsonx.ai) | ⬜ Pending |
| 6 | Webview: Metro-Style Visualization | ⬜ Pending |
| 7 | Webview: Node Interaction & Code Inspection | ⬜ Pending |
| 8 | Webview: Fix Panel & One-Click Apply | ⬜ Pending |
| 9 | Webview: App Shell & Theme Integration | ⬜ Pending |
| 10 | Integration, E2E Testing & Documentation | ⬜ Pending |
