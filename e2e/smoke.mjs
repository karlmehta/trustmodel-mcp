#!/usr/bin/env node
/**
 * Axis-2 E2E smoke harness (TRUS-1037).
 *
 * Exercises the five Axis-2 features against a configured environment
 * and reports pass/fail per feature. Designed to surface stack-up gaps
 * (deploy lag, missing endpoints, broken integrations) before the
 * Friday demo. Re-runnable; each step is independent.
 *
 * Layers asserted per step:
 *   - TRUS-847 (MCP scanner)            local AGT call only
 *   - TRUS-848 (Shadow Discovery)       local AGT call only
 *   - TRUS-726 (Red Team list_probes)   MCP → gateway → DB
 *   - TRUS-872 (Shadow AI AWS scan)     MCP → gateway → DB
 *   - TRUS-873 (Shadow AI Azure scan)   MCP → gateway → DB
 *
 * The webhook leg is NOT exercised here (needs a configured subscriber
 * endpoint to verify against) — tracked as a v2 follow-up.
 *
 * Required env:
 *   TRUSTMODEL_API_KEY  — QA SDK API key
 *   TRUSTMODEL_BASE_URL — QA gateway base URL (e.g. https://api-trustmodel.pdxqa.com)
 *
 * Optional env (only needed for the AGT-backed local steps):
 *   TRUSTMODEL_AGT_DISCOVERY_ENABLED=true
 *
 * Exit codes:
 *   0 — all steps green
 *   1 — at least one step failed
 *   2 — required env missing (couldn't run gateway steps)
 */
import { runMcpScannerStep } from "./steps/mcp-scan-server.mjs";
import { runShadowDiscoveryStep } from "./steps/shadow-discovery.mjs";
import { runRedTeamListProbesStep } from "./steps/redteam-list-probes.mjs";
import { runShadowAIAwsStep } from "./steps/shadow-ai-aws.mjs";
import { runShadowAIAzureStep } from "./steps/shadow-ai-azure.mjs";

// ── Config ──────────────────────────────────────────────────────────────────

const apiKey = process.env.TRUSTMODEL_API_KEY;
const baseUrl = process.env.TRUSTMODEL_BASE_URL;

if (!apiKey || !baseUrl) {
  console.error(
    "ERROR: TRUSTMODEL_API_KEY and TRUSTMODEL_BASE_URL must both be set.\n" +
    "  TRUSTMODEL_API_KEY  → QA SDK API key (tm-qa-...)\n" +
    "  TRUSTMODEL_BASE_URL → QA gateway base URL\n",
  );
  process.exit(2);
}

// Force the discovery feature flag on so the AGT local-call steps don't
// silently skip. (The MCP server reads this fresh per call.)
process.env.TRUSTMODEL_AGT_DISCOVERY_ENABLED = "true";

const ctx = { apiKey, baseUrl };

// ── Run ─────────────────────────────────────────────────────────────────────

const steps = [
  { ticket: "TRUS-847", run: runMcpScannerStep },
  { ticket: "TRUS-848", run: runShadowDiscoveryStep },
  { ticket: "TRUS-726", run: runRedTeamListProbesStep },
  { ticket: "TRUS-872", run: runShadowAIAwsStep },
  { ticket: "TRUS-873", run: runShadowAIAzureStep },
];

console.log(`\n=== Axis-2 E2E smoke ===`);
console.log(`Target: ${baseUrl}`);
console.log(`Started: ${new Date().toISOString()}\n`);

const results = [];
for (const { ticket, run } of steps) {
  const startedAt = Date.now();
  let result;
  try {
    result = await run(ctx);
  } catch (err) {
    result = {
      name: ticket,
      ok: false,
      detail: "step threw unexpectedly",
      error: err instanceof Error
        ? `${err.name}: ${err.message}`
        : JSON.stringify(err),
    };
  }
  const ms = Date.now() - startedAt;
  const tag = result.ok ? "✓" : "✗";
  console.log(
    `${tag} ${ticket}  ${result.name}  (${ms}ms)` +
      (result.detail ? `\n      ${result.detail}` : "") +
      (result.error ? `\n      error: ${result.error}` : ""),
  );
  results.push({ ticket, ms, ...result });
}

// ── Summary ─────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(
  `\n=== Summary: ${passed}/${results.length} green` +
    (failed > 0 ? `, ${failed} failed` : "") +
    " ===",
);

// Compact table for screenshotting.
for (const r of results) {
  const tag = r.ok ? "PASS" : "FAIL";
  console.log(`  [${tag}]  ${r.ticket.padEnd(10)} ${r.name}`);
}
console.log("");

process.exit(failed > 0 ? 1 : 0);
