import { z } from "zod";
import { getRedTeamEvaluation } from "../client.js";

export const redteamResultsToolName = "trustmodel_redteam_results";

export const redteamResultsToolDescription =
  "Get status, progress, overall score, per-category breakdown, and " +
  "severity buckets for a red-team evaluation previously created via " +
  "trustmodel_redteam_evaluate. Returns partial progress while running and " +
  "full summary when COMPLETED.";

export const redteamResultsToolSchema = {
  evaluation_id: z
    .string()
    .uuid()
    .describe("Evaluation UUID returned by trustmodel_redteam_evaluate."),
};

export async function handleRedteamResults(args: {
  evaluation_id: string;
}): Promise<unknown> {
  return getRedTeamEvaluation(args.evaluation_id);
}
