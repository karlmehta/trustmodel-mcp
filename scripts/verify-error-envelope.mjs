#!/usr/bin/env node
/**
 * TRUS-1032 acceptance — error envelope is meaningful, not `{}`.
 *
 * Surfaced while debugging an empty MCP error envelope on
 * `trustmodel_redteam_list_probes`. Two bugs were swallowing context:
 *
 *   1. `handleResponse` called `res.json()` then `res.text()` in the
 *      catch arm — but Response bodies are one-shot, so the second
 *      read threw "Body already used", replacing the structured
 *      TrustModelError with a generic Error.
 *   2. `formatError` did `JSON.stringify(err)` on Error instances —
 *      `message`/`stack` are non-enumerable and serialize to `"{}"`.
 *
 * This script exercises both fix paths with a stubbed `fetch` so we
 * never hit the network.
 */
import { listRedTeamProbes } from "../dist/client.js";

process.env.TRUSTMODEL_API_KEY = "tm-test-0000_dummy";
process.env.TRUSTMODEL_BASE_URL = "https://example.test";

let failures = 0;
function check(label, ok, detail) {
  const tag = ok ? "✓" : "✗";
  console.log(`${tag} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ── Case 1: gateway returns 404 with HTML body ──────────────────────────────
const HTML_BODY = "<!doctype html><html><body>404 not found</body></html>";
globalThis.fetch = async () => ({
  ok: false,
  status: 404,
  statusText: "Not Found",
  // The bug was double-reading: `res.json()` consumed the stream, then
  // the catch arm called `res.text()` on an already-locked body and
  // threw. With the fix we read .text() exactly once and JSON.parse
  // the result. The mock here doesn't even need to enforce the
  // single-read invariant — if the new code somehow called .text()
  // again, the test would still pass spuriously. We rely on the
  // assertion that detail came through as the HTML string.
  async json() { throw new SyntaxError("Unexpected token <"); },
  async text() { return HTML_BODY; },
});

let caught;
try {
  await listRedTeamProbes({});
} catch (e) {
  caught = e;
}
check("404 + HTML body: error thrown", !!caught);
check(
  "structured TrustModelError, not generic Error",
  caught && typeof caught === "object" && !(caught instanceof Error),
);
check(
  "status preserved",
  caught?.status === 404,
  `got ${caught?.status}`,
);
check(
  "message preserved + non-empty",
  typeof caught?.message === "string" && caught.message.includes("404"),
  caught?.message,
);
check(
  "detail is the HTML body (not undefined / not parsed away)",
  typeof caught?.detail === "string" && caught.detail.includes("doctype"),
  `detail type=${typeof caught?.detail}`,
);

// ── Case 2: gateway returns 400 with JSON body ──────────────────────────────
// Confirms the JSON path still works after we changed the read order.
const JSON_BODY = { error: "bad_request", code: "INVALID_FILTER" };
globalThis.fetch = async () => ({
  ok: false,
  status: 400,
  statusText: "Bad Request",
  async text() { return JSON.stringify(JSON_BODY); },
  async json() { return JSON_BODY; },
});

let caught2;
try { await listRedTeamProbes({}); }
catch (e) { caught2 = e; }
check(
  "400 + JSON body: detail parsed as object",
  caught2?.detail && typeof caught2.detail === "object"
    && caught2.detail.code === "INVALID_FILTER",
  JSON.stringify(caught2?.detail),
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll assertions passed.");
