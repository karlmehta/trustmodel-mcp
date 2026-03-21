import { z } from "zod";
import { getEvaluation, getCotsConnection } from "../client.js";

export const scoreToolName = "trustmodel_score";

export const scoreToolDescription =
  "Get the current trust score for a previous evaluation or a COTS connection. " +
  "Provide either an evaluation_id (for prompt/response evaluations) or a " +
  "connection_id (for COTS integrations).";

export const scoreToolSchema = {
  evaluation_id: z
    .string()
    .optional()
    .describe("The evaluation ID returned from a previous trustmodel_evaluate call."),
  connection_id: z
    .string()
    .optional()
    .describe("The COTS connection ID to retrieve the trust score for."),
};

export async function handleScore(args: {
  evaluation_id?: string;
  connection_id?: string;
}): Promise<unknown> {
  if (!args.evaluation_id && !args.connection_id) {
    throw new Error(
      "You must provide either evaluation_id or connection_id."
    );
  }

  if (args.evaluation_id) {
    return getEvaluation(args.evaluation_id);
  }

  return getCotsConnection(args.connection_id!);
}
