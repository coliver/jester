"use strict";

const js = require("@eslint/js");

// game.js/sounds.js are plain <script> tags (no bundler, no `type="module"`),
// so they share one global scope. `Sound` is a top-level `const` in
// sounds.js, loaded before game.js — that makes it a real global at runtime,
// even though ESLint can't see across files.
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  location: "readonly",
  URLSearchParams: "readonly",
  console: "readonly",
  localStorage: "readonly",
  Audio: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  performance: "readonly",
  // game.js also has a Node-only tail (module.exports guarded by
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
// that file's header comment for why) so game.js's DOM code runs — and gets
// coverage-tracked — in the same context node:test instruments.
const testDomGlobals = { document: "readonly", window: "readonly" };

module.exports = [
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  {
    files: ["game.js", "sounds.js", "court.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: browserGlobals,
    },
    rules: {
      // sounds.js swallows a blocked/unavailable localStorage on purpose.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // sounds.js declares `Sound`, game.js consumes it as a script global.
    files: ["game.js"],
    languageOptions: { globals: { Sound: "readonly" } },
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      ecmaVersion: 2022,
      globals: { ...nodeGlobals, ...testDomGlobals },
    },
  },
  {
    files: ["eslint.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      ecmaVersion: 2022,
      globals: nodeGlobals,
    },
  },
];
