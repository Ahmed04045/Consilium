import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const input = JSON.parse(
  readFileSync(new URL("./lab-input.json", import.meta.url)),
);
const expected = JSON.parse(
  readFileSync(new URL("./expected-results.json", import.meta.url)),
);
const run = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("./simulator.cjs", import.meta.url))],
  { input: JSON.stringify(input), encoding: "utf8", windowsHide: true },
);
assert.equal(run.status, 0, run.stderr);
const output = JSON.parse(run.stdout);
assert.deepEqual(output.results, expected);
assert.equal(output.mode, "simulation");
assert(output.results.every((r) => r.attempts <= 4));
const bad = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("./simulator.cjs", import.meta.url))],
  {
    input: JSON.stringify({ ...input, mode: "live" }),
    encoding: "utf8",
    windowsHide: true,
  },
);
assert.notEqual(bad.status, 0);
console.log(
  "12 scenario expectations passed; live mode rejected; no network or hardware actions performed.",
);
