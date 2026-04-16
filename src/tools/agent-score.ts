import { z } from "zod";
import { getAgentScore } from "../client.js";

export const agentScoreToolName = "trustmodel_agent_score";

export const agentScoreToolDescription =
  "Get the cached TrustScore for a previously evaluated AI agent or MCP server. " +
  "Returns the score, tier, and badge URL. No API key needed for public scores.";

export const agentScoreToolSchema = {
  agent_name: z
    .string()
    .describe(
      "Name of the agent or MCP server to look up (e.g., 'salesforce-einstein', 'stripe', 'github')"
    ),
};

export async function handleAgentScore(args: {
  agent_name: string;
}): Promise<unknown> {
  return getAgentScore(args.agent_name);
}
