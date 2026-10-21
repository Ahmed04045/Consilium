// Rebuild bundled license texts from the exact, resolved WASM dependency graph.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const metadata = JSON.parse(execFileSync("cargo", [
  "metadata", "--manifest-path", "integrations/wordcraft/Cargo.toml",
  "--locked", "--format-version", "1", "--filter-platform", "wasm32-unknown-unknown"
], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
const used = new Set();
function visit(id) {
  if (used.has(id)) return;
  used.add(id);
  for (const dep of nodes.get(id)?.deps || []) visit(dep.pkg);
}
visit(metadata.resolve.root);
const included = new Set();
const parts = ["Consilium Wordcraft integration — third-party Rust licenses", ""];
for (const pkg of metadata.packages.filter(pkg => used.has(pkg.id)).sort((a, b) => a.name.localeCompare(b.name))) {
  parts.push(`\n${pkg.name} ${pkg.version}\nLicense: ${pkg.license || "See license text"}\nSource: ${pkg.repository || pkg.source || "Consilium"}`);
  let directory = dirname(pkg.manifest_path);
  let files = [];
  if (pkg.license_file) files.push(join(directory, pkg.license_file));
  for (let depth = 0; depth < (pkg.source?.startsWith("git+") ? 4 : 1); depth++) {
    files.push(...readdirSync(directory, { withFileTypes: true })
      .filter(file => file.isFile() && /^(license|licence|copying|notice)([-._]|$)/i.test(file.name))
      .map(file => join(directory, file.name)));
    directory = dirname(directory);
  }
  for (const file of files.filter(existsSync)) {
    if (included.has(file)) continue;
    included.add(file);
    parts.push(readFileSync(file, "utf8"));
  }
}
writeFileSync("apps/desktop/public/wordcraft/licenses/Rust-dependencies.txt", parts.join("\n\n"));
console.log(`Collected license texts for ${used.size} resolved editor packages.`);
