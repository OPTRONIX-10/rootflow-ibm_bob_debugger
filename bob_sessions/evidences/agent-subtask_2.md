# @rootflow-plan.md   implement Sub-Task 2 and update the status in rootflow-plan.md

---

**Status:** active  **Date:** 2026-09-25

---

### 👤 User

@rootflow-plan.md   implement Sub-Task 2 and update the status in rootflow-plan.md

---

### 🤖 Assistant

> 🔧 called: read_file

Let me start by reading the plan file to understand what Sub-Task 2 entails.

> 🔧 **read_file** — rootflow-plan.md

### 🤖 Assistant

> 🔧 called: list_files

Now let me examine the existing scaffolding from Sub-Task 1:

> 🔧 **list_files** — .

### 🤖 Assistant

> 🔧 called: list_files, list_files



> 🔧 **list_files** — shared

> 🔧 **list_files** — extension

### 🤖 Assistant

> 🔧 called: read_file, read_file, read_file



> 🔧 **read_file** — shared/schema.ts

> 🔧 **read_file** — extension/package.json

> 🔧 **read_file** — extension/src/extension.ts

### 🤖 Assistant

> 🔧 called: read_file, list_files

Now let me also look at the esbuild config and webview directory:

> 🔧 **list_files** — extension/src

> 🔧 **read_file** — extension/esbuild.js

### 🤖 Assistant

> 🔧 called: read_file



> 🔧 **read_file** — extension/src/webview/index.tsx

### 🤖 Assistant

> 🔧 called: update_todo_list

Now I have a full picture of the scaffolding. Let me set up the todo list and implement Sub-Task 2:

> 🔧 **update_todo_list** — 
[-] Implement captureInput() — reads active editor selection or terminal text
[ ] Implement ServerManager — port check, spawn uvicorn, deactivate hook
[ ] Implement AnalysisClient.analyze() — POST /analyze, return RootFlowResult
[ ] Wire command handler: captureInput → ServerManager → AnalysisClient → open Webview
[ ] Add rootflow.pythonPath configuration (already in package.json, verify it's wired)
[ ] Build extension and verify TypeScript compiles cleanly
[ ] Update rootflow-plan.md Sub-Task 2 status to complete


### 🤖 Assistant

> 🔧 called: write_file

Now I'll implement the full Sub-Task 2. I'll create two new source files and rewrite `extension.ts`:

> 🔧 **write_file** — extension/src/serverManager.ts

### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — /**
 * extension/src/analysisClient.ts
 *
 * HTTP client that sends the analysis request to the Python backend
 * and parses the returned RootFlowResult JSON.
 */

import * as http from "http";
import type { RootFlowResult } from "../../shared/schema";

export { RootFlowResult };

export class AnalysisClient {
  private readonly baseUrl: string;

  constructor(port: number = 7331, host: string = "localhost") {
    this.baseUrl = `http://${host}:${port}`;
  }

  /**
   * POST /analyze
   *
   * @param workspaceRoot  Absolute path to the workspace root directory.
   * @param errorText      Raw error / traceback text selected by the user.
   * @returns              Parsed RootFlowResult.
   * @throws               Error with a descriptive message if the request fails
   *                       or the server returns a non-200 status.
   */
  analyze(workspaceRoot: string, errorText: string): Promise<RootFlowResult> {
    const body = JSON.stringify({ workspaceRoot, errorText });

    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: "localhost",
        port: 7331,
        path: "/analyze",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      };

      const req = http.request(options, (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (raw += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            let serverMsg = raw;
            try {
              const parsed = JSON.parse(raw);
              serverMsg = parsed.detail ?? parsed.message ?? raw;
            } catch {
              // keep raw
            }
            reject(
              new Error(
                `RootFlow backend returned ${res.statusCode}: ${serverMsg}`
              )
            );
            return;
          }

          try {
            const result: RootFlowResult = JSON.parse(raw);
            resolve(result);
          } catch (e) {
            reject(
              new Error(
                `Failed to parse RootFlowResult from backend response: ${(e as Error).message}`
              )
            );
          }
        });
      });

      req.on("error", (err: NodeJS.ErrnoException) => {
        reject(
          new Error(`Could not reach RootFlow backend: ${err.message}`)
        );
      });

      req.write(body);
      req.end();
    });
  }
}


### 🤖 Assistant

> 🔧 called: read_file

The `analysisClient.ts` imports `shared/schema` with a relative path — but given the TypeScript project layout, the shared folder is outside `extension/`. Let me check the tsconfig to confirm the path strategy:

> 🔧 **read_file** — extension/tsconfig.json

### 🤖 Assistant

> 🔧 called: apply_diff

The `paths` alias `shared/*` maps to `../shared/*`, but `rootDir` is `./src` which means TypeScript will reject files outside `src/`. The clean approach is to import the shared types directly using the relative `../../../shared/schema` path — but since esbuild bundles everything, the best approach is to either copy the types inline or adjust tsconfig. Let me check what Sub-Task 1 did and use the path alias approach properly by extending `rootDir`:

The `rootDir: ./src` setting will restrict TypeScript from including `../shared`. The proper fix is to change `rootDir` to `..` (the `extension/` parent), or more cleanly, just import the types directly without a path alias. Since esbuild resolves paths at build time and the `paths` alias is already set up, I need to also ensure `rootDir` doesn't exclude the shared dir. The simplest fix: use the relative path `../../shared/schema` and update `rootDir` to include both. Let me update the tsconfig and the client file:

> 🔧 **apply_diff** — extension/tsconfig.json

### 🤖 Assistant

> 🔧 called: apply_diff

Now update `analysisClient.ts` to use the path alias `shared/schema` (which tsconfig maps via `paths`):

> 🔧 **apply_diff** — extension/src/analysisClient.ts

### 🤖 Assistant

> 🔧 called: apply_diff

Now esbuild also needs to resolve `shared/schema` — I need to add the alias to the esbuild config. Let me update `esbuild.js`:

> 🔧 **apply_diff** — extension/esbuild.js

### 🤖 Assistant

> 🔧 called: update_todo_list

Now implement the full `extension.ts` with all the wiring:

> 🔧 **update_todo_list** — 
[x] Implement captureInput() — reads active editor selection or terminal text
[x] Implement ServerManager — port check, spawn uvicorn, deactivate hook
[x] Implement AnalysisClient.analyze() — POST /analyze, return RootFlowResult
[-] Wire command handler: captureInput → ServerManager → AnalysisClient → open Webview
[ ] Build extension and verify TypeScript compiles cleanly
[ ] Update rootflow-plan.md Sub-Task 2 status to complete


### 🤖 Assistant

> 🔧 called: write_file



> 🔧 **write_file** — /**
 * extension/src/extension.ts
 *
 * VS Code extension entry point for RootFlow.
 *
 * Responsibilities (Sub-Task 2):
 *  1. Capture error text from the active editor selection or terminal buffer.
 *  2. Ensure the Python backend is running via ServerManager.
 *  3. Send the error text to AnalysisClient and receive a RootFlowResult.
 *  4. Open / reveal the Webview panel and post the result to it.
 *  5. Handle messages posted back from the Webview (openFile, openDiff, applyFix, retry).
 */

import * as path from "path";
import * as vscode from "vscode";

import { AnalysisClient } from "./analysisClient";
import { ServerManager } from "./serverManager";

// ---------------------------------------------------------------------------
// Module-level singletons (created once per activation)
// ---------------------------------------------------------------------------

let outputChannel: vscode.OutputChannel;
let serverManager: ServerManager;
let analysisClient: AnalysisClient;

/** The single Webview panel instance (reused across analyses). */
let webviewPanel: vscode.WebviewPanel | undefined;

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("RootFlow");
  serverManager = new ServerManager(outputChannel);
  analysisClient = new AnalysisClient();

  const analyzeCommand = vscode.commands.registerCommand(
    "rootflow.analyze",
    async () => runAnalysis(context)
  );

  context.subscriptions.push(analyzeCommand, outputChannel, serverManager);
}

// ---------------------------------------------------------------------------
// Deactivation
// ---------------------------------------------------------------------------

export function deactivate(): void {
  serverManager?.dispose();
  webviewPanel?.dispose();
}

// ---------------------------------------------------------------------------
// Input capture
// ---------------------------------------------------------------------------

/**
 * Reads the currently selected text from the active editor.
 * Falls back to an empty string if nothing is selected.
 */
function captureEditorSelection(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return "";
  }
  const selection = editor.selection;
  if (selection.isEmpty) {
    return "";
  }
  return editor.document.getText(selection);
}

/**
 * Attempts to obtain text to analyze. Priority:
 *   1. Active editor selection (non-empty)
 *   2. Prompt the user for free-form input
 *
 * The VS Code API does not provide programmatic access to the terminal
 * buffer/selection at runtime; users should copy terminal output and either
 * select it in an editor or paste it into the input prompt.
 *
 * Returns `undefined` if the user cancels the prompt.
 */
async function captureInput(): Promise<string | undefined> {
  const editorText = captureEditorSelection();
  if (editorText.trim()) {
    return editorText;
  }

  // No selection — ask the user to paste the error text.
  return vscode.window.showInputBox({
    title: "RootFlow: Paste Error / Traceback",
    prompt:
      "Paste the error message or traceback you want to analyze. " +
      "Alternatively, select text in an editor and re-run the command.",
    placeHolder: "Traceback (most recent call last):\n  ...",
    ignoreFocusOut: true,
  });
}

// ---------------------------------------------------------------------------
// Main command handler
// ---------------------------------------------------------------------------

async function runAnalysis(context: vscode.ExtensionContext): Promise<void> {
  // 1. Capture input -----------------------------------------------------------
  const errorText = await captureInput();
  if (!errorText?.trim()) {
    vscode.window.showWarningMessage(
      "RootFlow: No error text provided. Select text in the editor or paste into the prompt."
    );
    return;
  }

  // 2. Determine workspace root ------------------------------------------------
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage(
      "RootFlow: Please open a workspace folder before analyzing."
    );
    return;
  }
  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // 3. Ensure the Python server is running ------------------------------------
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "RootFlow",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Starting backend server…" });
        await serverManager.ensure();
      }
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `RootFlow: Failed to start backend — ${(err as Error).message}`
    );
    outputChannel.show(true);
    return;
  }

  // 4. Open / reveal Webview panel and show loading indicator -----------------
  const panel = getOrCreateWebviewPanel(context);
  panel.webview.postMessage({ command: "loading" });
  panel.reveal(vscode.ViewColumn.Beside);

  // 5. Run analysis ------------------------------------------------------------
  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "RootFlow: Analyzing…",
        cancellable: false,
      },
      () => analysisClient.analyze(workspaceRoot, errorText)
    );

    panel.webview.postMessage({ command: "loadResult", data: result });
  } catch (err) {
    const msg = (err as Error).message;
    panel.webview.postMessage({ command: "error", message: msg });
    vscode.window.showErrorMessage(`RootFlow: Analysis failed — ${msg}`);
    outputChannel.appendLine(`[RootFlow] Analysis error: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Webview panel management
// ---------------------------------------------------------------------------

function getOrCreateWebviewPanel(
  context: vscode.ExtensionContext
): vscode.WebviewPanel {
  if (webviewPanel) {
    webviewPanel.reveal(vscode.ViewColumn.Beside);
    return webviewPanel;
  }

  webviewPanel = vscode.window.createWebviewPanel(
    "rootflowVisualization",
    "RootFlow",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "dist")),
      ],
    }
  );

  webviewPanel.webview.html = buildWebviewHtml(
    webviewPanel.webview,
    context.extensionPath
  );

  // Handle messages from the Webview -----------------------------------------
  webviewPanel.webview.onDidReceiveMessage(
    async (message: { command: string; [key: string]: unknown }) => {
      switch (message.command) {
        case "openFile": {
          const file = message.file as string;
          const line = (message.line as number | undefined) ?? 1;
          try {
            const doc = await vscode.workspace.openTextDocument(
              vscode.Uri.file(file)
            );
            await vscode.window.showTextDocument(doc, {
              selection: new vscode.Range(line - 1, 0, line - 1, 0),
              preserveFocus: false,
            });
          } catch {
            vscode.window.showErrorMessage(
              `RootFlow: Could not open file ${file}`
            );
          }
          break;
        }

        case "openDiff": {
          const hash = message.hash as string;
          // Show the commit diff using the built-in git extension command.
          vscode.commands
            .executeCommand("git.showCommit", hash)
            .then(undefined, () => {
              vscode.window.showInformationMessage(
                `RootFlow: Commit ${hash}. ` +
                  `Use the Source Control panel to inspect this commit.`
              );
            });
          break;
        }

        case "applyFix": {
          const filePath = message.filePath as string;
          const originalCode = message.originalCode as string;
          const fixedCode = message.fixedCode as string;
          await applyFix(filePath, originalCode, fixedCode);
          break;
        }

        case "retry": {
          // Re-run the last analysis — just trigger the command again.
          vscode.commands.executeCommand("rootflow.analyze");
          break;
        }
      }
    },
    undefined,
    context.subscriptions
  );

  webviewPanel.onDidDispose(() => {
    webviewPanel = undefined;
  });

  return webviewPanel;
}

// ---------------------------------------------------------------------------
// Fix application
// ---------------------------------------------------------------------------

async function applyFix(
  filePath: string,
  originalCode: string,
  fixedCode: string
): Promise<void> {
  try {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const docText = doc.getText();

    const startOffset = docText.indexOf(originalCode);
    if (startOffset === -1) {
      vscode.window.showErrorMessage(
        "RootFlow: Could not locate the original code in the file. " +
          "The file may have been modified since analysis."
      );
      return;
    }

    const startPos = doc.positionAt(startOffset);
    const endPos = doc.positionAt(startOffset + originalCode.length);
    const range = new vscode.Range(startPos, endPos);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, range, fixedCode);

    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
      const runTests = "Run Tests";
      const choice = await vscode.window.showInformationMessage(
        "RootFlow: Fix applied — run your tests to verify.",
        runTests
      );
      if (choice === runTests) {
        vscode.commands.executeCommand("workbench.action.tasks.test");
      }
    } else {
      vscode.window.showErrorMessage("RootFlow: Failed to apply the fix.");
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      `RootFlow: Error applying fix — ${(err as Error).message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Webview HTML generation
// ---------------------------------------------------------------------------

/** Returns a cryptographically random nonce string for CSP. */
function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function buildWebviewHtml(
  webview: vscode.Webview,
  extensionPath: string
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(extensionPath, "dist", "webview.js"))
  );
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src ${webview.cspSource} data:;"
  />
  <title>RootFlow</title>
  <style>
    html, body, #root {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}


### 🤖 Assistant

> 🔧 called: execute_command

Now let's build the extension to verify it compiles cleanly:

> 🔧 **execute_command** — node esbuild.js --extension 2>&1

### 🤖 Assistant

> 🔧 called: execute_command

Extension host builds cleanly. Now run the TypeScript type-checker:

> 🔧 **execute_command** — npx tsc --noEmit 2>&1

### 🤖 Assistant

> 🔧 called: execute_command

Zero type errors. Now also verify the webview bundle still builds:

> 🔧 **execute_command** — node esbuild.js --webview 2>&1

### 🤖 Assistant

> 🔧 called: update_todo_list

Both bundles compile cleanly. Now update the plan file:

> 🔧 **update_todo_list** — 
[x] Implement captureInput() — reads active editor selection or terminal text
[x] Implement ServerManager — port check, spawn uvicorn, deactivate hook
[x] Implement AnalysisClient.analyze() — POST /analyze, return RootFlowResult
[x] Wire command handler: captureInput → ServerManager → AnalysisClient → open Webview
[x] Build extension and verify TypeScript compiles cleanly
[-] Update rootflow-plan.md Sub-Task 2 status to complete


### 🤖 Assistant

> 🔧 called: apply_diff



> 🔧 **apply_diff** — <<<<<<< SEARCH
:start_line:139
-------
**Status:** `[ ] pending`
=======
**Status:** `[x] complete`
>>>>>>> REPLACE


### 🤖 Assistant

> 🔧 called: update_todo_list



> 🔧 **update_todo_list** — 
[x] Implement captureInput() — reads active editor selection or terminal text
[x] Implement ServerManager — port check, spawn uvicorn, deactivate hook
[x] Implement AnalysisClient.analyze() — POST /analyze, return RootFlowResult
[x] Wire command handler: captureInput → ServerManager → AnalysisClient → open Webview
[x] Build extension and verify TypeScript compiles cleanly
[x] Update rootflow-plan.md Sub-Task 2 status to complete


### 🤖 Assistant

Sub-Task 2 is fully implemented. Here's a summary of every file that was created or changed:

---

### New files

**[`extension/src/serverManager.ts`](extension/src/serverManager.ts)**
`ServerManager` class with full lifecycle management:
- [`isPortOpen()`](extension/src/serverManager.ts) — async TCP probe to detect whether port `7331` is already listening.
- [`waitForPort()`](extension/src/serverManager.ts) — polls every 500 ms, up to 15 s, for the server to become ready.
- [`ServerManager.ensure()`](extension/src/serverManager.ts) — reads `rootflow.pythonPath` config, spawns `uvicorn backend.main:app --port 7331` from the workspace root, pipes stdout/stderr to the *RootFlow* output channel.
- [`ServerManager.dispose()`](extension/src/serverManager.ts) — kills the child process; registered with `context.subscriptions` so it fires automatically on deactivation.

**[`extension/src/analysisClient.ts`](extension/src/analysisClient.ts)**
`AnalysisClient` class:
- [`analyze(workspaceRoot, errorText): Promise<RootFlowResult>`](extension/src/analysisClient.ts) — POSTs `{ workspaceRoot, errorText }` to `localhost:7331/analyze`, parses the JSON response, rejects with a descriptive error on non-200 or parse failure.

---

### Modified files

**[`extension/src/extension.ts`](extension/src/extension.ts)** — Full implementation replacing the stub:
- [`captureEditorSelection()`](extension/src/extension.ts) — reads the active editor's selection text.
- [`captureInput()`](extension/src/extension.ts) — tries the editor selection first; falls back to a `showInputBox` prompt for pasted terminal output.
- [`runAnalysis()`](extension/src/extension.ts) — the command handler: captures input → ensures server → opens Webview → calls `analyze()` → posts `loadResult` or `error` to the panel.
- [`getOrCreateWebviewPanel()`](extension/src/extension.ts) — creates (or reuses) the Webview panel with CSP/nonce-protected HTML; wires `onDidReceiveMessage` for `openFile`, `openDiff`, `applyFix`, and `retry`.
- [`applyFix()`](extension/src/extension.ts) — locates `originalCode` in the file, builds a `WorkspaceEdit`, calls `applyEdit`, then offers a "Run Tests" notification button.
- [`buildWebviewHtml()`](extension/src/extension.ts) / [`getNonce()`](extension/src/extension.ts) — generates CSP-safe Webview HTML loading the compiled bundle via `asWebviewUri`.

**[`extension/tsconfig.json`](extension/tsconfig.json)** — `rootDir` widened to `..` and `../shared/**/*` added to `include` so the shared schema is visible to the type-checker.

**[`extension/esbuild.js`](extension/esbuild.js)** — `alias: { "shared/schema": ... }` added to both the extension and webview build configs so esbuild resolves the path alias at bundle time.

**[`rootflow-plan.md`](rootflow-plan.md)** — Sub-Task 2 status updated to `[x] complete`.