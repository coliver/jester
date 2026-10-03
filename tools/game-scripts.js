"use strict";

// The game is a set of plain <script> tags that share one global scope (no
// bundler, no `type="module"`, so index.html still works opened from disk).
// index.html is the single source of truth for which scripts there are and what
// order they load in; the lint config and the test loader both read it from here.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

// These need real audio / canvas support. Tests stub `Sound` and never paint
// the backdrop, so the loader skips them.
const BROWSER_ONLY = new Set(["src/sounds.js", "src/backdrop.js"]);

// Every script in index.html, in load order, as repo-relative paths.
function scriptPaths() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  return [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
}

// The scripts the game's logic lives in, as absolute paths.
function gameScripts() {
  return scriptPaths().filter((p) => !BROWSER_ONLY.has(p)).map((p) => path.join(ROOT, p));
}

// The names a script declares at the top level (column 0), which every script
// loaded after it, and every function it calls later, can see as globals.
function topLevelNames(file) {
  const names = { writable: [], readonly: [] };
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const fn = /^(?:async\s+)?function\s+(\w+)/.exec(line);
    const decl = /^(const|let|var)\s+(\w+)/.exec(line);
    if (fn) names.readonly.push(fn[1]);
    else if (decl) names[decl[1] === "const" ? "readonly" : "writable"].push(decl[2]);
  }
  return names;
}

module.exports = { ROOT, scriptPaths, gameScripts, topLevelNames };
