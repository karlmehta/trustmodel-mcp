/**
 * TrustModel API HTTP client.
 *
 * Reads configuration from environment variables:
 *   TRUSTMODEL_API_KEY  — Bearer token for authentication (required)
 *   TRUSTMODEL_BASE_URL — API base URL (default: https://api.trustmodel.ai)
 */

const BASE_URL = process.env.TRUSTMODEL_BASE_URL ?? "https://api.trustmodel.ai";

function getApiKey(): string {
  const key = process.env.TRUSTMODEL_API_KEY;
  if (!key) {
    throw new Error(
      "TRUSTMODEL_API_KEY environment variable is not set. " +
        "Obtain an API key at https://app.trustmodel.ai/settings/api-keys"
    );
  }
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export interface TrustModelError {
  status: number;
  message: string;
  detail?: unknown;
}

async function handleResponse(res: Response): Promise<unknown> {
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    const err: TrustModelError = {
      status: res.status,
      message: `TrustModel API returned ${res.status} ${res.statusText}`,
      detail,
    };
    throw err;
  }
  return res.json();
}

// ── POST helpers ────────────────────────────────────────────────────────────────

export async function postEvaluate(body: {
  dimension?: string;
  prompt: string;
  response: string;
  context?: Record<string, unknown>;
  guardrail_set_id?: string;
}): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/sdk/v1/evaluate/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function postEvaluateCots(body: {
  connection_id: string;
  data: Record<string, unknown>;
  categories?: string[];
  guardrail_set_id?: string;
}): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/sdk/v1/evaluate/cots/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function postGuardrailsEvaluate(body: {
  guardrail_set_id: string;
  evaluation_data: Record<string, unknown>;
}): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/sdk/v1/guardrails/evaluate/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

// ── GET helpers ─────────────────────────────────────────────────────────────────

export async function getEvaluation(evaluationId: string): Promise<unknown> {
  const res = await fetch(
    `${BASE_URL}/sdk/v1/evaluations/${encodeURIComponent(evaluationId)}/`,
    { headers: headers() }
  );
  return handleResponse(res);
}

export async function getCotsConnection(connectionId: string): Promise<unknown> {
  const res = await fetch(
    `${BASE_URL}/sdk/v1/cots/connections/${encodeURIComponent(connectionId)}/`,
    { headers: headers() }
  );
  return handleResponse(res);
}

export async function getCredits(): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/sdk/v1/credits/`, {
    headers: headers(),
  });
  return handleResponse(res);
}

// ── Agent Evaluation ──────────────────────────────────────────────────────────

export interface AgentStep {
  step_number: number;
  step_type: "think" | "tool_call" | "tool_result" | "response";
  content?: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: string;
  timestamp?: string;
  duration_ms?: number;
}

export interface AgentTrace {
  trace_id?: string;
  agent_name: string;
  user_query?: string;
  steps: AgentStep[];
  final_response?: string;
  tools_used?: string[];
  success?: boolean;
  total_duration_ms?: number;
  metadata?: Record<string, unknown>;
}

export async function postEvaluateAgent(body: {
  trace: AgentTrace;
}): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/sdk/v1/evaluate/agent/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function postEvaluateMCPServer(body: {
  server_name: string;
  server_url?: string;
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
}): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/sdk/v1/evaluate/mcp-server/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function getAgentScore(agentName: string): Promise<unknown> {
  const res = await fetch(
    `${BASE_URL}/v1/public/score/agent/${encodeURIComponent(agentName)}/`,
    { headers: headers() }
  );
  return handleResponse(res);
}
