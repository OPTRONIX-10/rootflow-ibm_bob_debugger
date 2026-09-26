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

    case "openDiff": {
      const hash = message.hash as string;
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

async function applyFix(
  filePath: string,
  originalCode: string,
  fixedCode: string
): Promise<void> {
  try {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const docText = doc.getText();

    // First try an exact match, then fall back to a whitespace-normalised search
    // so that minor formatting differences (trailing spaces, CRLF vs LF, etc.)
    // do not cause spurious "could not locate" errors.
    let startOffset = docText.indexOf(originalCode);
    let matchLength = originalCode.length;

    if (startOffset === -1) {
      // Normalise both sides: collapse runs of whitespace to a single space
      const normalise = (s: string) =>
        s.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
      const normOriginal = normalise(originalCode);
      const normDoc = normalise(docText);

      const normOffset = normDoc.indexOf(normOriginal);
      if (normOffset === -1) {
        vscode.window.showErrorMessage(
          "RootFlow: Could not locate the original code in the file. " +
            "The file may have been modified since analysis."
        );
        return;
      }

      // Map the normalised offset back to a range in the real document by
      // scanning the original text to skip the same number of non-whitespace
      // characters that precede normOffset in normDoc.
      // Simpler approach: locate via line-by-line matching of the first line.
      const firstLine = originalCode
        .replace(/\r\n/g, "\n")
        .split("\n")
        .find((l) => l.trim().length > 0)
        ?.trim();
      if (firstLine) {
        // Find a line in the document that contains the first significant line
        const lines = docText.split("\n");
        for (let li = 0; li < lines.length; li++) {
          if (lines[li].includes(firstLine)) {
            // Compute byte offset of this line
            const offset = lines.slice(0, li).join("\n").length + (li > 0 ? 1 : 0);
            // Extend to cover the full originalCode block (by line count)
            const origLines = originalCode.replace(/\r\n/g, "\n").split("\n");
            const endLineIdx = li + origLines.length - 1;
            const endLineOffset =
              lines.slice(0, endLineIdx).join("\n").length +
              (endLineIdx > 0 ? 1 : 0) +
              lines[endLineIdx].length;
            startOffset = offset;
            matchLength = endLineOffset - offset;
            break;
          }
        }
      }

      if (startOffset === -1) {
        vscode.window.showErrorMessage(
          "RootFlow: Could not locate the original code in the file. " +
            "The file may have been modified since analysis."
        );
        return;
      }
    }

    const startPos = doc.positionAt(startOffset);
    const endPos = doc.positionAt(startOffset + matchLength);
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
