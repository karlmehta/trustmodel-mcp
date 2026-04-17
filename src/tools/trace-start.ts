import { z } from "zod";
import { createSession } from "../trace-store.js";

export const traceStartToolName = "trustmodel_trace_start";

export const traceStartToolDescription =
  "Open a new agent-trace capture session. Returns a trace_id that must be passed to every trustmodel_trace_step and the final trustmodel_trace_finalize. " +
  "Capture steps (thoughts, tool calls, tool results, responses) as your agent executes; finalize when done to upload + auto-create an evaluation run.";

export const traceStartToolSchema = {
  goal: z
    .string()
    .describe("What the agent is trying to achieve. Required; feeds the evaluation run."),
  name: z
    .string()
    .describe("Display name for the evaluation run (shown in TrustModel UI)."),
  agent_framework: z
    .string()
    .describe(
      "Framework the agent is built with (e.g. 'langchain', 'crewai', 'claude-code', 'custom')."
    ),
  agent_model: z
    .string()
    .optional()
    .describe("Underlying LLM the agent is using (e.g. 'gpt-4o', 'claude-sonnet-4-5')."),
  user_query: z
    .string()
    .optional()
    .describe("Original user prompt that triggered the run, if different from `goal`."),
  expected_outcome: z
    .string()
    .optional()
    .describe("Optional description of the expected outcome."),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Free-form passthrough metadata stored inside the trace file."),
};

export async function handleTraceStart(args: {
  goal: string;
  name: string;
  agent_framework: string;
  agent_model?: string;
  user_query?: string;
  expected_outcome?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ trace_id: string; started_at: string }> {
  const session = createSession({
    goal: args.goal,
    name: args.name,
    agent_framework: args.agent_framework,
    agent_model: args.agent_model,
    user_query: args.user_query,
    expected_outcome: args.expected_outcome,
    metadata: args.metadata,
  });

  return {
    trace_id: session.meta.trace_id,
    started_at: session.meta.started_at,
  };
}
