import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const dir = new URL("../examples/wake-lab/", import.meta.url);
const write = (name, value) =>
  writeFileSync(new URL(name, dir), JSON.stringify(value, null, 2) + "\n");
const base = {
  device_id: "synthetic-laptop",
  signature_valid: true,
  age_seconds: 10,
  already_awake: false,
  wake_supported: true,
  power_available: true,
  primary_relay_online: true,
  primary_ack_attempt: 1,
  secondary_relay_online: true,
  secondary_ack: false,
};
const scenario = (id, patch = {}) => ({ id, nonce: id, ...base, ...patch });
const scenarios = [
  scenario("happy"),
  scenario("third-attempt", { primary_ack_attempt: 3 }),
  scenario("secondary", { primary_ack_attempt: null, secondary_ack: true }),
  scenario("primary-offline", {
    primary_relay_online: false,
    secondary_ack: true,
  }),
  scenario("both-offline", {
    primary_relay_online: false,
    secondary_relay_online: false,
  }),
  scenario("invalid-signature", { signature_valid: false }),
  scenario("expired", { age_seconds: 121 }),
  scenario("replayed", { nonce: "happy" }),
  scenario("unsupported", { wake_supported: false }),
  scenario("no-power", { power_available: false }),
  scenario("no-ack", { primary_ack_attempt: null }),
  scenario("already-awake", { already_awake: true }),
];
const input = {
  mode: "simulation",
  policy: {
    primary_attempts: 3,
    max_request_age_seconds: 120,
    secondary_enabled: true,
    allowed_devices: ["synthetic-laptop"],
  },
  scenarios,
};
write("lab-input.json", input);
const outcomes = [
  ["awake", 1, "primary", false],
  ["awake", 3, "primary", false],
  ["awake", 4, "secondary", false],
  ["awake", 1, "secondary", false],
  ["relay_unavailable", 0, "none", true],
  ["rejected_auth", 0, "none", false],
  ["rejected_expired", 0, "none", false],
  ["rejected_replay", 0, "none", false],
  ["manual_required", 0, "none", true],
  ["manual_required", 0, "none", true],
  ["manual_required", 4, "secondary", true],
  ["already_awake", 0, "none", false],
];
write(
  "expected-results.json",
  outcomes.map(([status, attempts, route, needs_review], i) => ({
    id: scenarios[i].id,
    status,
    attempts,
    route,
    needs_review,
  })),
);
const resultItem = {
  type: "object",
  additionalProperties: false,
  required: ["id", "status", "attempts", "route", "needs_review"],
  properties: {
    id: { type: "string" },
    status: {
      enum: [
        "awake",
        "already_awake",
        "rejected_auth",
        "rejected_expired",
        "rejected_replay",
        "manual_required",
        "relay_unavailable",
      ],
    },
    attempts: { type: "integer", minimum: 0, maximum: 4 },
    route: { enum: ["none", "primary", "secondary"] },
    needs_review: { type: "boolean" },
  },
};
const blockItem = {
  type: "object",
  required: ["kind", "text"],
  properties: {
    kind: { enum: ["heading", "paragraph"] },
    level: { type: "integer" },
    text: { type: "string" },
  },
};
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["mode", "results", "blocks"],
  properties: {
    mode: { const: "simulation" },
    results: { type: "array", minItems: 12, maxItems: 12, items: resultItem },
    blocks: { type: "array", items: blockItem },
  },
};
write("output-schema.json", schema);
const node = (id, kind, title, config, x) => ({
  id,
  kind,
  title,
  config,
  position: { x, y: 160 },
});
const edge = (source, target) => ({
  id: `${source}-${target}`,
  source,
  target,
  source_port: "out",
  target_port: "in",
});
const network = {
  schema_version: 1,
  id: "wake-lab-reference",
  name: "Phone wake lab — reference simulation",
  limits: {
    concurrency: 2,
    iterations: 5,
    model_calls: 8,
    timeout_seconds: 300,
  },
  nodes: [
    node(
      "read",
      "file_read",
      "Read scenarios",
      { binding_id: "wake-input", format: "json" },
      0,
    ),
    node(
      "simulate",
      "process",
      "Simulate relay decisions",
      {
        executable_binding: "node-runtime",
        extension: "js",
        source: readFileSync(new URL("simulator.cjs", dir), "utf8"),
        args: [],
        timeout_seconds: 30,
      },
      240,
    ),
    node("validate", "validate", "Validate output", { schema }, 480),
    node("approve", "approval", "Review simulated results", {}, 720),
    node(
      "report",
      "document_write",
      "Write lab report",
      { title: "Phone wake simulation report" },
      960,
    ),
    node("output", "output", "Validated simulation result", {}, 960),
  ],
  edges: [
    edge("read", "simulate"),
    edge("simulate", "validate"),
    edge("validate", "approve"),
    edge("approve", "report"),
    edge("approve", "output"),
  ],
};
network.nodes.at(-1).position.y = 400;
write("reference.network.json", {
  format: "consilium-network",
  version: 1,
  network,
});
write("reference.consilium", {
  format: "consilium-project",
  version: 1,
  root: { kind: "network", id: network.id },
  includes_inputs: true,
  records: [{ kind: "network", id: network.id, value: network }],
  bindings: [
    {
      id: "wake-input",
      name: "Synthetic scenarios",
      kind: "file",
      writable: false,
      relative: "assets/wake-input/lab-input.json",
    },
    {
      id: "node-runtime",
      name: "Installed Node.js",
      kind: "executable",
      writable: false,
    },
  ],
  assets: [
    {
      relative: "assets/wake-input/lab-input.json",
      bytes: [...Buffer.from(JSON.stringify(input))],
    },
  ],
});
console.log(
  "Generated wake lab input, answer key, schema and reference packages in " +
    fileURLToPath(dir),
);
