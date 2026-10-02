"use strict";

// Loads the game's scripts under Node the way a browser would (each runs as a
// classic script in the shared global scope, in index.html's order) and exports
// the test hooks that src/main.js builds. Requiring this file twice is fine:
// Node caches it, so the scripts only ever run once per process.
//
// Tests that need a DOM set `global.document`/`global.window` before requiring
// this, and a `global.Sound` stub for the audio that sounds.js would provide.

const fs = require("node:fs");
const vm = require("node:vm");
const { gameScripts } = require("./game-scripts");

// main.js ends with `module.exports = testHooks` when a `module` exists; a
// classic script has none of its own, so lend it one for the duration.
global.module = { exports: {} };
try {
  for (const file of gameScripts()) {
    vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
  }
  module.exports = global.module.exports;
} finally {
  delete global.module;
}
