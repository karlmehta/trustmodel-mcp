/**
 * TRUS-848 smoke step — AGT Shadow Discovery (local scan).
 *
 * Seeds a temp directory with an `agentmesh.yaml` config and a
 * `Dockerfile` mentioning langchain, runs the scanner, and asserts it
 * surfaces at least one shadow agent. Pure local call.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { scanPaths } from "../../dist/scanner/agt-shadow-discovery.js";

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "smoke-848-"));
  writeFileSync(
    path.join(root, "agentmesh.yaml"),
    "agent:\n  name: smoke-payments-agent\n  type: agt\n",
  );
  writeFileSync(
    path.join(root, "Dockerfile"),
    "FROM python:3.11-slim\nRUN pip install langchain\n",
  );
  mkdirSync(path.join(root, "src"));
  writeFileSync(
    path.join(root, "src", "agent.py"),
    "from crewai import Agent\nagent = Agent(role='analyst')\n",
  );
  return root;
}

export async function runShadowDiscoveryStep(/* _ctx */) {
  const fixture = makeFixture();
  try {
    const report = scanPaths({ paths: [fixture] });
    if (report.skippedReason !== null) {
      return {
        name: "Shadow Discovery (scan_paths)",
        ok: false,
        detail: `scan was skipped: ${report.skippedReason} — feature flag off?`,
      };
    }
    if (report.shadowCount === 0) {
      return {
        name: "Shadow Discovery (scan_paths)",
        ok: false,
        detail: "fixture seeded 3 agents but scanner returned 0 shadows",
      };
    }
    return {
      name: "Shadow Discovery (scan_paths)",
      ok: true,
      detail:
        `${report.shadowCount} shadow agents detected, ` +
        `worstRiskLevel=${report.worstRiskLevel}`,
    };
  } catch (err) {
    return {
      name: "Shadow Discovery (scan_paths)",
      ok: false,
      detail: "scanner threw",
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}
