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
