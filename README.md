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
3. In the new VS Code window, copy an error message in the editor or terminal and run:
   - **Command Palette** → `RootFlow: Analyze Bug`
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

## Example Project (Fixture)

`examples/sample_project/` is a minimal  Python project used for testing the extension.

```
examples/sample_project/
├── models.py          
├── routes.py          
├── docs   
└── tests/
    └── test_auth.py  
```




---

## Testing

### Backend unit tests

```bash
cd <repo root>
python -m pytest backend/tests/ --ignore=backend/tests/test_e2e.py -v
```

### End-to-end test

The E2E test starts the server automatically and posts the fixture traceback:

```bash
python -m pytest backend/tests/test_e2e.py -v
```

> The test skips cleanly if the server fails to start. When `WATSONX_*`
> credentials are absent the LLM stage falls back gracefully and the
> structural assertions still pass.

---

## Packaging the Extension

Prerequisites: [vsce](https://github.com/microsoft/vscode-vsce) (`npm install -g @vscode/vsce`)

```bash
cd extension
npm run build          # compile TypeScript + Webview bundle
vsce package           # produces rootflow-0.1.0.vsix
```

Install the `.vsix` in VS Code:

```
Extensions → … → Install from VSIX…
```

---

## Troubleshooting

### "RootFlow backend server failed to start"

1. Confirm the Python virtual environment is active and `pip install -r backend/requirements.txt` has been run.
2. Check that port `7331` is not already in use: `netstat -an | grep 7331`.
3. Set `rootflow.pythonPath` in VS Code settings to the full path of your Python interpreter.
4. Start the server manually (`python main.py` inside `backend/`) and check its console output for errors.

### "LLM unavailable" explanation in the Webview

The watsonx.ai credentials in `backend/.env` are missing or incorrect.  Copy `.env.example` to `.env` and fill in all four `WATSONX_*` variables.  The structural analysis (call graph + propagation path) still works without credentials.

### Extension Webview shows blank panel

Run `npm run build` inside `extension/` to ensure the Webview bundle (`dist/webview.js`) is up to date, then reload the Extension Development Host window (`Ctrl+R`).

### `tree-sitter` import error on Python 3.12+

Upgrade `tree-sitter` and `tree-sitter-python` to their latest releases:

```bash
pip install --upgrade tree-sitter tree-sitter-python
```

---

## CI

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull request:

| Job | What it does |
|---|---|
| **backend** | Runs `pytest backend/tests/` (unit tests) and the E2E test on Python 3.11 and 3.12 |
| **fixture-fails** | Confirms the example buggy test raises `ZeroDivisionError` as expected |
| **extension** | Runs `npm run build` and asserts the compiled bundles exist |

---

## Sub-Task Status

| # | Sub-Task | Status |
|---|---|---|
| 1 | Project Scaffolding | ✅ Complete |
| 2 | Extension: Input Capture & Server Bridge | ✅ Complete |
| 3 | Backend: AST & Call-Graph Analysis | ✅ Complete |
| 4 | Backend: Git Blame & Commit Identification | ✅ Complete |
| 5 | Backend: LLM Reasoning (watsonx.ai) | ✅ Complete |
| 6 | Webview: Metro-Style Visualization | ✅ Complete |
| 7 | Webview: Node Interaction & Code Inspection | ✅ Complete |
| 8 | Webview: Fix Panel & One-Click Apply | ✅ Complete |
| 9 | Webview: App Shell & Theme Integration | ✅ Complete |
| 10 | Integration, E2E Testing & Documentation | ✅ Complete |
