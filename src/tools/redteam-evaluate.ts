import { z } from "zod";
import { postRedTeamEvaluation } from "../client.js";

export const redteamEvaluateToolName = "trustmodel_redteam_evaluate";

export const redteamEvaluateToolDescription =
  "Run a red-team evaluation against a registered AI model. Returns the " +
  "evaluation ID for status polling. Use trustmodel_redteam_results to track " +
  "progress and get the final report. Probes cover 8 attack categories: " +
  "prompt_injection, jailbreak, pii_extraction, bias_elicitation, " +
  "hallucination_trigger, toxicity, instruction_override, data_exfiltration.";

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

export const redteamEvaluateToolSchema = {
  target_model_id: z
    .string()
    .min(1)
    .describe("Identifier of target model. UUID of a registered model, or any free-form id when the gateway is in env-driven dev mode."),
  target_model_name: z
    .string()
    .optional()
    .describe("Optional display label."),
  categories: z
    .array(z.enum(PROBE_CATEGORIES))
    .optional()
    .describe("Limit to specific attack categories. Omit to run all 8."),
  severities: z
    .array(z.enum(SEVERITIES))
    .optional()
    .describe("Limit to specific severity levels. Omit to run all four."),
  max_probes: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum number of probes to run (default 100)."),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Free-form metadata attached to the run."),
};

export async function handleRedteamEvaluate(args: {
  target_model_id: string;
  target_model_name?: string;
  categories?: readonly string[];
  severities?: readonly string[];
  max_probes?: number;
  metadata?: Record<string, unknown>;
}): Promise<unknown> {
  const probe_filter: Record<string, unknown> = {};
  if (args.categories?.length) probe_filter.categories = args.categories;
  if (args.severities?.length) probe_filter.severities = args.severities;
  if (args.max_probes) probe_filter.limit = args.max_probes;

  return postRedTeamEvaluation({
    target_model_id: args.target_model_id,
    target_model_name: args.target_model_name,
    probe_filter,
    metadata: args.metadata,
  });
}
