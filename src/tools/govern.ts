import { z } from "zod";
import { Guardrail } from "../local/govern.js";
import { availablePolicies } from "../policy_packs/index.js";

export const governToolName = "trustmodel_govern";

export const governToolDescription =
  "Check text against a governance policy pack and decide allow/block, locally. " +
  "NO API key required. `policy` is a built-in pack id — eu-ai-act (default), " +
  "nist-ai-rmf, nyc-ll144, or owasp-llm. Returns allowed/blocked, the policy id, and " +
  "the list of rule violations (pattern and dimension rules). Use before letting AI " +
  "output reach a user or another tool.";

export const governToolSchema = {
  text: z.string().describe("The text/output to check against the policy."),
  policy: z
    .string()
    .optional()
    .describe(
      "Policy pack id: eu-ai-act (default), nist-ai-rmf, nyc-ll144, owasp-llm.",
    ),
  context: z
    .string()
    .optional()
    .describe("Optional context the output was produced in."),
};

export async function handleGovern(args: {
  text: string;
  policy?: string;
  context?: string;
}): Promise<unknown> {
  const policy = args.policy ?? "eu-ai-act";
  const gr = new Guardrail(policy);
  const verdict = gr.check(args.text, args.context);
  return {
    allowed: verdict.allowed,
    blocked: verdict.blocked,
    policy: verdict.policy,
    violations: verdict.violations,
    available_policies: availablePolicies(),
  };
}
