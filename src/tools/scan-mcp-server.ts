/**
 * MCP tool that runs AGT's MCP security scanner over a third-party server's
 * tool list (TRUS-847).
 *
 * Intended use: an agent calls this tool *before* registering / enabling a
 * third-party MCP server. The scanner is local, sync, CPU-only — no network
 * round-trip, no LLM — so it's cheap to run on every registration attempt.
 *
 * Block/warn semantics:
 *   - any `critical` finding   → `status = "blocked"`
 *   - any `medium`/`high`      → `status = "warning"`
 *   - otherwise                → `status = "ok"`
 *
 * Naming complements the existing inactive ``trustmodel_evaluate_mcp_server``
 * (TRUS-586) which does a fuller trust evaluation; this tool is the
 * narrower, AGT-backed *security* scan and is what runs on the
 * pre-registration hook.
 */
import { z } from "zod";

import { scanMcpServer, type ScanReport } from "../scanner/agt-mcp-scanner.js";

export const scanMcpServerToolName = "trustmodel_mcp_scan_server";

export const scanMcpServerToolDescription =
  "Run AGT's MCP security scanner over a third-party MCP server's tool list. " +
  "Detects tool poisoning, typosquatting, hidden instructions, and rug-pull " +
  "patterns. Returns a ScanReport with overall status (ok / warning / blocked), " +
  "the worst severity seen, and per-tool findings. Static analysis — no LLM, " +
  "no network, deterministic. Intended as a pre-registration check before an " +
  "agent enables a third-party MCP server.";

// Mirror the shape the upstream AGT scanner accepts. `parameters` is the
// MCP tool's JSON-Schema-shaped parameter object; we forward it untouched
// so AGT can run its hidden-instruction heuristics over parameter
// descriptions too.
const toolDefinitionSchema = z.object({
  name: z.string().min(1).describe("Tool name as exposed by the MCP server."),
  description: z
    .string()
    .describe(
      "Tool description as exposed by the MCP server. The scanner runs " +
      "tool-poisoning and hidden-instruction heuristics over this text.",
    ),
  parameters: z
    .record(z.unknown())
    .optional()
    .describe("Optional JSON-Schema parameter object."),
});

export const scanMcpServerToolSchema = {
  server_name: z
    .string()
    .min(1)
    .describe(
      "Display name of the MCP server being scanned (e.g. 'stripe-payments', " +
      "'github'). Surfaced in the ScanReport and the cosmic-vector MCP " +
      "Scanner tab.",
    ),
  server_url: z
    .string()
    .url()
    .optional()
    .describe(
      "Optional URL/repo of the MCP server. Stored verbatim on the " +
      "ScanReport for audit but not dereferenced by the scanner.",
    ),
  tools: z
    .array(toolDefinitionSchema)
    .min(1)
    .describe(
      "List of tools exposed by the MCP server (as returned by " +
      "`tools/list`). The agent should call `tools/list` against the " +
      "candidate server first and pass the result here. Empty lists are " +
      "rejected — there's nothing to scan and the caller almost certainly " +
      "made a mistake.",
    ),
};

export async function handleScanMcpServer(args: {
  server_name: string;
  server_url?: string;
  tools: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  }>;
}): Promise<ScanReport> {
  return scanMcpServer({
    server_name: args.server_name,
    server_url: args.server_url,
    tools: args.tools,
  });
}
