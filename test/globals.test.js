// The scripts in src/ share one global scope, so ESLint can only check
// unused variables inside a file, not top-level names that another file might
// use. This is the stand-in for that check: every top-level name must be
// referenced somewhere besides its own declaration, and none may be declared
// twice (a redeclared `const` across <script> tags is a load-time SyntaxError).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, scriptPaths, topLevelNames } = require("../tools/game-scripts.js");

const files = scriptPaths().map((p) => path.join(ROOT, p));
const sources = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const names = files.flatMap((file) => {
  const { readonly, writable } = topLevelNames(file);
  return [...readonly, ...writable].map((name) => ({ name, file: path.relative(ROOT, file) }));
});

test("no top-level name is declared in two scripts", () => {
  const seen = new Map();
  for (const { name, file } of names) {
    assert.ok(!seen.has(name), `${name} is declared in both ${seen.get(name)} and ${file}`);
    seen.set(name, file);
  }
});

test("every top-level name is used somewhere", () => {
  const all = [...sources.values()].join("\n");
  for (const { name, file } of names) {
    const uses = all.match(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`, "g")) || [];
    assert.ok(uses.length > 1, `${name} (${file}) is declared but never used`);
  }
});
