# RootFlow — Implementation Plan

## Top-Level Overview

**Goal:** Build a VS Code extension called **RootFlow** that, given a failing test or error message, automatically identifies the probable root cause of a bug, traces its propagation through the codebase, identifies the introducing Git commit, suggests a fix, and renders all of this as an interactive 2D metro-style visualization inside a VS Code Webview panel.

**Approach:**
- A **Python backend** (local HTTP REST server) runs a multi-stage analysis pipeline: AST/call-graph traversal, git blame/log mining, and IBM watsonx.ai (Granite) LLM reasoning. It emits a single structured JSON document.
- A **VS Code extension** (TypeScript) captures the user's selected error/test failure, sends it to the Python server, and renders the JSON result in a Webview panel.
- The **Webview** (TypeScript + React + D3.js + SVG) renders a metro-style propagation graph, with full node interaction, inline code inspection, Git diff viewing, and one-click fix application.

**Stack:**
- Extension host: TypeScript, VS Code Extension API
- Webview UI: TypeScript, React, D3.js, SVG
- Backend: Python, FastAPI, IBM watsonx.ai SDK, GitPython, `tree-sitter`
- Communication: HTTP REST (localhost)

**Scope (MVP):**
1. Extension activation, command/context-menu entry points
2. Python analysis server with the full pipeline
3. Structured JSON schema shared between backend and frontend
4. Metro-style Webview visualization with full interactivity
5. Fix suggestion display and one-click application
6. Git commit identification and inline diff view

**Confirmed Design Decisions:**
- **Analysis scope:** workspace codebase only — `node_modules`, `site-packages`, and external dependencies are excluded from call-graph traversal and blame.
- **LLM snippet strategy:** function-level snippets, not bare error lines and not full files. Each snippet sent to the LLM must include: the full function signature, any decorators on the function, the complete function body, and the immediate imports that the function directly references. This applies to every node on the propagation path.
- **Pipeline ordering:** Stage 3 (AST/call-graph) → Stage 4 (Git blame) → Stage 5 (LLM reasoning). Static analysis determines the propagation path first; Git blame enriches the origin node; LLM receives the fully assembled context.

---

## Shared JSON Schema

The single contract between the backend and the Webview. Defined once and referenced by all sub-tasks.

```
RootFlowResult {
  sessionId: string
  timestamp: string
  errorInput: { raw: string, file?: string, line?: number }
  rootCause: {
    file: string
    line: number
    symbol: string
    explanation: string
    confidenceScore: number          // 0.0–1.0
    introducedByCommit: {
      hash: string
      author: string
      date: string
      message: string
      diff: string
    }
  }
  propagationPath: PropagationNode[]  // ordered origin → failure
  relatedNodes: RelatedNode[]         // context-only, not on causal path
  suggestedFix: {
    description: string
    filePath: string
    originalCode: string
    fixedCode: string
    patch: string                     // unified diff
  }
  graph: {
    nodes: GraphNode[]
    edges: GraphEdge[]
  }
}

PropagationNode {
  id: string
  file: string
  line: number
  symbol: string
  role: "origin" | "propagation" | "failure"
  explanation: string
}

RelatedNode {
  id: string
  file: string
  symbol: string
  relationship: string
}

GraphNode {
  id: string
  label: string
  role: "origin" | "propagation" | "failure" | "related"
  file: string
  line: number
  symbol: string
}

GraphEdge {
  source: string   // node id
  target: string   // node id
  label?: string
}
```

---

## Sub-Tasks

---

### Sub-Task 1 — Project Scaffolding

**Status:** `[x] complete`

**Intent:**
Establish the full monorepo directory structure, package manifests, and configuration files for both the VS Code extension and the Python backend so every subsequent sub-task has a clear home for its code.

**Expected Outcomes:**
- `extension/` — fully scaffolded VS Code extension (TypeScript, `package.json` with activation events, commands, and context menu contributions)
- `backend/` — Python package with FastAPI, a `requirements.txt` / `pyproject.toml`, and a runnable stub server
- `webview/` inside `extension/src/` — React + D3.js app with a build pipeline (esbuild or Vite)
- A root `README.md` describing the project layout and how to run both components
- Shared JSON schema written to `shared/schema.ts` (TypeScript interface) and `shared/schema.py` (Python dataclass / Pydantic model)

**Todo List:**
1. Create `extension/` with `package.json` (publisher, activation events: `onCommand:rootflow.analyze`), `tsconfig.json`, `esbuild.js` build script.
2. Add VS Code contribution points: command `rootflow.analyze` ("RootFlow: Analyze Bug"), context menu entry on editor selection and terminal output, keybinding.
3. Create `extension/src/` with entry `extension.ts` stub and `webview/` subfolder.
4. Create `backend/` with `pyproject.toml` (FastAPI, uvicorn, pydantic, gitpython, tree-sitter, ibm-watsonx-ai), `main.py` stub that starts the server on `localhost:7331`.
5. Create `shared/schema.ts` and `shared/schema.py` with the full JSON schema interfaces/models as defined above.
6. Write root `README.md` with setup and run instructions.

**Relevant Context:**
- VS Code extension manifest docs: `package.json` `contributes.commands`, `contributes.menus` (`editor/context`, `terminal/context`).
- Python server port `7331` is used in all subsequent sub-tasks.

---

### Sub-Task 2 — VS Code Extension: Input Capture & Server Bridge

**Status:** `[x] complete`

**Intent:**
Implement the extension-host logic that captures the user's selected error text (from editor selection or terminal), starts the Python server process if not already running, sends the analysis request, and receives the `RootFlowResult` JSON back.

**Expected Outcomes:**
- Registered command `rootflow.analyze` reads the active editor selection or focused terminal output.
- Extension spawns `uvicorn backend.main:app` as a child process on first use (managed lifecycle).
- `AnalysisClient` class sends a `POST /analyze` request with the workspace root path + error text, returns parsed `RootFlowResult`.
- On success, extension opens the Webview panel and passes the result to it.
- On failure, extension shows an error notification with the server's error message.

**Todo List:**
1. Implement `captureInput()` in `extension.ts` — reads `vscode.window.activeTextEditor.selection` or `vscode.window.activeTerminal` buffer.
2. Implement `ServerManager` — checks if port `7331` is alive; if not, spawns the Python process; registers `deactivate` hook to kill it.
3. Implement `AnalysisClient.analyze(workspaceRoot, errorText): Promise<RootFlowResult>` — `POST localhost:7331/analyze`.
4. Wire the command handler: capture input → ensure server → call analyze → open Webview.
5. Add configuration setting `rootflow.pythonPath` so users can point to a custom interpreter.

**Relevant Context:**
- `extension/src/extension.ts` (scaffolded in Sub-Task 1)
- `shared/schema.ts` for `RootFlowResult` type
- VS Code API: `vscode.commands.registerCommand`, `vscode.window.showErrorMessage`, `child_process.spawn`

---

### Sub-Task 3 — Python Backend: AST & Call-Graph Analysis Stage

**Status:** `[x] complete`

**Intent:**
Build the first stage of the analysis pipeline: parse the target codebase with `tree-sitter`, construct a function-level call graph, and trace the call path from the failing symbol backward to candidate root-cause sites.

**Expected Outcomes:**
- `POST /analyze` endpoint accepts `{ workspaceRoot, errorText }` and returns the full `RootFlowResult` (later stages will fill remaining fields; this stage fills `propagationPath` and the `graph` skeleton).
- `ASTAnalyzer` class uses `tree-sitter` (Python grammar) to extract function definitions and call sites.
- `CallGraphBuilder` builds a directed graph: nodes = functions, edges = calls.
- `PropagationTracer` walks the call graph from the failure point backward (BFS/DFS, max depth 10) and returns the ordered `PropagationNode[]` list.
- Unit tests cover the `CallGraphBuilder` and `PropagationTracer` with a synthetic fixture.

**Todo List:**
1. Create `backend/analyzer/ast_analyzer.py` — parse files with `tree-sitter`, extract `(file, line, symbol_name)` tuples for all function definitions and calls.
2. Create `backend/analyzer/call_graph.py` — `CallGraphBuilder` builds a `networkx.DiGraph`; expose `get_callers(symbol)` and `get_callees(symbol)`.
3. Create `backend/analyzer/propagation_tracer.py` — `PropagationTracer.trace(failure_symbol) -> List[PropagationNode]` using backward BFS on the call graph; assign `role` field (`"origin"`, `"propagation"`, `"failure"`).
4. Create `backend/analyzer/error_parser.py` — parse raw error/traceback text to extract the initial failure `(file, line, symbol)`.
5. Wire into `POST /analyze` in `main.py`: parse error → build call graph → trace → populate `graph.nodes` and `graph.edges`.
6. Write `backend/tests/test_call_graph.py` with a two-file fixture.

**Relevant Context:**
- `shared/schema.py` — `PropagationNode`, `GraphNode`, `GraphEdge` Pydantic models
- `backend/main.py` — FastAPI app stub from Sub-Task 1
- Libraries: `tree-sitter`, `networkx`

---

### Sub-Task 4 — Python Backend: Git Blame & Commit Identification Stage

**Status:** `[x] complete`

**Intent:**
Augment the pipeline with Git history analysis: use `gitpython` to run `git blame` on the root-cause file/line and identify the exact commit that introduced the code at the origin node, enriching `rootCause.introducedByCommit`.

**Expected Outcomes:**
- `GitAnalyzer` class wraps `gitpython` to run blame and log queries.
- For the identified root-cause `(file, line)`, returns the commit hash, author, date, message, and unified diff of that commit for the relevant file.
- The `introducedByCommit` block is fully populated in the `RootFlowResult`.
- If the file is not tracked by Git, the field is `null` with a descriptive reason.

**Todo List:**
1. Create `backend/analyzer/git_analyzer.py` — `GitAnalyzer(repo_root)` with methods: `blame(file, line) -> CommitInfo` and `get_commit_diff(hash, file) -> str`.
2. Parse `git blame --porcelain` output to extract hash, author, date, and summary.
3. Use `repo.commit(hash).diff(hash + "~1")` to get the unified diff for the file.
4. Integrate into `POST /analyze`: after propagation trace, call `GitAnalyzer.blame()` on the origin node's file/line.
5. Write `backend/tests/test_git_analyzer.py` using a temporary `git init` fixture.

**Relevant Context:**
- `backend/analyzer/propagation_tracer.py` — origin node is `propagationPath[0]`
- `shared/schema.py` — `CommitInfo` Pydantic model
- Library: `gitpython`

---

### Sub-Task 5 — Python Backend: LLM Reasoning Stage (watsonx.ai Granite)

**Status:** `[x] complete`

**Intent:**
Feed the fully assembled call-graph trace, Git blame result, and raw error into IBM watsonx.ai (Granite model) to produce: a natural-language root-cause explanation, a confidence score (0–1), and a suggested code fix. The LLM receives function-level code snippets — not bare lines and not full files — so it has enough context to reason accurately without exceeding token limits.

**Expected Outcomes:**
- `WatsonxReasoner` class builds a structured prompt and calls the watsonx.ai Granite model via the `ibm-watsonx-ai` SDK.
- LLM output is parsed into: `rootCause.explanation`, `rootCause.confidenceScore`, and `suggestedFix` (description + patch).
- API key and project ID are read from environment variables `WATSONX_API_KEY` and `WATSONX_PROJECT_ID`.
- If the LLM call fails, the pipeline returns the structural analysis result with `explanation: "LLM unavailable"` and `confidenceScore: 0`.

**Snippet Extraction Rule (enforced for every propagation node):**
Each code snippet included in the prompt must contain:
1. All import statements that the function directly references (resolved from the file's top-level imports by name — not the entire import block).
2. Any decorators applied directly to the function.
3. The complete function signature (name, parameters, return type annotation if present).
4. The full function body, untruncated.

Snippets are extracted by the `SnippetExtractor` class (built in this sub-task, using the `tree-sitter` AST already constructed in Stage 3) so no file is re-read from disk.

**Todo List:**
1. Create `backend/analyzer/snippet_extractor.py` — `SnippetExtractor` takes a `tree-sitter` AST node for a function and returns a `CodeSnippet(imports: list[str], decorators: list[str], signature: str, body: str, full_text: str)`.
   - Resolve which top-level imports are referenced by scanning identifiers in the function body against the file's import table.
   - Include decorator lines immediately preceding the `def`/`async def` node.
2. Create `backend/analyzer/watsonx_reasoner.py` — `WatsonxReasoner` takes the assembled context dict (error text, `List[PropagationNode]` with attached `CodeSnippet`, `CommitInfo`) and returns `ReasoningResult(explanation, confidence_score, fix_description, original_code, fixed_code, patch)`.
3. Design the prompt structure:
   - **System message:** "You are an expert debugging assistant. Analyze the following bug report and code evidence. Respond only in valid JSON matching the schema provided."
   - **User message sections (in order):** raw error text, git blame summary for the origin node, then one labelled block per propagation node containing `role`, `file:line`, and the extracted `full_text` snippet.
   - **Response schema instruction:** embed the expected JSON keys (`explanation`, `confidence_score`, `fix_description`, `original_code`, `fixed_code`, `patch`) directly in the prompt so the model produces parseable output.
4. Parse the model's JSON response; validate all required fields are present and non-empty; fall back gracefully to `explanation: "LLM parse error"` and `confidenceScore: 0` on failure.
5. Add `WATSONX_API_KEY`, `WATSONX_PROJECT_ID`, `WATSONX_URL`, `WATSONX_MODEL_ID` to a `.env` file (loaded with `python-dotenv`); document variables in README.
6. Integrate into `POST /analyze` in `main.py`: after Git stage, call `SnippetExtractor` for each node in the propagation path, then pass to `WatsonxReasoner`; merge `ReasoningResult` into `RootFlowResult`.
7. Write `backend/tests/test_snippet_extractor.py` — assert that for a fixture function, the output includes the correct imports, decorators, signature, and body.
8. Write `backend/tests/test_watsonx_reasoner.py` with a mocked `ModelInference` SDK response.

**Relevant Context:**
- `shared/schema.py` — `SuggestedFix`, `RootCause` Pydantic models
- `backend/main.py` — final assembly point for the three-stage pipeline
- `backend/analyzer/ast_analyzer.py` — the `tree-sitter` AST produced in Stage 3 is reused here; no second parse pass
- IBM watsonx.ai Python SDK: `ibm_watsonx_ai.foundation_models.ModelInference`
- Confirmed snippet rule: imports directly used by the function + decorators + full signature + full body (see Snippet Extraction Rule above)

---

### Sub-Task 6 — Webview: Metro-Style Visualization (D3 + SVG)

**Status:** `[x] complete`

**Intent:**
Build the core visual component of the Webview — an interactive 2D metro-style graph rendered with D3.js and SVG that represents the bug's propagation path, distinguishing causal nodes (origin, propagation, failure) from related context nodes.

**Expected Outcomes:**
- `MetroGraph` React component receives a `RootFlowResult` and renders an SVG metro map:
  - **Main line** (colored track): origin → propagation nodes → failure point, rendered as a connected metro line with station nodes.
  - **Branch lines**: related nodes connected to the main line where they touch it.
  - Node shapes distinguish roles: origin (red circle), propagation (yellow diamond), failure (red square), related (grey circle).
  - Edge labels show call relationship.
- D3 force layout (or fixed orthogonal layout) positions nodes; SVG `<path>` draws metro lines with rounded corners.
- The component is responsive to panel resize.

**Todo List:**
1. Set up the React + D3.js + TypeScript Webview build in `extension/src/webview/` (esbuild or Vite config).
2. Create `MetroGraph.tsx` — accepts `graph: { nodes, edges }` + `propagationPath` prop; renders D3 force-directed SVG.
3. Implement `useMetroLayout` hook — computes node positions; places causal-path nodes on a central horizontal/vertical spine; places related nodes offset from their nearest spine node.
4. Implement SVG rendering: `<MetroLine>` component draws curved paths between spine nodes; `<StationNode>` renders role-specific shapes.
5. Add zoom/pan via D3 `zoom` behavior attached to the root SVG.
6. Style with CSS: role-based color palette, dark/light theme support via VS Code CSS variables.

**Relevant Context:**
- `shared/schema.ts` — `GraphNode`, `GraphEdge`, `RootFlowResult` TypeScript interfaces
- VS Code Webview API: messages passed via `acquireVsCodeApi().postMessage`
- D3.js: `d3-force`, `d3-zoom`, `d3-selection`, `d3-shape`

---

### Sub-Task 7 — Webview: Node Interaction & Code Inspection Panel

**Status:** `[x] complete`

**Intent:**
Enable full node interactivity in the visualization: clicking a node opens a detail panel showing the relevant code snippet at the exact file/line, the explanation/evidence, and the Git commit information — all without leaving the Webview.

**Expected Outcomes:**
- Clicking a `StationNode` renders a `NodeDetailPanel` slide-in panel on the right side of the Webview.
- `NodeDetailPanel` shows: file path + line number, syntax-highlighted code snippet (using `highlight.js` or `shiki`), role badge, `explanation` text, and (for the origin node) the full `introducedByCommit` block.
- Hovering a node shows a tooltip with the symbol name and file.
- Clicking the commit hash in the detail panel sends a message to the extension host to open `vscode.diff` with the commit diff.
- Clicking the file path sends a message to open `vscode.workspace.openTextDocument` at the exact line.

**Todo List:**
1. Create `NodeDetailPanel.tsx` — conditional render based on `selectedNode` state; layout: header (file + line), code block, explanation, commit section.
2. Integrate `shiki` (or `highlight.js`) for syntax highlighting inside the code block; use the VS Code theme token colors.
3. Add `onNodeClick` and `onNodeHover` callbacks from `MetroGraph` into `App.tsx` state; pass `selectedNode` to `NodeDetailPanel`.
4. Create `Tooltip.tsx` — positioned absolutely near the hovered node, shows symbol + file on hover.
5. Implement `vscodeApi.postMessage({ command: 'openFile', file, line })` and `{ command: 'openDiff', hash }` in the Webview; handle both messages in `extension.ts` by calling VS Code API.

**Relevant Context:**
- `extension/src/webview/MetroGraph.tsx` (Sub-Task 6)
- `extension/src/extension.ts` — Webview message handler (`panel.webview.onDidReceiveMessage`)
- VS Code API: `vscode.window.showTextDocument`, `vscode.commands.executeCommand('vscode.diff', ...)`

---

### Sub-Task 8 — Webview: Suggested Fix Panel & One-Click Apply

**Status:** `[x] complete`

**Intent:**
Surface the LLM-suggested fix in a dedicated panel within the Webview, show a before/after diff, and allow the developer to apply the patch to the workspace file with a single click.

**Expected Outcomes:**
- `FixPanel` component renders at the bottom of the Webview, always visible when a `suggestedFix` is present.
- Displays: fix description, a side-by-side or unified diff view of `originalCode` vs `fixedCode`, confidence score badge.
- "Apply Fix" button sends `{ command: 'applyFix', filePath, patch }` to the extension host.
- Extension host applies the patch using `vscode.workspace.applyEdit` with a `WorkspaceEdit` replacing the relevant lines.
- After apply, extension shows a notification "Fix applied — run your tests to verify."
- "Dismiss" button hides the panel without applying.

**Todo List:**
1. Create `FixPanel.tsx` — layout: description text, `DiffView` component, confidence badge, Apply/Dismiss buttons.
2. Create `DiffView.tsx` — renders `suggestedFix.patch` as a syntax-highlighted unified diff (line coloring: red for removals, green for additions).
3. Wire "Apply Fix" button to `vscodeApi.postMessage({ command: 'applyFix', filePath, patch })`.
4. In `extension.ts` message handler: receive `applyFix`, parse the patch, construct a `WorkspaceEdit` replacing the `originalCode` range with `fixedCode`; call `vscode.workspace.applyEdit`.
5. Show `vscode.window.showInformationMessage` with a "Run Tests" button that executes `workbench.action.tasks.test`.

**Relevant Context:**
- `extension/src/webview/` — sibling to `MetroGraph.tsx` and `NodeDetailPanel.tsx`
- `extension/src/extension.ts` — Webview message handler
- VS Code API: `vscode.WorkspaceEdit`, `vscode.workspace.applyEdit`, `vscode.window.showInformationMessage`

---

### Sub-Task 9 — Webview: App Shell, Panel Layout & VS Code Theme Integration

**Status:** `[x] complete`

**Intent:**
Compose all Webview components into a cohesive single-page app shell, wire the message protocol between the extension host and the Webview, apply VS Code theme variables throughout, and ensure the layout is polished and production-ready.

**Expected Outcomes:**
- `App.tsx` is the root component: holds `RootFlowResult` state, renders a header bar, `MetroGraph` (center), `NodeDetailPanel` (right drawer), and `FixPanel` (bottom sheet).
- Extension host posts `{ command: 'loadResult', data: RootFlowResult }` to the Webview on panel open; Webview listens and updates state.
- A loading skeleton is shown while the analysis is in progress (extension posts `{ command: 'loading' }`).
- An error state is shown if the backend returns an error.
- All colors, fonts, and spacing use VS Code CSS variables (`--vscode-*`) so the UI respects both dark and light themes.
- Webview HTML is generated by the extension using `getNonce()` CSP pattern; all scripts are loaded from `panel.webview.asWebviewUri`.

**Todo List:**
1. Create `App.tsx` with state: `result: RootFlowResult | null`, `loading: boolean`, `error: string | null`, `selectedNode: GraphNode | null`.
2. Implement `window.addEventListener('message', ...)` in `App.tsx` to handle `loadResult`, `loading`, and `error` commands from the extension host.
3. Create `LoadingSkeleton.tsx` — animated placeholder replicating the metro graph layout.
4. Create `ErrorState.tsx` — displays the error message with a "Retry" button that posts `{ command: 'retry' }` to the extension.
5. Apply CSS custom properties throughout: use `var(--vscode-editor-background)`, `var(--vscode-foreground)`, `var(--vscode-focusBorder)`, etc.
6. Update `extension.ts` to generate the Webview HTML with correct CSP nonce, load the compiled Webview bundle, and post `loading` / `loadResult` / `error` messages at the right lifecycle points.

**Relevant Context:**
- `extension/src/extension.ts` — `WebviewPanel` creation and message passing
- VS Code Webview security: CSP, `getNonce()`, `asWebviewUri()`
- All Webview components from Sub-Tasks 6, 7, 8

---

### Sub-Task 10 — Integration, End-to-End Testing & Documentation

**Status:** `[ ] pending`

**Intent:**
Validate the full RootFlow pipeline end-to-end with a real fixture, write the developer-facing documentation, and ensure the extension can be packaged and installed.

**Expected Outcomes:**
- An `examples/` directory contains a small buggy Python project with a known failing test, used as the canonical E2E fixture.
- Running the extension against this fixture produces a correct `RootFlowResult` with all fields populated.
- `backend/tests/test_e2e.py` calls `POST /analyze` directly with the fixture error and asserts key fields of the result.
- The extension can be packaged with `vsce package` producing a `.vsix` installable file.
- `README.md` covers: prerequisites, environment variable setup, how to run the backend, how to install/debug the extension, and how to trigger analysis.

**Todo List:**
1. Create `examples/buggy_project/` — a minimal Python project with 3–4 files, a deliberate bug, and a pytest test that fails with a traceback.
2. Write `backend/tests/test_e2e.py` — starts the server in a subprocess, posts the fixture traceback, asserts `rootCause.file`, `rootCause.line`, `propagationPath` length > 1, and `suggestedFix.patch` is non-empty.
3. Add a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs `pytest backend/tests/` and `npm run test` in the extension.
4. Run `vsce package` and verify the `.vsix` installs cleanly in a fresh VS Code instance.
5. Finalize `README.md` with full setup guide, architecture diagram description, and troubleshooting section.

**Relevant Context:**
- All prior sub-tasks must be complete before this sub-task.
- `vsce` packaging: ensure `package.json` has correct `main`, `activationEvents`, and `files` fields.
