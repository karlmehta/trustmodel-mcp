import { z } from "zod";
import { listRedTeamProbes } from "../client.js";

export const redteamProbesToolName = "trustmodel_redteam_list_probes";

export const redteamProbesToolDescription =
  "Browse the red-team probe library. Filter by category, severity, or " +
  "tag. Returns probe metadata only — attack payloads themselves are not " +
  "exposed via this tool to avoid handing them to agents that might leak " +
  "them outside an evaluation context.";

const PROBE_CATEGORIES = [
  "prompt_injection",
  "jailbreak",
  "pii_extraction",
  "bias_elicitation",
  "hallucination_trigger",
  "toxicity",
  "instruction_override",
  "data_exfiltration",
] as const;

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export const redteamProbesToolSchema = {
  category: z.enum(PROBE_CATEGORIES).optional().describe("Limit to one category."),
  severity: z.enum(SEVERITIES).optional().describe("Limit to one severity."),
  tag: z.string().optional().describe("Limit to a specific tag."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Max probes returned (default 50)."),
};

export async function handleRedteamProbes(args: {
  category?: string;
  severity?: string;
  tag?: string;
  limit?: number;
}): Promise<unknown> {
  return listRedTeamProbes({
    category: args.category,
    severity: args.severity,
    tag: args.tag,
    limit: args.limit ?? 50,
  });
}
