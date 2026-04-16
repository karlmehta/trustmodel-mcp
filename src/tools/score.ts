import { z } from "zod";
import { getEvaluation } from "../client.js";

export const scoreToolName = "trustmodel_score";

export const scoreToolDescription =
  "Get the current trust score / detail for a previous LLM evaluation created via trustmodel_evaluate. " +
  "Takes an integer evaluation_id and returns the evaluation detail including scores.";

export const scoreToolSchema = {
  evaluation_id: z
    .union([
      z.number().int().positive(),
      z.string().regex(/^\d+$/, "evaluation_id must be a positive integer."),
    ])
    .describe(
      "Integer evaluation ID returned from a previous trustmodel_evaluate call."
    ),
};

export async function handleScore(args: {
  evaluation_id: number | string;
}): Promise<unknown> {
  const id = String(args.evaluation_id);
  return getEvaluation(id);
}
