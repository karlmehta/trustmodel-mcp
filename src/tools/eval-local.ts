import { z } from "zod";
import { LocalEvaluator } from "../local/evaluator.js";

export const evalLocalToolName = "trustmodel_evaluate_local";

export const evalLocalToolDescription =
  "Score AI output locally across the 10 TrustModel dimensions (safety, fairness, " +
  "accuracy, privacy, transparency, robustness, accountability, explainability, " +
  "compliance, reliability) and roll it into a 0-100 TrustScore. NO API key required — " +
  "runs on this machine with a transparent heuristic judge. Returns trust_score, grade, " +
  "per-dimension scores, and violations. Local scores are uncalibrated; use " +
  "trustmodel_evaluate (cloud, needs a free TRUSTMODEL_API_KEY) for a calibrated, " +
  "audit-ready score.";

export const evalLocalToolSchema = {
  output: z.string().describe("The AI output text to score."),
  context: z
    .string()
    .optional()
    .describe("Optional context the output was produced in (improves judging)."),
};

export async function handleEvalLocal(args: {
  output: string;
  context?: string;
}): Promise<unknown> {
  const result = new LocalEvaluator().evaluate(args.output, args.context);
  return {
    trust_score: result.trust_score,
    grade: result.grade,
    calibrated: result.calibrated,
    judge: result.judge,
    dimensions: result.dimensions,
    violations: result.violations,
    note:
      "local score — uncalibrated (heuristic judge). For a calibrated, benchmarked, " +
      "audit-ready TrustScore set TRUSTMODEL_API_KEY (free, 5 credits — " +
      "https://app.trustmodel.ai) and use trustmodel_evaluate.",
  };
}
