/**
 * MCP tool: fingerprint provider API keys for Shadow Discovery (TRUS-1012, 848d).
 *
 * Given a list of OpenAI / Anthropic API keys, probes each provider's
 * read-only models endpoint to determine reachability + enumerable
 * models, and returns the result as an AGT `ShadowDiscoveryReport` (every
 * key surfaced as a `shadow` agent). No inference is run; key material is
 * never echoed — only a `provider:****last4` fingerprint.
 *
 * Feature-flag gated behind `TRUSTMODEL_AGT_DISCOVERY_ENABLED`, same as
 * `trustmodel_shadow_discovery_scan_paths`.
 */
import { z } from "zod";

import {
  fingerprintKeys,
} from "../scanner/agt-shadow-discovery-fingerprint.js";
import type { ShadowDiscoveryReport } from "../scanner/agt-shadow-discovery.js";

export const shadowDiscoveryFingerprintKeysToolName =
  "trustmodel_shadow_discovery_fingerprint_keys";

export const shadowDiscoveryFingerprintKeysToolDescription =
  "Fingerprint a batch of provider API keys (OpenAI / Anthropic) for " +
  "Shadow Discovery. For each key, calls the provider's read-only models " +
  "endpoint to determine whether the key is live and what models it can " +
  "reach — no inference is run. Returns each key as a 'shadow agent' with " +
  "AGT risk scoring: a reachable (working) key is high risk (possible " +
  "credential exposure); an unreachable/revoked key is informational. Key " +
  "material is never logged or returned — only a provider:****last4 " +
  "fingerprint. Feature-flagged: returns a synthetic skip report unless " +
  "TRUSTMODEL_AGT_DISCOVERY_ENABLED=true on the server.";

export const shadowDiscoveryFingerprintKeysToolSchema = {
  keys: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .describe(
      "Provider API keys to fingerprint (OpenAI 'sk-…' / 'sk-proj-…', " +
      "Anthropic 'sk-ant-…'). Each is probed against its provider's " +
      "models endpoint. Keys are never logged or echoed — only a " +
      "provider:****last4 fingerprint is reported.",
    ),
};

export async function handleShadowDiscoveryFingerprintKeys(args: {
  keys: string[];
}): Promise<ShadowDiscoveryReport> {
  return fingerprintKeys({ keys: args.keys });
}
