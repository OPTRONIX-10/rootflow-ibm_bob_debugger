/**
 * extension/src/analysisClient.ts
 *
 * HTTP client that sends the analysis request to the Python backend
 * and parses the returned RootFlowResult JSON.
 */

import * as http from "http";
import type { RootFlowResult } from "shared/schema";

export { RootFlowResult };

const ANALYSIS_TIMEOUT_MS = 75_000;

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
        hostname: new URL(this.baseUrl).hostname,
        port: Number(new URL(this.baseUrl).port),
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
          const responsePreview = raw.slice(0, 200).replace(/\s+/g, " ");
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

          if (!raw.trim()) {
            reject(
              new Error(
                "RootFlow backend returned an empty response. " +
                  "Check the RootFlow output channel for backend errors."
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
                `Failed to parse RootFlowResult from backend response: ${(e as Error).message}. ` +
                  `Response preview: ${responsePreview || "<empty>"}`
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

      req.setTimeout(ANALYSIS_TIMEOUT_MS, () => {
        req.destroy();
        reject(
          new Error(
            "RootFlow analysis timed out after 75 s. " +
              "Check the RootFlow output channel and backend logs."
          )
        );
      });

      req.write(body);
      req.end();
    });
  }
}
