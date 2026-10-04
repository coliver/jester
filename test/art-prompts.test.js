// Keeps the art prompt sheets (assets/<kind>/prompts.csv, read by
// tools/imagegen/queue_cards.py) in step with the card pools in src/:
// every card has exactly one prompt, and no prompt is left pointing at a card
// that no longer exists. src/ owns ids, names and rarities; the CSVs own
// only the prompt text.
"use strict";

global.Sound = new Proxy({}, { get: () => () => {} });

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JESTER_POOL, DECREE_POOL, TRICK_POOL, BOSS_POOL, PROP_POOL } = require("../tools/load-game.js");

// Minimal RFC 4180 reader: quoted fields, "" escapes, CRLF or LF.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const KINDS = { jesters: JESTER_POOL, decrees: DECREE_POOL, masks: TRICK_POOL, bosses: BOSS_POOL, props: PROP_POOL };

for (const [kind, pool] of Object.entries(KINDS)) {
  test(`assets/${kind}/prompts.csv has one prompt per ${kind} card`, () => {
    const file = path.join(__dirname, "..", "assets", kind, "prompts.csv");
    const [header, ...rows] = parseCsv(fs.readFileSync(file, "utf8"));
    assert.deepEqual(header, ["id", "prompt"]);

    const ids = rows.map(r => r[0]);
    assert.equal(new Set(ids).size, ids.length, "duplicate ids in CSV");
    for (const [id, prompt] of rows) assert.ok(prompt && prompt.trim(), `${id} has an empty prompt`);

    const poolIds = pool.map(c => c.id);
    assert.deepEqual(
      {
        missingPrompt: poolIds.filter(id => !ids.includes(id)),
        unknownCard: ids.filter(id => !poolIds.includes(id)),
      },
      { missingPrompt: [], unknownCard: [] },
    );
  });
}
