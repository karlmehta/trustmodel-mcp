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
    .union([z.number().int().positive(), z.string().min(1)])
    .describe(
      "Evaluation ID returned by trustmodel_redteam_evaluate. Integer (current) or string (legacy)."
    ),
};

export async function handleRedteamResults(args: {
  evaluation_id: number | string;
}): Promise<unknown> {
  return getRedTeamEvaluation(args.evaluation_id);
}
