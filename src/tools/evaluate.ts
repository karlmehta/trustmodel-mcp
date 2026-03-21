import { z } from "zod";
import { postEvaluate } from "../client.js";

export const evaluateToolName = "trustmodel_evaluate";

export const evaluateToolDescription =
  "Evaluate AI output for trust and safety. Sends a prompt/response pair to TrustModel " +
  "and returns trust dimension scores, flags, and recommendations.";

export const evaluateToolSchema = {
  dimension: z
    .string()
    .optional()
    .describe(
      "Specific trust dimension to evaluate (e.g. 'fairness', 'toxicity', 'hallucination'). " +
        "Omit to run all dimensions."
    ),
  prompt: z.string().describe("The prompt that was sent to the AI model."),
  response: z.string().describe("The AI model's response to evaluate."),
  context: z
    .record(z.unknown())
    .optional()
    .describe("Optional context object with metadata about the evaluation."),
  guardrail_set_id: z
    .string()
    .optional()
    .describe("Optional guardrail set ID to apply during evaluation."),
};

export async function handleEvaluate(args: {
  dimension?: string;
  prompt: string;
  response: string;
  context?: Record<string, unknown>;
  guardrail_set_id?: string;
}): Promise<unknown> {
  return postEvaluate({
    dimension: args.dimension,
    prompt: args.prompt,
    response: args.response,
    context: args.context,
    guardrail_set_id: args.guardrail_set_id,
  });
}
