/**
 * MCP tool that runs AGT's shadow-agent discovery over local filesystem
 * paths (TRUS-848).
 *
 * Intended use: a runner (e.g. the aurora-gateway worker after cloning
 * customer repos / syncing kubeconfig manifests / etc.) hands the
 * scanner a list of directories, gets back a ScanReport with discovered
 * + reconciled-shadow agents, and persists those into the TRUS-739
 * ShadowAgent inventory.
 *
 * Feature-flag gated — see `src/scanner/agt-shadow-discovery.ts`. When
 * disabled (default), the tool still answers but returns a synthetic
 * skip report. Enable via `TRUSTMODEL_AGT_DISCOVERY_ENABLED=true` on the
 * MCP server process.
 *
 * Naming: parallels `trustmodel_mcp_scan_server` from TRUS-847 — both
 * are AGT-backed static-analysis tools. The MCP scanner targets MCP tool
 * definitions; this one targets agent configs / containers / source
 * files on disk.
 */
import { z } from "zod";

import {
  scanPaths,
  type ShadowDiscoveryReport,
} from "../scanner/agt-shadow-discovery.js";

export const shadowDiscoveryScanPathsToolName =
  "trustmodel_shadow_discovery_scan_paths";

export const shadowDiscoveryScanPathsToolDescription =
  "Walk one or more local filesystem paths and detect agents using AGT's " +
  "ShadowDiscovery static analyzer. Surfaces agents found in config files " +
  "(agentmesh.yaml, crewai.yaml, mcp.json, claude_desktop_config.json, …), " +
  "Dockerfiles / docker-compose, and (optionally) source files (.py / .ts / " +
  ".js). Reconciles each detection against a caller-supplied registry of " +
  "known agents and returns the unregistered ones as 'shadow agents' with " +
  "AGT risk scoring + recommended remediation actions. Static analysis only " +
  "— no LLM, no network, deterministic. Feature-flagged: returns a synthetic " +
  "skip report unless TRUSTMODEL_AGT_DISCOVERY_ENABLED=true on the server.";

const registeredAgentSchema = z.object({
  did: z.string().optional().describe("Decentralised identifier."),
  name: z.string().optional().describe("Agent name."),
  fingerprint: z
    .string()
    .optional()
    .describe("Stable fingerprint of the agent — matches against detections."),
  configPath: z
    .string()
    .optional()
    .describe(
      "Path to the agent's config file — matches against detected configs.",
    ),
  owner: z.string().optional().describe("Owner (user, team, service)."),
});

export const shadowDiscoveryScanPathsToolSchema = {
  paths: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      "Local filesystem paths to walk. Each path must already exist on " +
      "the MCP server's host. The scanner skips symlinks and the usual " +
      "noise directories (.git, node_modules, __pycache__, .venv, dist, …).",
    ),
  registry: z
    .array(registeredAgentSchema)
    .optional()
    .describe(
      "Already-registered agents — detections that reconcile against an " +
      "entry here are returned as `registered`, the rest as `shadow`. " +
      "Pass the TRUS-739 ShadowAgent inventory's known agents here.",
    ),
  max_depth: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max directory recursion depth. Default 10."),
  include_source_patterns: z
    .boolean()
    .optional()
    .describe(
      "Whether to grep .py/.ts/.js for agent-library imports (default " +
      "true). Disable on large monorepos where the source-pattern pass " +
      "dominates runtime.",
    ),
  max_file_read_bytes: z
    .number()
    .int()
    .min(1024)
    .max(10 * 1024 * 1024)
    .optional()
    .describe("Max bytes read per file. Default 65536."),
};

export async function handleShadowDiscoveryScanPaths(args: {
  paths: string[];
  registry?: Array<{
    did?: string;
    name?: string;
    fingerprint?: string;
    configPath?: string;
    owner?: string;
  }>;
  max_depth?: number;
  include_source_patterns?: boolean;
  max_file_read_bytes?: number;
}): Promise<ShadowDiscoveryReport> {
  return scanPaths({
    paths: args.paths,
    registry: args.registry,
    maxDepth: args.max_depth,
    includeSourcePatterns: args.include_source_patterns,
    maxFileReadBytes: args.max_file_read_bytes,
  });
}
