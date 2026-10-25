import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const root = mkdtempSync(join(tmpdir(), "consilium-runner-test-"));
const exe = join(root, "consi.exe");
// Execute a copied standalone binary, outside the app and without a WebView.
cpSync(resolve("target/release/consi.exe"), exe);
const vault = join(root, "vault");
function cli(args, code = 0) {
  const result = spawnSync(exe, ["--vault", vault, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 45000,
  });
  assert.equal(result.status, code, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
const input = resolve("examples/wake-lab/reference.consilium");
const extracted = join(root, "folder");
assert.equal(cli(["extract", input, extracted]).executed, false);
const packed = join(root, "repacked.consi");
cli(["pack", extracted, packed]);
const without = join(root, "algorithm.consi");
cli(["pack", extracted, without, "--without-inputs"]);
assert.equal(JSON.parse(readFileSync(without)).assets.length, 0);
assert(!existsSync(vault), "Pack/extract must not create the working vault");
const imported = cli(["import", packed]);
const graph = cli(["inspect", imported.id, "--kind", "network"]);
const runtimeId = graph.value.nodes.find((n) => n.kind === "process").config
  .executable_binding;
cli(["bind", runtimeId, process.execPath, "--kind", "executable"]);
const review = cli(["review", imported.id]);
const approval = join(root, "approved.json");
writeFileSync(
  approval,
  JSON.stringify({
    network_id: imported.id,
    revision: review.plan.revision,
    approval_digest: review.approval_digest,
    input: {},
  }),
);
const paused = cli(["run", approval], 2);
assert.equal(paused.status, "awaiting_approval");
assert.notEqual(paused.nodes.report.state, "completed");
assert.deepEqual(
  paused.nodes.simulate.output.results,
  JSON.parse(readFileSync(resolve("examples/wake-lab/expected-results.json"))),
);
writeFileSync(
  approval,
  JSON.stringify({
    run_id: paused.id,
    approval_digest: paused.review.approval_digest,
    approved_nodes: ["approve"],
    retry_nodes: [],
  }),
);
const done = cli(["run", approval]);
assert.equal(done.status, "completed");
assert(done.nodes.report.output.document_id);
const doc = cli([
  "inspect",
  done.nodes.report.output.document_id,
  "--kind",
  "document",
]);
assert(doc.value.text.includes("no hardware contacted"));
assert.equal(cli(["runs"]).length, 1);
console.log(
  "Standalone EXE: pack/extract, no-input export, import, bind, review, 12 expected results, approval pause/resume and Wordcraft persistence passed.",
);
console.log("Synthetic test output: " + root);
