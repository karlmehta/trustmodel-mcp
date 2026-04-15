import { z } from "zod";
import { postEvaluateMCPServer } from "../client.js";

export const evaluateMCPServerToolName = "trustmodel_evaluate_mcp_server";

export const evaluateMCPServerToolDescription =
  "Evaluate an MCP server's trust and safety posture. Analyzes tool inventory, " +
  "permission scope, input validation risks, and data sensitivity. Returns a TrustScore " +
  "and per-tool risk classification. Use this before connecting an agent to an MCP server.";

const toolDefinitionSchema = z.object({
  name: z.string().describe("Tool name"),
  description: z.string().optional().describe("Tool description"),
  inputSchema: z
    .record(z.unknown())
    .optional()
    .describe("Tool parameter schema (JSON Schema)"),
});

export const evaluateMCPServerToolSchema = {
  server_name: z
    .string()
    .describe("Name or slug of the MCP server (e.g., 'stripe-payments', 'github')"),
  server_url: z
    .string()
    .optional()
    .describe("GitHub repo URL or documentation URL of the MCP server"),
  tools: z
    .array(toolDefinitionSchema)
    .optional()
    .describe(
      "List of tools exposed by the MCP server (from tools/list). " +
      "If not provided, TrustModel will attempt to look up from its database of 91 pre-scored servers."
    ),
};

export async function handleEvaluateMCPServer(args: {
  server_name: string;
  server_url?: string;
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
}): Promise<unknown> {
  return postEvaluateMCPServer({
    server_name: args.server_name,
    server_url: args.server_url,
    tools: args.tools,
  });
}
