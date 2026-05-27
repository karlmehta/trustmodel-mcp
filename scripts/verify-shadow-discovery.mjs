#!/usr/bin/env node
/**
 * TRUS-848 acceptance verification.
 *
 * Drives the AGT ShadowDiscovery wrapper over two synthetic fixture
 * trees so reviewers can sanity-check the integration without a real
 * monorepo:
 *
 *   1. CLEAN fixture     — an empty temp dir.
 *      Expectation: scan ran (skippedReason=null), 0 shadow agents,
 *      status="info", worstRiskLevel=null.
 *
 *   2. KNOWN-BAD fixture — temp dir seeded with three detection sources:
 *        (a) `agentmesh.yaml`        → config_file detection, agt
 *        (b) `Dockerfile` w/ langchain → container detection, langchain (HIGH)
 *        (c) `src/agent.py` w/ crewai → source-pattern detection, crewai (HIGH)
 *      Expectation: scan ran, 3 distinct shadow agents, worstRiskLevel
 *      ≥ "medium" (langchain + crewai land in HIGH_RISK_TYPES upstream).
 *
 * The repo has no Jest/Vitest setup yet — same posture as TRUS-847's
 * `verify-scanner.mjs`. Rerun any time via `npm run verify:discovery`.
 *
 * Required env: TRUSTMODEL_AGT_DISCOVERY_ENABLED=true. Without it the
 * wrapper returns a synthetic skip report (which is correct behaviour
 * for the feature-flag gate) but the assertions below intentionally
 * fail in that case so the reviewer notices the flag is off.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { scanPaths } from "../dist/scanner/agt-shadow-discovery.js";

// Force the feature flag on for the duration of this script. The wrapper
// reads the env var fresh on each call, so setting it here is enough.
process.env.TRUSTMODEL_AGT_DISCOVERY_ENABLED = "true";

let failures = 0;
function check(label, ok, detail) {
  const tag = ok ? "✓" : "✗";
  console.log(`${tag} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ── Fixture builders ───────────────────────────────────────────────────────

function makeCleanDir() {
  return mkdtempSync(path.join(tmpdir(), "trus848-clean-"));
}

function makeKnownBadDir() {
  const root = mkdtempSync(path.join(tmpdir(), "trus848-bad-"));

  // (a) Config-file detection.
  writeFileSync(
    path.join(root, "agentmesh.yaml"),
    "agent:\n  name: payments-agent\n  type: agt\n",
  );

  // (b) Container detection — Dockerfile that pulls in langchain.
  writeFileSync(
    path.join(root, "Dockerfile"),
    "FROM python:3.11-slim\nRUN pip install langchain langgraph\n",
  );

  // (c) Source-pattern detection — a .py file with a crewai import.
  mkdirSync(path.join(root, "src"));
  writeFileSync(
    path.join(root, "src", "agent.py"),
    "from crewai import Agent\nagent = Agent(role='analyst')\n",
  );

  return root;
}

// ── Run ────────────────────────────────────────────────────────────────────

const cleanDir = makeCleanDir();
const badDir = makeKnownBadDir();

try {
  const cleanReport = scanPaths({ paths: [cleanDir] });
  console.log("\n--- CLEAN fixture ---");
  console.log(JSON.stringify(cleanReport, null, 2));
  check(
    "clean fixture: scan actually ran",
    cleanReport.skippedReason === null,
    `skippedReason="${cleanReport.skippedReason}"`,
  );
  check(
    "clean fixture: status=info",
    cleanReport.status === "info",
    `got "${cleanReport.status}"`,
  );
  check(
    "clean fixture: zero shadow agents",
    cleanReport.shadowCount === 0,
    `got ${cleanReport.shadowCount}`,
  );
  check(
    "clean fixture: worstRiskLevel=null",
    cleanReport.worstRiskLevel === null,
    `got ${cleanReport.worstRiskLevel}`,
  );

  const badReport = scanPaths({ paths: [badDir] });
  console.log("\n--- KNOWN-BAD fixture ---");
  console.log(JSON.stringify(badReport, null, 2));
  check(
    "known-bad fixture: scan actually ran",
    badReport.skippedReason === null,
    `skippedReason="${badReport.skippedReason}"`,
  );
  check(
    "known-bad fixture: at least 3 shadow agents detected",
    badReport.shadowCount >= 3,
    `got ${badReport.shadowCount}`,
  );
  // All three evidence sources we seeded should produce hits.
  const sources = new Set(
    badReport.scan.shadowAgents
      .flatMap((s) => s.agent.evidence)
      .map((e) => e.basis),
  );
  check(
    "known-bad fixture: config_file evidence present",
    sources.has("config_file"),
    `bases=${[...sources].join(",")}`,
  );
  check(
    "known-bad fixture: container_reference evidence present",
    sources.has("container_reference"),
    `bases=${[...sources].join(",")}`,
  );
  check(
    "known-bad fixture: source_pattern evidence present",
    sources.has("source_pattern"),
    `bases=${[...sources].join(",")}`,
  );
  check(
    "known-bad fixture: worstRiskLevel >= medium",
    badReport.worstRiskLevel === "medium"
      || badReport.worstRiskLevel === "high"
      || badReport.worstRiskLevel === "critical",
    `got "${badReport.worstRiskLevel}"`,
  );

  // Sanity-check the feature-flag gate while we're here.
  delete process.env.TRUSTMODEL_AGT_DISCOVERY_ENABLED;
  const flaggedReport = scanPaths({ paths: [badDir] });
  check(
    "feature flag off: scan is skipped",
    flaggedReport.skippedReason === "feature_flag_disabled",
    `skippedReason="${flaggedReport.skippedReason}"`,
  );
  check(
    "feature flag off: no shadow agents in report",
    flaggedReport.shadowCount === 0,
    `got ${flaggedReport.shadowCount}`,
  );
} finally {
  rmSync(cleanDir, { recursive: true, force: true });
  rmSync(badDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll assertions passed.");
