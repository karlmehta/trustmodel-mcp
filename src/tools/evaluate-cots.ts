import { z } from "zod";
import { postEvaluateCots } from "../client.js";

export const evaluateCotsToolName = "trustmodel_evaluate_cots";

export const evaluateCotsToolDescription =
  "Evaluate a COTS (Commercial Off-The-Shelf) HR AI decision for bias. " +
  "Sends hiring/screening data from systems like Workday, Eightfold, or HireVue " +
  "to TrustModel for fairness and compliance analysis.";

export const evaluateCotsToolSchema = {
  connection_id: z
    .string()
    .describe("The COTS connection ID (e.g. your Workday or Eightfold integration ID)."),
  data: z
    .record(z.unknown())
    .describe(
      "The decision data to evaluate — typically includes candidate info, scores, " +
        "and the AI system's recommendation."
    ),
  categories: z
    .array(z.string())
    .optional()
    .describe(
      "Optional list of evaluation categories (e.g. ['adverse_impact', 'proxy_discrimination'])."
    ),
  guardrail_set_id: z
    .string()
    .optional()
    .describe("Optional guardrail set ID to apply during evaluation."),
};

export async function handleEvaluateCots(args: {
  connection_id: string;
  data: Record<string, unknown>;
  categories?: string[];
  guardrail_set_id?: string;
}): Promise<unknown> {
  return postEvaluateCots({
    connection_id: args.connection_id,
    data: args.data,
    categories: args.categories,
    guardrail_set_id: args.guardrail_set_id,
  });
}
