// Deterministic test double. No networking, filesystem writes, waiting or hardware control.
const fs = require("node:fs");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
if (!input || input.mode !== "simulation" || !Array.isArray(input.scenarios))
  throw Error("Simulation input required");
if (input.scenarios.length > 100) throw Error("At most 100 scenarios");
const policy = input.policy;
if (
  !policy ||
  !Number.isInteger(policy.primary_attempts) ||
  policy.primary_attempts < 1 ||
  policy.primary_attempts > 3
)
  throw Error("Primary attempts must be 1..3");
if (
  !Number.isInteger(policy.max_request_age_seconds) ||
  policy.max_request_age_seconds < 1 ||
  policy.max_request_age_seconds > 300
)
  throw Error("Invalid request lifetime");
const seen = new Set();
const results = input.scenarios.map((s) => {
  if (
    typeof s.id !== "string" ||
    typeof s.nonce !== "string" ||
    !Number.isFinite(s.age_seconds)
  )
    throw Error("Malformed scenario");
  const result = {
    id: s.id,
    status: "",
    attempts: 0,
    route: "none",
    needs_review: false,
  };
  const stop = (status, review = false) =>
    Object.assign(result, { status, needs_review: review });
  if (
    s.signature_valid !== true ||
    !policy.allowed_devices.includes(s.device_id)
  )
    return stop("rejected_auth");
  if (s.age_seconds < 0 || s.age_seconds > policy.max_request_age_seconds)
    return stop("rejected_expired");
  if (seen.has(s.nonce)) return stop("rejected_replay");
  seen.add(s.nonce); // Only authenticated, timely requests enter the simulated replay store.
  if (s.already_awake === true) return stop("already_awake");
  if (s.wake_supported !== true || s.power_available !== true)
    return stop("manual_required", true);
  if (s.primary_relay_online === true) {
    result.route = "primary";
    for (let i = 1; i <= policy.primary_attempts; i++) {
      result.attempts++;
      if (s.primary_ack_attempt === i) return stop("awake");
    }
  }
  if (policy.secondary_enabled === true && s.secondary_relay_online === true) {
    result.route = "secondary";
    result.attempts++;
    if (s.secondary_ack === true) return stop("awake");
  }
  return stop(result.attempts ? "manual_required" : "relay_unavailable", true);
});
const blocks = [
  {
    kind: "heading",
    level: 1,
    text: "Phone wake simulation — no hardware contacted",
  },
  ...results.map((r) => ({
    kind: "paragraph",
    text: `${r.id}: ${r.status}; ${r.attempts} simulated attempts; route ${r.route}; review ${r.needs_review}.`,
  })),
];
process.stdout.write(JSON.stringify({ mode: "simulation", results, blocks }));
