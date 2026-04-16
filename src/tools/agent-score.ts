import { z } from "zod";
import { getAgenticEvaluation } from "../client.js";

export const agentScoreToolName = "trustmodel_score_agent";

export const agentScoreToolDescription =
  "Get details (status, completion percentage, overall score, grade, per-category scores, summary) " +
  "for an agentic trace evaluation run previously created via trustmodel_evaluate_agent.";

export const agentScoreToolSchema = {
  evaluation_run_id: z
    .union([
      z.number().int().positive(),
      z.string().regex(/^\d+$/, "evaluation_run_id must be a positive integer."),
    ])
    .describe(
      "Integer evaluation_run_id returned by trustmodel_evaluate_agent."
    ),
};

export async function handleAgentScore(args: {
  evaluation_run_id: number | string;
}): Promise<unknown> {
  return getAgenticEvaluation(Number(args.evaluation_run_id));
}
