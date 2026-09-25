// esbuild.js — build script for both the extension host and the Webview bundle
const esbuild = require("esbuild");
const path = require("path");

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");
const webviewOnly = args.includes("--webview");
const extensionOnly = args.includes("--extension");

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  sourcemap: true,
  minify: false,
  alias: {
    "shared/schema": path.resolve(__dirname, "../shared/schema.ts"),
  },
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ["src/webview/index.tsx"],
  bundle: true,
  outfile: "dist/webview.js",
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: true,
  minify: false,
  define: {
    "process.env.NODE_ENV": '"development"',
  },
  alias: {
    "shared/schema": path.resolve(__dirname, "../shared/schema.ts"),
  },
  // Bundle CSS files referenced via import statements.
  // esbuild emits a companion dist/webview.css that the Webview HTML loads.
  loader: { ".css": "css" },
};

async function build() {
  const configs = [];

  if (!webviewOnly) {
    configs.push(extensionConfig);
  }
  if (!extensionOnly) {
    configs.push(webviewConfig);
  }

  if (isWatch) {
    const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log("Watching for changes...");
  } else {
    await Promise.all(configs.map((c) => esbuild.build(c)));
    console.log("Build complete.");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
