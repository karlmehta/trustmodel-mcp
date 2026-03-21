import { z } from "zod";
import { postGuardrailsEvaluate } from "../client.js";

export const guardrailsToolName = "trustmodel_guardrails_check";

export const guardrailsToolDescription =
  "Check data against a TrustModel guardrail rule set. Returns pass/fail status " +
  "and details for each rule in the set.";

export const guardrailsToolSchema = {
  guardrail_set_id: z
    .string()
    .describe("The guardrail set ID to evaluate against."),
  evaluation_data: z
    .record(z.unknown())
    .describe("The data object to check against the guardrail rules."),
};

export async function handleGuardrails(args: {
  guardrail_set_id: string;
  evaluation_data: Record<string, unknown>;
}): Promise<unknown> {
  return postGuardrailsEvaluate({
    guardrail_set_id: args.guardrail_set_id,
    evaluation_data: args.evaluation_data,
  });
}
