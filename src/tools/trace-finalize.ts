import { z } from "zod";
import {
  postAgenticUploadUrl,
  putToSignedUrl,
  postEvaluateAgent,
  TrustModelError,
} from "../client.js";
import { getSession, removeSession, TraceStep } from "../trace-store.js";

export const traceFinalizeToolName = "trustmodel_trace_finalize";

export const traceFinalizeToolDescription =
  "Close an active trace session, serialize the captured steps, upload to TrustModel cloud storage, and auto-create an agentic evaluation run. " +
  "Returns both a file_path (for record-keeping / retry) and an evaluation_run_id that can be polled with trustmodel_score_agent.";

export const traceFinalizeToolSchema = {
  trace_id: z.string().describe("Trace handle returned by trustmodel_trace_start."),
  final_response: z
    .string()
    .optional()
    .describe("The final user-facing answer from the agent."),
  actual_outcome: z
    .string()
    .optional()
    .describe("Optional description of what actually happened."),
  goal_achieved: z
    .boolean()
    .optional()
    .describe("Whether the agent achieved its goal."),
  success: z.boolean().optional().describe("Whether the run is considered successful overall."),
  total_duration_ms: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Total execution time in ms. If omitted, computed from step durations."),
  // Optional overrides of start-time metadata.
  goal: z.string().optional().describe("Override `goal` if the agent learned more at runtime."),
  name: z.string().optional().describe("Override `name` provided at trace_start."),
  agent_framework: z
    .string()
    .optional()
    .describe("Override `agent_framework` provided at trace_start."),
  agent_model: z
    .string()
    .optional()
    .describe("Override `agent_model` provided at trace_start."),
  expected_outcome: z
    .string()
    .optional()
    .describe("Override `expected_outcome` provided at trace_start."),
};

interface EvaluationOk {
  evaluation_run_id: number;
  status: string;
  message?: string;
}

interface FinalizeSuccessResult {
  trace_id: string;
  file_path: string;
  expires_in: number;
  step_count: number;
  evaluation_run_id: number;
  evaluation_status: string;
  evaluation_message?: string;
}

interface FinalizeEvalFailureResult {
  trace_id: string;
  file_path: string;
  expires_in: number;
  step_count: number;
  evaluation_error: { status: number; detail: unknown };
}

type FinalizeResult = FinalizeSuccessResult | FinalizeEvalFailureResult;

function computeTotalDurationMs(steps: TraceStep[]): number | undefined {
  let total = 0;
  let sawAny = false;
  for (const s of steps) {
    if (typeof s.duration_ms === "number") {
      total += s.duration_ms;
      sawAny = true;
    }
  }
  return sawAny ? total : undefined;
}

function uniqueToolsUsed(steps: TraceStep[]): string[] {
  const seen = new Set<string>();
  for (const s of steps) {
    if (s.step_type === "tool_call" && s.tool_name) seen.add(s.tool_name);
  }
  return Array.from(seen);
}

/**
 * Build the trace JSON body that will be uploaded. The shape matches the
 * aurora-metrics-v2 AgentTrace Pydantic model in
 * src/llm_eval_framework/evaluators/agentic_trace/data_models.py.
 */
function buildAgentTrace(
  meta: {
    trace_id: string;
    goal: string;
    name: string;
    agent_framework: string;
    agent_model?: string;
    user_query?: string;
    expected_outcome?: string;
    metadata?: Record<string, unknown>;
  },
  steps: TraceStep[],
  finalize: {
    final_response?: string;
    actual_outcome?: string;
    goal_achieved?: boolean;
    success?: boolean;
    total_duration_ms?: number;
  }
): Record<string, unknown> {
  return {
    trace_id: meta.trace_id,
    agent_name: meta.name,
    goal: meta.goal,
    agent_framework: meta.agent_framework,
    ...(meta.agent_model !== undefined && { agent_model: meta.agent_model }),
    ...(meta.user_query !== undefined && { user_query: meta.user_query }),
    ...(meta.expected_outcome !== undefined && {
      expected_outcome: meta.expected_outcome,
    }),
    ...(finalize.actual_outcome !== undefined && {
      actual_outcome: finalize.actual_outcome,
    }),
    ...(finalize.goal_achieved !== undefined && {
      goal_achieved: finalize.goal_achieved,
    }),
    ...(finalize.success !== undefined && { success: finalize.success }),
    steps,
    tools_used: uniqueToolsUsed(steps),
    ...(finalize.final_response !== undefined && {
      final_response: finalize.final_response,
    }),
    ...(finalize.total_duration_ms !== undefined && {
      total_duration_ms: finalize.total_duration_ms,
    }),
    ...(meta.metadata !== undefined && { metadata: meta.metadata }),
  };
}

export async function handleTraceFinalize(args: {
  trace_id: string;
  final_response?: string;
  actual_outcome?: string;
  goal_achieved?: boolean;
  success?: boolean;
  total_duration_ms?: number;
  goal?: string;
  name?: string;
  agent_framework?: string;
  agent_model?: string;
  expected_outcome?: string;
}): Promise<FinalizeResult> {
  const session = getSession(args.trace_id);
  if (!session) {
    throw new Error(
      "Unknown trace_id: did you call trustmodel_trace_start first? (It may have timed out after 30 min inactivity, or the JSONL file was deleted.)"
    );
  }

  // Merge start metadata with any finalize-time overrides.
  const goal = args.goal ?? session.meta.goal;
  const name = args.name ?? session.meta.name;
  const agent_framework = args.agent_framework ?? session.meta.agent_framework;
  const agent_model = args.agent_model ?? session.meta.agent_model;
  const expected_outcome = args.expected_outcome ?? session.meta.expected_outcome;

  const totalDuration =
    args.total_duration_ms ?? computeTotalDurationMs(session.steps);

  const tracePayload = buildAgentTrace(
    {
      trace_id: session.meta.trace_id,
      goal,
      name,
      agent_framework,
      agent_model,
      user_query: session.meta.user_query,
      expected_outcome,
      metadata: session.meta.metadata,
    },
    session.steps,
    {
      final_response: args.final_response,
      actual_outcome: args.actual_outcome,
      goal_achieved: args.goal_achieved,
      success: args.success,
      total_duration_ms: totalDuration,
    }
  );

  const body = JSON.stringify(tracePayload);
  const file_size = Buffer.byteLength(body, "utf8");

  // Step 1: get a signed URL and check size limit.
  const uploadResp = await postAgenticUploadUrl({
    file_type: "json",
    file_size,
  });

  if (file_size > uploadResp.max_file_size) {
    const mb = (file_size / (1024 * 1024)).toFixed(2);
    const limitMb = (uploadResp.max_file_size / (1024 * 1024)).toFixed(0);
    throw new Error(
      `Trace size ${mb} MB exceeds server limit ${limitMb} MB. Reduce steps or content.`
    );
  }

  // Step 2: PUT to signed URL. If this fails, the session stays on disk so the
  // caller can retry trace_finalize.
  await putToSignedUrl(uploadResp.signed_url, body, "application/json");

  // Step 3: kick off evaluation. If this fails, the trace is already in cloud
  // storage — drop the local JSONL and return the file_path + error so the
  // caller can retry via trustmodel_evaluate_agent without re-uploading.
  let evalResp: EvaluationOk;
  try {
    evalResp = (await postEvaluateAgent({
      file_path: uploadResp.file_path,
      goal,
      name,
      agent_framework,
      ...(agent_model !== undefined && { agent_model }),
      ...(expected_outcome !== undefined && { expected_outcome }),
      ...(args.actual_outcome !== undefined && {
        actual_outcome: args.actual_outcome,
      }),
      ...(args.goal_achieved !== undefined && {
        goal_achieved: args.goal_achieved,
      }),
    })) as EvaluationOk;
  } catch (err) {
    removeSession(args.trace_id);
    const tmErr = err as TrustModelError;
    return {
      trace_id: args.trace_id,
      file_path: uploadResp.file_path,
      expires_in: uploadResp.expires_in,
      step_count: session.steps.length,
      evaluation_error: {
        status: typeof tmErr?.status === "number" ? tmErr.status : 0,
        detail: tmErr?.detail ?? tmErr?.message ?? String(err),
      },
    };
  }

  // Happy path.
  const stepCount = session.steps.length;
  removeSession(args.trace_id);

  return {
    trace_id: args.trace_id,
    file_path: uploadResp.file_path,
    expires_in: uploadResp.expires_in,
    step_count: stepCount,
    evaluation_run_id: evalResp.evaluation_run_id,
    evaluation_status: evalResp.status,
    ...(evalResp.message !== undefined && { evaluation_message: evalResp.message }),
  };
}
