import { z } from "zod";
import { postEvaluateAgent } from "../client.js";

export const evaluateAgentToolName = "trustmodel_evaluate_agent";

export const evaluateAgentToolDescription =
  "Create an agentic trace evaluation run against a trace previously uploaded via trustmodel_upload_trace. " +
  "Returns an evaluation_run_id that can be polled with trustmodel_score_agent. " +
  "TrustModel evaluates the uploaded trace across tool use, reasoning, safety, and goal completion.";

export const evaluateAgentToolSchema = {
  file_path: z
    .string()
    .describe(
      "File path returned by trustmodel_upload_trace. Points to the uploaded trace in TrustModel cloud storage."
    ),
  goal: z.string().describe("The goal the agent was trying to achieve."),
  name: z.string().describe("Descriptive name for this evaluation run."),
  agent_framework: z
    .string()
    .describe(
      "Agent framework used to produce the trace (e.g. 'langchain', 'crewai', 'autogen', 'custom')."
    ),
  agent_model: z
    .string()
    .optional()
    .describe("Underlying model used by the agent (e.g. 'gpt-4o', 'claude-3-5-sonnet')."),
  expected_outcome: z
    .string()
    .optional()
    .describe("Optional description of what the agent was expected to produce."),
  actual_outcome: z
    .string()
    .optional()
    .describe("Optional description of what the agent actually produced."),
  goal_achieved: z
    .boolean()
    .optional()
    .describe("Optional caller-provided verdict on whether the agent achieved its goal."),
};

export async function handleEvaluateAgent(args: {
  file_path: string;
  goal: string;
  name: string;
  agent_framework: string;
  agent_model?: string;
  expected_outcome?: string;
  actual_outcome?: string;
  goal_achieved?: boolean;
}): Promise<unknown> {
  return postEvaluateAgent({
    file_path: args.file_path,
    goal: args.goal,
    name: args.name,
    agent_framework: args.agent_framework,
    agent_model: args.agent_model,
    expected_outcome: args.expected_outcome,
    actual_outcome: args.actual_outcome,
    goal_achieved: args.goal_achieved,
  });
}
