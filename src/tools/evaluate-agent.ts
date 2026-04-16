import { z } from "zod";
import { postEvaluateAgent } from "../client.js";

export const evaluateAgentToolName = "trustmodel_evaluate_agent";

export const evaluateAgentToolDescription =
  "Evaluate an AI agent's trust and safety by submitting execution traces. " +
  "Analyzes tool use patterns, reasoning chain quality, goal completion, and action safety. " +
  "Returns a TrustScore (0-10) across 10 dimensions plus agent-specific metrics.";

const agentStepSchema = z.object({
  step_number: z.number().describe("Step sequence number (1, 2, 3...)"),
  step_type: z
    .enum(["think", "tool_call", "tool_result", "response"])
    .describe("Type of step: think (reasoning), tool_call (calling a tool), tool_result (tool output), response (final answer to user)"),
  content: z.string().optional().describe("The reasoning text or response content"),
  tool_name: z.string().optional().describe("Name of the tool called (for tool_call steps)"),
  tool_args: z
    .record(z.unknown())
    .optional()
    .describe("Arguments passed to the tool (for tool_call steps)"),
  tool_result: z
    .string()
    .optional()
    .describe("Result returned by the tool (for tool_result steps)"),
  timestamp: z.string().optional().describe("ISO timestamp of the step"),
  duration_ms: z.number().optional().describe("Duration of the step in milliseconds"),
});

export const evaluateAgentToolSchema = {
  trace: z.object({
    trace_id: z.string().optional().describe("Unique ID for this trace"),
    agent_name: z.string().describe("Name of the agent being evaluated"),
    user_query: z
      .string()
      .optional()
      .describe("The original user query that triggered this agent execution"),
    steps: z
      .array(agentStepSchema)
      .describe("Ordered list of agent execution steps (think, tool_call, tool_result, response)"),
    final_response: z
      .string()
      .optional()
      .describe("The final response sent to the user"),
    tools_used: z
      .array(z.string())
      .optional()
      .describe("List of tool names used in this trace"),
    success: z
      .boolean()
      .optional()
      .describe("Whether the agent successfully completed the user's request"),
    total_duration_ms: z
      .number()
      .optional()
      .describe("Total execution time in milliseconds"),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Additional metadata (model name, framework, version, etc.)"),
  }),
};

export async function handleEvaluateAgent(args: {
  trace: {
    trace_id?: string;
    agent_name: string;
    user_query?: string;
    steps: Array<{
      step_number: number;
      step_type: "think" | "tool_call" | "tool_result" | "response";
      content?: string;
      tool_name?: string;
      tool_args?: Record<string, unknown>;
      tool_result?: string;
      timestamp?: string;
      duration_ms?: number;
    }>;
    final_response?: string;
    tools_used?: string[];
    success?: boolean;
    total_duration_ms?: number;
    metadata?: Record<string, unknown>;
  };
}): Promise<unknown> {
  return postEvaluateAgent({ trace: args.trace });
}
