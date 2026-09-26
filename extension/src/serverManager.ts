/**
 * extension/src/serverManager.ts
 *
 * Manages the lifecycle of the RootFlow Python backend process.
 * - Checks whether port 7331 is already accepting connections.
 * - If not, spawns `<pythonPath> -m uvicorn backend.main:app --port 7331` from the workspace root.
 * - Exposes `dispose()` to kill the child process on extension deactivation.
 */

import * as cp from "child_process";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import * as vscode from "vscode";

export const SERVER_PORT = 7331;
export const SERVER_HOST = "localhost";

/**
 * Returns true when something is already listening on localhost:7331.
 */
function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket
      .once("connect", () => {
        socket.destroy();
        resolve(true);
      })
      .once("error", () => {
        socket.destroy();
        resolve(false);
      })
      .once("timeout", () => {
        socket.destroy();
        resolve(false);
      })
      .connect(port, host);
  });
}

/**
 * Waits until the port is open, polling every 500 ms up to `maxMs` milliseconds.
 */
function waitForPort(
  host: string,
  port: number,
  maxMs: number
): Promise<boolean> {
  const interval = 500;
  const attempts = Math.ceil(maxMs / interval);

  return new Promise((resolve) => {
    let tried = 0;

    const check = async () => {
      tried++;
      if (await isPortOpen(host, port)) {
        resolve(true);
        return;
      }
      if (tried >= attempts) {
        resolve(false);
        return;
      }
      setTimeout(check, interval);
    };

    check();
  });
}

function findProjectRoot(workspaceRoot: string): string {
  if (fs.existsSync(path.join(workspaceRoot, "backend", "main.py"))) {
    return workspaceRoot;
  }

  const parentRoot = path.dirname(workspaceRoot);
  if (fs.existsSync(path.join(parentRoot, "backend", "main.py"))) {
    return parentRoot;
  }

  return workspaceRoot;
}

function resolvePythonPath(configuredPath: string, projectRoot: string): string {
  if (configuredPath !== "python") {
    return configuredPath;
  }

  const candidates = process.platform === "win32"
    ? [
        path.join(projectRoot, ".venv", "Scripts", "python.exe"),
        path.join(projectRoot, "backend", ".venv", "Scripts", "python.exe"),
      ]
    : [
        path.join(projectRoot, ".venv", "bin", "python"),
        path.join(projectRoot, "backend", ".venv", "bin", "python"),
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? configuredPath;
}

export class ServerManager implements vscode.Disposable {
  private childProcess: cp.ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Ensures the Python server is running.
   * Resolves when the server is ready to accept requests.
   * Rejects with a descriptive message on failure.
   */
  async ensure(): Promise<void> {
    if (await isPortOpen(SERVER_HOST, SERVER_PORT)) {
      // Already running (externally or from a previous session).
      return;
    }

    const config = vscode.workspace.getConfiguration("rootflow");
    const configuredPythonPath: string = config.get("pythonPath") ?? "python";

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd();
    const cwd = findProjectRoot(workspaceRoot);
    const pythonPath = resolvePythonPath(configuredPythonPath, cwd);

    this.outputChannel.appendLine(
      `[RootFlow] Starting backend: ${pythonPath} -m uvicorn backend.main:app --port ${SERVER_PORT}`
    );
    this.outputChannel.appendLine(`[RootFlow] Working directory: ${cwd}`);

    const child = cp.spawn(
      pythonPath,
      ["-m", "uvicorn", "backend.main:app", "--port", String(SERVER_PORT)],
      {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        // On Windows detach=false so we can kill it cleanly
      }
    );

    this.childProcess = child;

    child.stdout?.on("data", (data: Buffer) => {
      this.outputChannel.append(`[backend] ${data.toString()}`);
    });
    child.stderr?.on("data", (data: Buffer) => {
      this.outputChannel.append(`[backend] ${data.toString()}`);
    });
    child.on("exit", (code) => {
      this.outputChannel.appendLine(
        `[RootFlow] Backend process exited (code ${code})`
      );
      this.childProcess = null;
    });

    // Wait up to 15 seconds for the server to become reachable.
    const ready = await waitForPort(SERVER_HOST, SERVER_PORT, 15_000);
    if (!ready) {
      child.kill();
      this.childProcess = null;
      throw new Error(
        `RootFlow backend did not start within 15 s. ` +
          `Check the 'RootFlow' output channel for details.`
      );
    }

    this.outputChannel.appendLine("[RootFlow] Backend is ready.");
  }

  dispose(): void {
    if (this.childProcess) {
      this.outputChannel.appendLine("[RootFlow] Stopping backend process.");
      this.childProcess.kill();
      this.childProcess = null;
    }
  }
}
