import { z } from "zod";
import { appendStep } from "../trace-store.js";

export const traceStepToolName = "trustmodel_trace_step";

export const traceStepToolDescription =
  "Record a single step in an active trace session. Call once per reasoning step, tool call, tool result, or user-facing response. " +
  "Step numbers are auto-assigned (1-based). Requires a trace_id from trustmodel_trace_start.";

const stepTypeEnum = z.enum([
  "thought",
  "think",
  "tool_call",
  "tool_result",
  "observation",
  "decision",
  "error",
  "human_input",
  "response",
  "final_answer",
]);

export const traceStepToolSchema = {
  trace_id: z.string().describe("Trace handle returned by trustmodel_trace_start."),
  step_type: stepTypeEnum.describe(
    "Kind of step: 'thought'/'think' (reasoning), 'tool_call', 'tool_result', 'observation', 'decision', 'error', 'human_input', 'response'/'final_answer' (user-facing output)."
  ),
  content: z
    .string()
    .describe("Human-readable text for this step. Empty string allowed."),
  tool_name: z
    .string()
    .optional()
    .describe("Name of the tool invoked (use with step_type='tool_call' or 'tool_result')."),
  tool_args: z
    .record(z.unknown())
    .optional()
    .describe("Arguments passed to the tool (use with step_type='tool_call')."),
  tool_result: z
    .union([z.string(), z.record(z.unknown())])
    .optional()
    .describe("Result returned by the tool (use with step_type='tool_result')."),
  tool_call_success: z
    .boolean()
    .optional()
    .describe("Whether the tool call succeeded (use with step_type='tool_result')."),
  model_used: z.string().optional().describe("Model used for this step's reasoning."),
  input_tokens: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Input token count for this step."),
  output_tokens: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Output token count for this step."),
  duration_ms: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("How long this step took, in milliseconds."),
  timestamp: z
    .string()
    .optional()
    .describe("ISO 8601 timestamp. Defaults to the current time if omitted."),
};

export async function handleTraceStep(args: {
  trace_id: string;
  step_type: z.infer<typeof stepTypeEnum>;
  content: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: string | Record<string, unknown>;
  tool_call_success?: boolean;
  model_used?: string;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  timestamp?: string;
}): Promise<{ trace_id: string; step_number: number; steps_recorded: number }> {
  const step = appendStep(args.trace_id, {
    step_type: args.step_type,
    content: args.content,
    tool_name: args.tool_name,
    tool_args: args.tool_args,
    tool_result: args.tool_result,
    tool_call_success: args.tool_call_success,
    model_used: args.model_used,
    input_tokens: args.input_tokens,
    output_tokens: args.output_tokens,
    duration_ms: args.duration_ms,
    timestamp: args.timestamp,
  });

  return {
    trace_id: args.trace_id,
    step_number: step.step_number,
    steps_recorded: step.step_number,
  };
}
