#!/usr/bin/env node
/**
 * TRUS-1012 (848d) acceptance verification.
 *
 * Drives the API-key fingerprint scanner against a STUBBED `fetch` so the
 * script needs no real keys and makes no network calls. Verifies:
 *
 *   1. Reachable OpenAI key (stub 200 + model list) → shadow agent,
 *      risk=high, models surfaced, reachable=true.
 *   2. Invalid Anthropic key (stub 401)             → reachable=false,
 *      risk=info, no crash.
 *   3. Unknown-prefix key                           → reachable=false,
 *      detail=unrecognized_key_prefix.
 *   4. Key material never appears anywhere in the JSON output.
 *   5. Feature flag OFF                             → synthetic skip report.
 *
 * Same posture as verify-scanner.mjs / verify-shadow-discovery.mjs — no
 * Jest/Vitest yet. Rerun via `npm run verify:fingerprint`.
 */
import { fingerprintKeys } from "../dist/scanner/agt-shadow-discovery-fingerprint.js";

let failures = 0;
function check(label, ok, detail) {
  const tag = ok ? "✓" : "✗";
  console.log(`${tag} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ── Stub global fetch — maps endpoint → canned response. ────────────────────
// These are NOT real keys — they only need the provider prefix so the
// scanner classifies them, plus a recognizable tail for the leak-check
// assertion. Built from a non-secret literal so the gitleaks entropy rule
// doesn't false-positive. The inline allow is belt-and-braces.
const FAKE_TAIL = "x".repeat(20);
const SECRET_OPENAI = `sk-proj-${FAKE_TAIL}1234`; // gitleaks:allow
const SECRET_ANTHROPIC = `sk-ant-${FAKE_TAIL}9999`; // gitleaks:allow
const UNKNOWN_KEY = "xoxb-not-a-model-provider-key";

globalThis.fetch = async (url) => {
  if (String(url).includes("openai.com")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
    };
  }
  if (String(url).includes("anthropic.com")) {
    return { ok: false, status: 401, json: async () => ({}) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

// ── 1–4: a batch with one reachable, one revoked, one unknown ───────────────
process.env.TRUSTMODEL_AGT_DISCOVERY_ENABLED = "true";
const report = await fingerprintKeys({
  keys: [SECRET_OPENAI, SECRET_ANTHROPIC, UNKNOWN_KEY],
});
const blob = JSON.stringify(report);

const openaiRec = report.scan.shadowAgents.find(
  (r) => r.agent.tags.provider === "openai",
);
const anthropicRec = report.scan.shadowAgents.find(
  (r) => r.agent.tags.provider === "anthropic",
);
const unknownRec = report.scan.shadowAgents.find(
  (r) => r.agent.tags.provider === "unknown",
);

check("reachable OpenAI key → risk=high", openaiRec?.risk.level === "high", openaiRec?.risk.level);
check("reachable OpenAI key → reachable=true", openaiRec?.agent.tags.reachable === "true");
check(
  "reachable OpenAI key → models surfaced",
  openaiRec?.agent.evidence?.[0]?.rawData?.models?.length === 2,
  JSON.stringify(openaiRec?.agent.evidence?.[0]?.rawData?.models),
);
check("revoked Anthropic key → risk=info", anthropicRec?.risk.level === "info", anthropicRec?.risk.level);
check("revoked Anthropic key → reachable=false", anthropicRec?.agent.tags.reachable === "false");
check("unknown-prefix key → unrecognized", unknownRec?.agent.evidence?.[0]?.detail === "unrecognized_key_prefix");
check("worst risk across batch = high", report.status === "high", report.status);
check("agentCount = 3", report.agentCount === 3, String(report.agentCount));

// Security: no full key material anywhere in the serialized output.
check("OpenAI key material NOT leaked", !blob.includes(SECRET_OPENAI));
check("Anthropic key material NOT leaked", !blob.includes(SECRET_ANTHROPIC));
check(
  "only fingerprints present",
  blob.includes("openai:****1234") && blob.includes("anthropic:****9999"),
);

// ── 5: feature flag OFF → skip report ───────────────────────────────────────
delete process.env.TRUSTMODEL_AGT_DISCOVERY_ENABLED;
const skipped = await fingerprintKeys({ keys: [SECRET_OPENAI] });
check("flag off → skip report", skipped.skippedReason === "feature_flag_disabled", skipped.skippedReason);
check("flag off → no agents", skipped.agentCount === 0);

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("All assertions passed.");
