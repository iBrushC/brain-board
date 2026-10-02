#!/usr/bin/env node
/**
 * Builds the standalone viewer that every HTML export carries inline.
 *
 * Output goes to `public/export-viewer/`, so the app can fetch it at export
 * time and paste it into the file. Runs before `dev` and `build`; the output
 * is generated, so it is ignored by git.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "export-viewer");
const jsOut = join(outDir, "viewer.js");
const cssOut = join(outDir, "viewer.css");

mkdirSync(outDir, { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ["export-viewer/main.tsx"],
  outfile: jsOut,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  minify: true,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

const require = createRequire(import.meta.url);
const cliPackage = require.resolve("@tailwindcss/cli/package.json");
const cli = join(dirname(cliPackage), require(cliPackage).bin.tailwindcss);
execFileSync(
  process.execPath,
  [cli, "-i", "export-viewer/viewer.css", "-o", cssOut, "--minify"],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
);

// The bundle is inlined into a <script> and the CSS into a <style>, where a
// literal closing tag would end the element early. Escaped here once, rather
// than on every export.
writeFileSync(jsOut, readFileSync(jsOut, "utf8").replace(/<\/(script)/gi, "<\\/$1"));
writeFileSync(cssOut, readFileSync(cssOut, "utf8").replace(/<\/(style)/gi, "<\\/$1"));

console.log("Built the HTML export viewer into public/export-viewer/");
