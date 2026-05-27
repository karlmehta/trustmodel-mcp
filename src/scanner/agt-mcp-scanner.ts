/**
 * AGT MCP Security Scanner wrapper (TRUS-847).
 *
 * Wraps Microsoft's @microsoft/agent-governance-sdk `McpSecurityScanner`
 * — a sync, CPU-only static analysis tool that flags MCP tool definitions
 * for:
 *   - tool poisoning   (descriptions that hijack the agent's instructions)
 *   - typosquatting    (server/tool names that ape well-known projects)
 *   - hidden instructions (steganographic text in descriptions / params)
 *   - rug pull         (descriptions that promise X but enable Y)
 *
 * The scanner is deterministic and runs in-process — no LLM, no network.
 * That's why the entry point here is also sync: we're just driving the
 * upstream scanner over a list of tool definitions and aggregating the
 * result into a typed `ScanReport`.
 *
 * Block / warn thresholds (per the TRUS-847 acceptance criteria):
 *   - `critical` severity in any threat  → status = "blocked"
 *   - `high`/`medium` severity present   → status = "warning"
 *   - no threats above `low`             → status = "ok"
 */
import {
  McpSecurityScanner,
  type McpScanResult,
  type McpThreat,
  type McpToolDefinition,
} from "@microsoft/agent-governance-sdk";

/** Status surfaced to callers — drives block/allow decisions downstream. */
export type ScanStatus = "ok" | "warning" | "blocked";

/** Per-tool scan summary that's safe to JSON-serialize and stuff in logs. */
export interface ToolScanFinding {
  tool_name: string;
  risk_score: number;
  safe: boolean;
  threats: McpThreat[];
}

/** Aggregated scan report returned to the caller. */
export interface ScanReport {
  server_name: string;
  server_url?: string;
  status: ScanStatus;
  /** Highest severity seen across all threats, or `null` if no threats. */
  worst_severity: McpThreat["severity"] | null;
  total_tools: number;
  blocked_tools: number;
  findings: ToolScanFinding[];
  /** ISO-8601 timestamp the scan ran. */
  scanned_at: string;
}

const SEVERITY_RANK: Record<McpThreat["severity"], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function rollupStatus(worst: McpThreat["severity"] | null): ScanStatus {
  if (worst === "critical") return "blocked";
  if (worst === "high" || worst === "medium") return "warning";
  return "ok";
}

function pickWorstSeverity(
  results: McpScanResult[],
): McpThreat["severity"] | null {
  let worstRank = -1;
  let worst: McpThreat["severity"] | null = null;
  for (const result of results) {
    for (const threat of result.threats) {
      let rank = SEVERITY_RANK[threat.severity];
      let severity = threat.severity;
      if (rank === undefined) {
        // AGT returned a severity outside low|medium|high|critical. Never
        // silently drop a finding from a security scanner — fail safe by
        // treating the unknown level as `critical` so it surfaces loudly.
        // (stderr, not stdout: stdout is the MCP JSON-RPC channel.)
        console.error(
          `[agt-mcp-scanner] unknown threat severity ${JSON.stringify(
            threat.severity,
          )} on tool ${JSON.stringify(
            result.tool_name,
          )} — treating as "critical"`,
        );
        rank = SEVERITY_RANK.critical;
        severity = "critical";
      }
      if (rank > worstRank) {
        worstRank = rank;
        worst = severity;
      }
    }
  }
  return worst;
}

/**
 * Drive AGT's `McpSecurityScanner` over the supplied tool list and roll
 * the per-tool results into a single `ScanReport`.
 *
 * The constructor is invoked per call so the scanner picks up any
 * per-process AGT config; the upstream class is light and has no
 * shared state worth holding.
 */
export function scanMcpServer(input: {
  server_name: string;
  server_url?: string;
  tools: McpToolDefinition[];
}): ScanReport {
  const scanner = new McpSecurityScanner();
  const results = scanner.scanAll(input.tools);
  const worst = pickWorstSeverity(results);

  return {
    server_name: input.server_name,
    server_url: input.server_url,
    status: rollupStatus(worst),
    worst_severity: worst,
    total_tools: results.length,
    // An unsafe result is one the upstream scanner refused to mark `safe`.
    // We treat any unsafe tool as "blocked" at the per-tool level even if
    // the overall status is only a warning — the caller can decide which
    // tools to filter out.
    blocked_tools: results.filter((r) => !r.safe).length,
    findings: results.map((r) => ({
      tool_name: r.tool_name,
      risk_score: r.risk_score,
      safe: r.safe,
      threats: r.threats,
    })),
    scanned_at: new Date().toISOString(),
  };
}

export { type McpToolDefinition, type McpThreat, type McpScanResult } from "@microsoft/agent-governance-sdk";
