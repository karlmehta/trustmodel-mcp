/**
 * AGT Shadow Discovery wrapper (TRUS-848).
 *
 * Wraps Microsoft's @microsoft/agent-governance-sdk `ShadowDiscovery`
 * — a sync, CPU-only static analysis tool that walks local filesystem
 * paths looking for unregistered agents (langchain / crewai / autogen /
 * agentmesh / mcp-server / semantic-kernel / openai-agents). Detection
 * sources:
 *   - config files     (agentmesh.yaml, crewai.yaml, mcp.json,
 *                       claude_desktop_config.json, copilot-setup-steps.yml, …)
 *   - container hints  (Dockerfile / docker-compose grep for known runtimes)
 *   - source patterns  (.py / .ts / .js grep for known imports)
 *
 * Per Ankit's TRUS-848 handoff:
 *   - AGT discovery ships only in the TS SDK (no Python equivalent in 3.6.0).
 *   - Wrap behind a feature flag — same posture as AGP's agt_evaluator.py
 *     (TRUS-942, commit 6d96166). Default off; production opt-in via
 *     `TRUSTMODEL_AGT_DISCOVERY_ENABLED=true`.
 *   - Cloud-source connectors (GitHub clone, K8s, AWS, Azure) are out of
 *     scope for v1 — they'll arrive as TRUS-848a/b/c/d follow-ups. v1 is
 *     local-path scanning of whatever the runner has mounted.
 *
 * Caller surface is intentionally narrow: a `scanPaths(paths)` function
 * that returns a `ShadowDiscoveryReport`. The upstream AGT types
 * (`DiscoveredAgent`, `ShadowAgentRecord`, `DiscoveryRiskAssessment`)
 * are re-exported untouched so downstream serialisers stay aligned with
 * Microsoft's schema as it evolves.
 */
import type {
  DiscoveredAgent,
  DiscoveryEvidence,
  DiscoveryRiskAssessment,
  DiscoveryRiskLevel,
  DiscoveryScanResult,
  RegisteredAgentRecord,
  ShadowAgentRecord,
  ShadowDiscoveryOptions,
} from "@microsoft/agent-governance-sdk";

import { ShadowDiscovery } from "@microsoft/agent-governance-sdk";

/** Why a scan returned early. `null` means the scan actually ran. */
export type ScanSkipReason = "feature_flag_disabled" | "agt_unavailable" | null;

/** Aggregated report returned to the caller — superset of AGT's
 * ``DiscoveryScanResult`` plus the AGT-version provenance and a
 * top-level ``status`` rollup so downstream filtering doesn't need to
 * walk ``shadowAgents[].risk.level``. */
export interface ShadowDiscoveryReport {
  /** Roll-up matching AGT's risk levels. ``info`` means no shadow agents. */
  status: DiscoveryRiskLevel;
  /** Highest single-agent risk level seen, or null if no shadows. */
  worstRiskLevel: DiscoveryRiskLevel | null;
  /** Total shadow (unregistered) agents detected. */
  shadowCount: number;
  /** Total agents detected (registered + shadow). */
  agentCount: number;
  /** Raw AGT scan result, surfaced for callers that want the full payload. */
  scan: DiscoveryScanResult;
  /** ISO-8601 timestamp the wrapper emitted this report. Distinct from
   * AGT's ``startedAt`` / ``completedAt`` so caller can tell pre-flag
   * skips apart from real scans. */
  emittedAt: string;
  /** AGT SDK version the upstream scan ran against. */
  agtVersion: string;
  /** Non-null when the scan was skipped without invoking AGT. */
  skippedReason: ScanSkipReason;
}

const RISK_RANK: Record<DiscoveryRiskLevel, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// Score floors used when we downgrade a level — AGT itself doesn't ship
// public scoring constants so we pick conservative midpoints. Only
// applied when the cap actually lowers the level.
const SCORE_FOR_LEVEL: Record<DiscoveryRiskLevel, number> = {
  info: 0,
  low: 25,
  medium: 50,
  high: 75,
  critical: 90,
};

/**
 * Cap a detection's risk level by its detection confidence (TRUS-1031).
 *
 * AGT scores every source-pattern hit at the same level/score regardless
 * of confidence, so a substring grep for `"langchain"` in an env-var
 * listing comes back at `critical/85` alongside a real `agentmesh.yaml`
 * config_file hit. That floods the inventory with false positives.
 *
 * Bands match how AGT emits confidence today:
 *   - source_pattern        → ~0.65   → cap at `medium`
 *   - manual / mixed bases  → 0.70–0.85 → cap at `high`
 *   - config_file / container_reference → ≥0.85 → unchanged
 *
 * When capped, a `capped_by_confidence:<score>` factor is appended so
 * triage reviewers can see *why* the level was lowered. The function is
 * pure — returns a new record, never mutates AGT's output.
 */
function capRiskByConfidence(record: ShadowAgentRecord): ShadowAgentRecord {
  const confidence = record.agent.confidence;
  let cap: DiscoveryRiskLevel;
  if (confidence < 0.7) {
    cap = "medium";
  } else if (confidence < 0.85) {
    cap = "high";
  } else {
    return record; // high-confidence hits keep AGT's level + score
  }

  const currentRank = RISK_RANK[record.risk.level] ?? RISK_RANK.info;
  const capRank = RISK_RANK[cap];
  if (currentRank <= capRank) {
    return record; // already at or below the cap
  }

  return {
    ...record,
    risk: {
      ...record.risk,
      level: cap,
      // Take the lower of AGT's score and the capped floor so we never
      // raise a score, only lower it.
      score: Math.min(record.risk.score, SCORE_FOR_LEVEL[cap]),
      factors: [
        ...record.risk.factors,
        `capped_by_confidence:${confidence.toFixed(2)}`,
      ],
    },
  };
}

function rollupRisk(
  shadows: ShadowAgentRecord[],
): { worst: DiscoveryRiskLevel | null; status: DiscoveryRiskLevel } {
  let worstRank = -1;
  let worst: DiscoveryRiskLevel | null = null;
  for (const record of shadows) {
    const rank = RISK_RANK[record.risk.level];
    if (rank > worstRank) {
      worstRank = rank;
      worst = record.risk.level;
    }
  }
  return { worst, status: worst ?? "info" };
}

/** Read the feature flag. Default off — Cisco Live safety. */
export function isEnabled(): boolean {
  const flag = process.env.TRUSTMODEL_AGT_DISCOVERY_ENABLED;
  return flag !== undefined && flag.trim().toLowerCase() === "true";
}

/** Synthetic skip report — used when the feature flag is off or AGT
 * isn't installed. Lets the caller see *why* the scan didn't run
 * without raising. */
function skipReport(
  reason: Exclude<ScanSkipReason, null>,
): ShadowDiscoveryReport {
  const now = new Date().toISOString();
  return {
    status: "info",
    worstRiskLevel: null,
    shadowCount: 0,
    agentCount: 0,
    scan: {
      agents: [],
      shadowAgents: [],
      errors: [],
      startedAt: now,
      completedAt: now,
      scannedTargets: 0,
      agentCount: 0,
    },
    emittedAt: now,
    // AGT version is irrelevant when the scan was skipped before invoking
    // the SDK; emit a known sentinel so downstream consumers can tell.
    agtVersion: "skipped",
    skippedReason: reason,
  };
}

/** Run AGT ShadowDiscovery against the supplied filesystem paths.
 *
 * Returns a `ShadowDiscoveryReport` containing the raw AGT result plus
 * roll-up fields for downstream filtering.
 *
 * Failure modes:
 *   - Feature flag off  → skipReport("feature_flag_disabled"), no AGT call.
 *   - AGT not installed → skipReport("agt_unavailable"), no throw.
 *   - AGT raises        → propagated to the caller (the MCP tool layer
 *                         turns it into an isError response).
 */
export function scanPaths(input: {
  paths: string[];
  registry?: RegisteredAgentRecord[];
  maxDepth?: number;
  includeSourcePatterns?: boolean;
  maxFileReadBytes?: number;
}): ShadowDiscoveryReport {
  if (!isEnabled()) {
    return skipReport("feature_flag_disabled");
  }

  // AGT can fail to import (mis-built node_modules, version skew). Wrap
  // the construction step specifically — `scan` failures should surface
  // to the caller because they indicate a real problem on the host.
  let discovery: ShadowDiscovery;
  try {
    discovery = new ShadowDiscovery(input.registry ?? []);
  } catch {
    return skipReport("agt_unavailable");
  }

  const options: ShadowDiscoveryOptions = {
    paths: input.paths,
    registry: input.registry,
    maxDepth: input.maxDepth,
    includeSourcePatterns: input.includeSourcePatterns,
    maxFileReadBytes: input.maxFileReadBytes,
  };
  const result = discovery.scan(options);

  // TRUS-1031: cap each shadow agent's risk by its detection confidence
  // *before* the rollup. Source-pattern hits at confidence 0.65 came
  // back from AGT as `critical/85`, flooding the inventory. We surface
  // AGT's full output untouched in `result.agents` (the directory still
  // sees every detection); the capped `shadowAgents` is what drives
  // status + risk roll-up + alerting downstream.
  const cappedShadows = result.shadowAgents.map(capRiskByConfidence);
  const scan: DiscoveryScanResult = { ...result, shadowAgents: cappedShadows };
  const { worst, status } = rollupRisk(cappedShadows);

  return {
    status,
    worstRiskLevel: worst,
    shadowCount: cappedShadows.length,
    agentCount: result.agents.length,
    scan,
    emittedAt: new Date().toISOString(),
    // Hard-coded to match the npm pin in package.json. Bumping the
    // dep is a deliberate decision — this lets reviewers diff the
    // two atomically.
    agtVersion: "3.7.0",
    skippedReason: null,
  };
}

export {
  type DiscoveredAgent,
  type DiscoveryEvidence,
  type DiscoveryRiskAssessment,
  type DiscoveryRiskLevel,
  type DiscoveryScanResult,
  type RegisteredAgentRecord,
  type ShadowAgentRecord,
};
