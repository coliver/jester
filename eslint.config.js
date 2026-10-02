"use strict";

const path = require("node:path");
const js = require("@eslint/js");
const { ROOT, scriptPaths, topLevelNames } = require("./tools/game-scripts");

// The scripts in src/ are plain <script> tags (no bundler, no `type="module"`),
// so they share one global scope: a top-level declaration in one file is a
// global in every other. ESLint can't see across files, so each script is
// given the other scripts' top-level names as globals (read from index.html's
// script list; `let` names are writable, since e.g. `state` is reassigned from
// several files).
const scripts = scriptPaths().map((p) => path.join(ROOT, p));
const declared = new Map(scripts.map((file) => [file, topLevelNames(file)]));

function sharedGlobals(file) {
  const globals = {};
  for (const [other, names] of declared) {
    if (other === file) continue;
    for (const n of names.readonly) globals[n] = "readonly";
    for (const n of names.writable) globals[n] = "writable";
  }
  return globals;
}

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  location: "readonly",
  history: "readonly",
  navigator: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  console: "readonly",
  localStorage: "readonly",
  Audio: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  performance: "readonly",
  // main.js also has a Node-only tail (module.exports guarded by
  // `typeof module !== "undefined"`) so its test suite can import the pure
  // functions; these stay `undefined` in the browser.
  module: "readonly",
  require: "readonly",
};

const nodeGlobals = {
  require: "readonly",
  module: "writable",
  global: "writable",
  console: "readonly",
  __dirname: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
};

// test/render.test.js attaches a jsdom document/window to Node's global (see
// that file's header comment for why) so the game's DOM code runs — and gets
// coverage-tracked — in the same context node:test instruments.
const testDomGlobals = { document: "readonly", window: "readonly" };

module.exports = [
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  ...scripts.map((file) => ({
    files: [path.relative(ROOT, file)],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: { ...browserGlobals, ...sharedGlobals(file) },
    },
    rules: {
      // sounds.js swallows a blocked/unavailable localStorage on purpose.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // A top-level name is used by *other* scripts, which ESLint can't see, so
      // only local variables can be checked. test/globals.test.js catches
      // top-level names that nothing uses.
      "no-unused-vars": ["error", { vars: "local" }],
    },
  })),
  {
    files: ["test/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      ecmaVersion: 2022,
      globals: { ...nodeGlobals, ...testDomGlobals },
    },
  },
  {
    files: ["eslint.config.js", "tools/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      ecmaVersion: 2022,
      globals: nodeGlobals,
    },
  },
];
