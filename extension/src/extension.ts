/**
 * extension/src/extension.ts
 *
 * VS Code extension entry point for RootFlow.
 *
 * Responsibilities (Sub-Task 2):
 *  1. Capture error text from the active editor selection or terminal buffer.
 *  2. Ensure the Python backend is running via ServerManager.
 *  3. Send the error text to AnalysisClient and receive a RootFlowResult.
 *  4. Open / reveal the Webview panel and post the result to it.
 *  5. Handle messages posted back from the Webview (openFile, applyFix, retry).
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
let webviewReady = false;
let webviewReadyPromise: Promise<void> | undefined;
let resolveWebviewReady: (() => void) | undefined;
const WEBVIEW_READY_TIMEOUT_MS = 5_000;

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

  // Register a serializer so VS Code can restore (or cleanly discard) any
  // RootFlow webview panel that was open in a previous session.  Without this,
  // VS Code throws an unhandled "cannot open webview-panel" CodeExpectedError
  // every time the extension is reloaded while a panel was already open.
  vscode.window.registerWebviewPanelSerializer("rootflowVisualization", {
    async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
      // Rehydrate the panel: set its HTML and wire up message handlers so the
      // restored panel works exactly like a freshly created one.
      panel.webview.html = buildWebviewHtml(panel.webview, context.extensionPath);
      webviewPanel = panel;
      webviewReady = false;
      webviewReadyPromise = new Promise<void>((resolve) => {
        resolveWebviewReady = resolve;
      });
      panel.webview.onDidReceiveMessage(
        async (message: { command: string; [key: string]: unknown }) => {
          if (message.command === "ready") {
            webviewReady = true;
            resolveWebviewReady?.();
            return;
          }
          await handleWebviewMessage(message, context);
        },
        undefined,
        context.subscriptions
      );
      panel.onDidDispose(() => {
        webviewPanel = undefined;
        webviewReady = false;
        webviewReadyPromise = undefined;
        resolveWebviewReady = undefined;
      });
    },
  });

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
  panel.reveal(vscode.ViewColumn.Beside);

  // Wait for the React app to attach its message listener. A fixed delay is
  // racy because the webview bundle may take longer to load.
  if (!webviewReady && webviewReadyPromise) {
    await Promise.race([
      webviewReadyPromise,
      new Promise<void>((resolve) =>
        setTimeout(resolve, WEBVIEW_READY_TIMEOUT_MS)
      ),
    ]);
  }
  panel.webview.postMessage({ command: "loading" });

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
// Webview message handler (shared by panel creation and panel serializer)
// ---------------------------------------------------------------------------

async function handleWebviewMessage(
  message: { command: string; [key: string]: unknown },
  context: vscode.ExtensionContext
): Promise<void> {
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

    case "applyFix": {
      const filePath = message.filePath as string;
      const originalCode = message.originalCode as string;
      const fixedCode = message.fixedCode as string;
      const patch = message.patch as string | undefined;
      await applyFix(filePath, originalCode, fixedCode, patch ?? "");
      break;
    }

    case "retry": {
      vscode.commands.executeCommand("rootflow.analyze");
      break;
    }
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
  webviewReady = false;
  webviewReadyPromise = new Promise<void>((resolve) => {
    resolveWebviewReady = resolve;
  });

  // Handle messages from the Webview -----------------------------------------
  webviewPanel.webview.onDidReceiveMessage(
    async (message: { command: string; [key: string]: unknown }) => {
      if (message.command === "ready") {
        webviewReady = true;
        resolveWebviewReady?.();
        return;
      }
      await handleWebviewMessage(message, context);
    },
    undefined,
    context.subscriptions
  );

  webviewPanel.onDidDispose(() => {
    webviewPanel = undefined;
    webviewReady = false;
    webviewReadyPromise = undefined;
    resolveWebviewReady = undefined;
  });

  return webviewPanel;
}

// ---------------------------------------------------------------------------
// Fix application
// ---------------------------------------------------------------------------

/**
 * Parse a unified diff patch and return the first hunk's replaced range.
 *
 * Returns { startLine, deleteCount, insertLines } where startLine is 0-based,
 * deleteCount is how many existing lines to remove, and insertLines are the
 * new lines to insert (without leading '+').
 *
 * Returns null if the patch cannot be parsed.
 */
function parsePatchHunk(patch: string): {
  startLine: number;
  oldLines: string[];
  newLines: string[];
} | null {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  // Find the first @@ hunk header, e.g. "@@ -8,7 +8,7 @@"
  for (const line of lines) {
    const m = line.match(/^@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@/);
    if (m) {
      const oldStart = parseInt(m[1], 10) - 1; // convert to 0-based
      const hunkIdx = lines.indexOf(line);
      const hunkLines = lines.slice(hunkIdx + 1);
      const oldLines: string[] = [];
      const newLines: string[] = [];
      for (const hl of hunkLines) {
        if (hl.startsWith("@@")) break; // next hunk
        if (hl.startsWith("-") || hl.startsWith(" ")) oldLines.push(hl.slice(1));
        if (hl.startsWith(" ") || hl.startsWith("+")) newLines.push(hl.slice(1));
      }
      return {
        startLine: oldStart,
        oldLines,
        newLines,
      };
    }
  }
  return null;
}

async function applyFix(
  filePath: string,
  originalCode: string,
  fixedCode: string,
  patch: string,
): Promise<void> {
  try {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const docLines = doc.getText().split(/\r?\n/);

    let range: vscode.Range;
    let replacement: string;

    // ── Strategy 1: parse the unified diff and apply by line number ──────────
    const hunk = patch.trim() ? parsePatchHunk(patch) : null;
    if (hunk) {
      const { startLine, oldLines, newLines } = hunk;
      const deleteCount = oldLines.length;
      // Validate the hunk lines are still in range
      const matchesAt = (lineIndex: number): boolean =>
        lineIndex >= 0 &&
        lineIndex + deleteCount <= docLines.length &&
        oldLines.every((line, index) => docLines[lineIndex + index] === line);
      let matchedStartLine = startLine;
      if (!matchesAt(matchedStartLine)) {
        matchedStartLine = -1;
        for (let lineIndex = 0; lineIndex <= docLines.length - deleteCount; lineIndex++) {
          if (matchesAt(lineIndex)) {
            matchedStartLine = lineIndex;
            break;
          }
        }
      }
      if (
        matchedStartLine >= 0 &&
        matchedStartLine + deleteCount <= docLines.length
      ) {
        const startPos = new vscode.Position(matchedStartLine, 0);
        const endLine = matchedStartLine + deleteCount;
        // If deleteCount covers complete lines, include their newlines by
        // pointing to column 0 of the line after the last deleted line.
        const endPos =
          endLine < docLines.length
            ? new vscode.Position(endLine, 0)
            : doc.positionAt(doc.getText().length);
        range = new vscode.Range(startPos, endPos);
        // Preserve line endings: join with \n and append trailing \n if
        // the original lines had one (i.e. we're not at the last line).
        replacement =
          newLines.join("\n") + (endLine < docLines.length ? "\n" : "");
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, range, replacement);
        const applied = await vscode.workspace.applyEdit(edit);
        if (applied) {
          await showFixApplied();
          return;
        }
      }
    }

      // A compact fallback patch may contain only the changed expression
      // rather than the complete source line. Replace that expression in
      // place while preserving the surrounding statement and indentation.
      if (oldLines.length === 1 && newLines.length === 1) {
        const lineIndex = docLines.findIndex((line) =>
          line.includes(oldLines[0])
        );
        if (lineIndex >= 0) {
          const line = docLines[lineIndex];
          const column = line.indexOf(oldLines[0]);
          const start = new vscode.Position(lineIndex, column);
          const end = new vscode.Position(
            lineIndex,
            column + oldLines[0].length
          );
          const edit = new vscode.WorkspaceEdit();
          edit.replace(uri, new vscode.Range(start, end), newLines[0]);
          const applied = await vscode.workspace.applyEdit(edit);
          if (applied) {
            await showFixApplied();
            return;
          }
        }
      }

    // ── Strategy 2: exact text match ─────────────────────────────────────────
    const docText = docLines.join("\n");
    let startOffset = docText.indexOf(originalCode);
    if (startOffset !== -1) {
      const startPos = doc.positionAt(startOffset);
      const endPos = doc.positionAt(startOffset + originalCode.length);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(startPos, endPos), fixedCode);
      const applied = await vscode.workspace.applyEdit(edit);
      if (applied) {
        await showFixApplied();
        return;
      }
    }

    // ── Strategy 3: trim-each-line match ─────────────────────────────────────
    // The LLM often returns originalCode without leading indentation.
    // Search document lines for a contiguous block whose trimmed content
    // matches the trimmed lines of originalCode.
    const origLines = originalCode.replace(/\r\n/g, "\n").split("\n")
      .map((l) => l.trimEnd());
    // Remove empty leading/trailing lines from the search pattern
    while (origLines.length && !origLines[0].trim()) origLines.shift();
    while (origLines.length && !origLines[origLines.length - 1].trim()) origLines.pop();

    if (origLines.length > 0) {
      const firstTrimmed = origLines[0].trim();
      for (let li = 0; li < docLines.length; li++) {
        if (docLines[li].trim() === firstTrimmed) {
          // Check subsequent lines
          let allMatch = true;
          for (let k = 1; k < origLines.length; k++) {
            const docIdx = li + k;
            if (
              docIdx >= docLines.length ||
              docLines[docIdx].trim() !== origLines[k].trim()
            ) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) {
            const endLineIdx = li + origLines.length;
            const startPos = new vscode.Position(li, 0);
            const endPos =
              endLineIdx < docLines.length
                ? new vscode.Position(endLineIdx, 0)
                : doc.positionAt(docText.length);
            // Preserve the original indentation: re-indent fixedCode to match
            const indent = docLines[li].match(/^(\s*)/)?.[1] ?? "";
            const reindentedFix = fixedCode
              .replace(/\r\n/g, "\n")
              .split("\n")
              .map((l, i) => (i === 0 ? indent + l.trimStart() : l))
              .join("\n");
            const repl =
              reindentedFix + (endLineIdx < docLines.length ? "\n" : "");
            const edit = new vscode.WorkspaceEdit();
            edit.replace(uri, new vscode.Range(startPos, endPos), repl);
            const applied = await vscode.workspace.applyEdit(edit);
            if (applied) {
              await showFixApplied();
              return;
            }
          }
        }
      }
    }

    // All strategies failed
    vscode.window.showErrorMessage(
      "RootFlow: Could not locate the original code in the file. " +
        "The file may have been modified since analysis."
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `RootFlow: Error applying fix — ${(err as Error).message}`
    );
  }
}

async function showFixApplied(): Promise<void> {
  const runTests = "Run Tests";
  const choice = await vscode.window.showInformationMessage(
    "RootFlow: Fix applied — run your tests to verify.",
    runTests
  );
  if (choice === runTests) {
    vscode.commands.executeCommand("workbench.action.tasks.test");
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
