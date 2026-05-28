#!/usr/bin/env node
/**
 * MCP scanner — 4-threat regression suite (TRUS-1038).
 *
 * Drives `scanMcpServer` over a curated fixture set (10+ cases per
 * threat type + controls) and asserts each fixture produces the
 * expected detection. Used as the broader regression gate on top of
 * `verify:scanner` (which is a smaller smoke check).
 *
 * Acceptance per the sprint plan: "Each threat type has 10+ probe
 * cases; results stable across runs."
 *
 * Stability is asserted by running the suite twice and comparing the
 * serialized per-fixture verdicts byte-for-byte.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { scanMcpServer } from "../dist/scanner/agt-mcp-scanner.js";

// ── Load fixtures ───────────────────────────────────────────────────────────

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(path.join(here, "scanner-fixtures.json"), "utf-8"),
);

const THREATS = ["tool_poisoning", "typosquatting", "hidden_instruction", "rug_pull"];

// ── One pass over every fixture, returning a deterministic verdict list ─────

function runPass() {
  const verdicts = [];

  for (const threat of THREATS) {
    for (const fx of fixtures[threat]) {
      const report = scanMcpServer({
        server_name: `regression/${threat}/${fx.name}`,
        tools: [fx.tool],
      });
      const finding = report.findings[0];
      const observedThreats = (finding?.threats ?? []).map((t) => ({
        type: t.type,
        severity: t.severity,
      }));

      let ok = false;
      let detail;

      if (fx.expect.safe === true) {
        ok = finding?.safe === true && observedThreats.length === 0;
        detail = ok
          ? "safe=true, no threats"
          : `expected safe but got safe=${finding?.safe}, threats=${JSON.stringify(observedThreats)}`;
      } else {
        const expected = fx.expect.type;
        const hit = observedThreats.find((t) => t.type === expected);
        if (!hit) {
          ok = false;
          detail = `expected ${expected}, got ${JSON.stringify(observedThreats)}`;
        } else if (fx.expect.severity && hit.severity !== fx.expect.severity) {
          ok = false;
          detail = `expected ${expected}@${fx.expect.severity}, got ${expected}@${hit.severity}`;
        } else {
          ok = true;
          detail = `${expected}@${hit.severity}`;
        }
      }

      verdicts.push({
        threat,
        name: fx.name,
        ok,
        detail,
        // For the stability comparison, drop the verbose threats payload
        // and just keep the deterministic shape.
        signature: JSON.stringify(observedThreats),
      });
    }
  }
  return verdicts;
}

// ── Pass 1 ──────────────────────────────────────────────────────────────────

console.log("=== MCP scanner regression — pass 1 ===\n");
const pass1 = runPass();

// ── Stability: run again, compare ───────────────────────────────────────────

const pass2 = runPass();
const stableMismatches = [];
for (let i = 0; i < pass1.length; i++) {
  if (pass1[i].signature !== pass2[i].signature) {
    stableMismatches.push({
      name: pass1[i].name,
      first: pass1[i].signature,
      second: pass2[i].signature,
    });
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

let failures = 0;
const perThreat = Object.fromEntries(THREATS.map((t) => [t, { pass: 0, fail: 0 }]));

for (const v of pass1) {
  const tag = v.ok ? "✓" : "✗";
  console.log(`  ${tag} [${v.threat}] ${v.name}  (${v.detail})`);
  if (v.ok) perThreat[v.threat].pass += 1;
  else { perThreat[v.threat].fail += 1; failures += 1; }
}

console.log("\n--- per-threat ---");
for (const t of THREATS) {
  const { pass, fail } = perThreat[t];
  const total = pass + fail;
  const enough = pass >= 10 ? "" : `  (⚠ only ${pass} positives, sprint plan requires ≥10)`;
  console.log(`  ${t.padEnd(20)} ${pass}/${total} pass${enough}`);
}

console.log("\n--- stability ---");
if (stableMismatches.length === 0) {
  console.log("  ✓ pass 1 == pass 2 (deterministic)");
} else {
  console.log(`  ✗ ${stableMismatches.length} fixtures returned different verdicts on a second run:`);
  for (const m of stableMismatches) {
    console.log(`      ${m.name}\n        first:  ${m.first}\n        second: ${m.second}`);
  }
  failures += stableMismatches.length;
}

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} failure(s)`);
  process.exit(1);
}
console.log("All regression cases passed.");
