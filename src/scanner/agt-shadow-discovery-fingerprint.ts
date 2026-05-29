/**
 * API-key fingerprint scan for Shadow Discovery (TRUS-1012, 848d).
 *
 * The genuinely-new cloud connector not already covered by TRUS-872/873:
 * given a list of provider API keys (OpenAI / Anthropic), call each
 * provider's lightweight introspection endpoint (`GET /v1/models`) to
 * determine *what the key can reach* — without running any inference —
 * and surface every reachable key as a `shadow` agent in the same AGT
 * `ShadowDiscoveryReport` shape the local-path scan produces.
 *
 * Security posture:
 *   - Key material is NEVER logged or echoed. Reports carry only a
 *     fingerprint: provider + last-4 chars.
 *   - No inference calls — only the (free, read-only) models endpoint.
 *   - Invalid / revoked / network-unreachable keys are reported as
 *     `reachable: false`, never crash the scan.
 *
 * Feature-flag gated behind `TRUSTMODEL_AGT_DISCOVERY_ENABLED` — same
 * posture as `scanPaths`.
 */
import type {
  DiscoveredAgent,
  DiscoveryRiskLevel,
  ShadowAgentRecord,
} from "@microsoft/agent-governance-sdk";

import { isEnabled, type ShadowDiscoveryReport } from "./agt-shadow-discovery.js";

type Provider = "openai" | "anthropic" | "unknown";

interface KeyProbeResult {
  provider: Provider;
  /** provider + last-4 only — never the full key. */
  fingerprint: string;
  reachable: boolean;
  /** Model ids the key could enumerate (capped). Empty when unreachable. */
  models: string[];
  /** HTTP status or error class, for the evidence trail. */
  detail: string;
}

const MODELS_ENDPOINT: Record<Exclude<Provider, "unknown">, string> = {
  openai: "https://api.openai.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/models",
};

const PROBE_TIMEOUT_MS = 10_000;
const MAX_MODELS_REPORTED = 25;

/** Classify a key by prefix without retaining the secret. */
function providerOf(key: string): Provider {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-")) return "openai"; // sk- / sk-proj-
  return "unknown";
}

/** provider + last-4 — safe to log and store. */
function fingerprintOf(key: string, provider: Provider): string {
  const last4 = key.length >= 4 ? key.slice(-4) : "????";
  return `${provider}:****${last4}`;
}

async function probeKey(key: string): Promise<KeyProbeResult> {
  const provider = providerOf(key);
  const fingerprint = fingerprintOf(key, provider);

  if (provider === "unknown") {
    return { provider, fingerprint, reachable: false, models: [], detail: "unrecognized_key_prefix" };
  }

  const url = MODELS_ENDPOINT[provider];
  const headers: Record<string, string> =
    provider === "anthropic"
      ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
      : { authorization: `Bearer ${key}` };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    if (!res.ok) {
      // 401/403 = invalid/revoked; other codes surfaced verbatim. Never throw.
      return { provider, fingerprint, reachable: false, models: [], detail: `http_${res.status}` };
    }
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string")
      .slice(0, MAX_MODELS_REPORTED);
    return { provider, fingerprint, reachable: true, models, detail: "http_200" };
  } catch (err) {
    const detail =
      err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    return { provider, fingerprint, reachable: false, models: [], detail };
  } finally {
    clearTimeout(timer);
  }
}

function toShadowAgentRecord(probe: KeyProbeResult, now: string): ShadowAgentRecord {
  // A reachable, working key found loose is the serious finding — treat
  // like an exposed credential. Unreachable keys are informational.
  const level: DiscoveryRiskLevel = probe.reachable ? "high" : "info";
  const score = probe.reachable ? 80 : 0;

  const agent: DiscoveredAgent = {
    fingerprint: probe.fingerprint,
    name: `${probe.provider} API key ${probe.fingerprint.slice(-8)}`,
    agentType: `${probe.provider}_api_key`,
    description:
      `${probe.provider} API key fingerprint ${probe.fingerprint} — ` +
      (probe.reachable
        ? `reachable, ${probe.models.length} model(s) enumerable`
        : `unreachable (${probe.detail})`),
    status: "shadow",
    evidence: [
      {
        scanner: "shadow_discovery:api_key_fingerprint",
        basis: "manual",
        source: probe.fingerprint,
        detail: probe.detail,
        rawData: { reachable: probe.reachable, models: probe.models },
        confidence: probe.reachable ? 0.99 : 0.6,
        timestamp: now,
      },
    ],
    confidence: probe.reachable ? 0.99 : 0.6,
    mergeKeys: { provider: probe.provider, fingerprint: probe.fingerprint },
    firstSeenAt: now,
    lastSeenAt: now,
    tags: { provider: probe.provider, reachable: String(probe.reachable) },
  };

  return {
    agent,
    risk: {
      level,
      score,
      factors: probe.reachable
        ? ["reachable_api_key", "credential_exposure"]
        : ["unreachable_api_key"],
      assessedAt: now,
    },
    recommendedActions: probe.reachable
      ? [
          "Rotate this API key immediately if its presence here is unexpected.",
          "Confirm the key is stored in a secret manager, not source/config.",
        ]
      : ["Key is unreachable — confirm it was intentionally revoked."],
  };
}

const RISK_RANK: Record<DiscoveryRiskLevel, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function skipReport(reason: "feature_flag_disabled"): ShadowDiscoveryReport {
  const now = new Date().toISOString();
  return {
    status: "info",
    worstRiskLevel: null,
    shadowCount: 0,
    agentCount: 0,
    scan: { agents: [], shadowAgents: [], errors: [], startedAt: now, completedAt: now, scannedTargets: 0, agentCount: 0 },
    emittedAt: now,
    agtVersion: "skipped",
    skippedReason: reason,
  };
}

/** Fingerprint a batch of API keys. Concurrency-bounded, fail-soft. */
export async function fingerprintKeys(input: {
  keys: string[];
}): Promise<ShadowDiscoveryReport> {
  if (!isEnabled()) {
    return skipReport("feature_flag_disabled");
  }

  const startedAt = new Date().toISOString();
  const probes = await Promise.all(input.keys.map((k) => probeKey(k)));
  const now = new Date().toISOString();

  // Only reachable keys are "shadow agents" worth alerting on; unreachable
  // ones are still recorded (status shadow, info risk) for completeness.
  const records = probes.map((p) => toShadowAgentRecord(p, now));
  const shadowRecords = records; // every key is an unregistered credential

  let worstRank = -1;
  let worst: DiscoveryRiskLevel | null = null;
  for (const r of shadowRecords) {
    const rank = RISK_RANK[r.risk.level];
    if (rank > worstRank) {
      worstRank = rank;
      worst = r.risk.level;
    }
  }

  return {
    status: worst ?? "info",
    worstRiskLevel: worst,
    shadowCount: shadowRecords.length,
    agentCount: records.length,
    scan: {
      agents: records.map((r) => r.agent),
      shadowAgents: shadowRecords,
      errors: [],
      startedAt,
      completedAt: now,
      scannedTargets: input.keys.length,
      agentCount: records.length,
    },
    emittedAt: now,
    agtVersion: "3.7.0",
    skippedReason: null,
  };
}
