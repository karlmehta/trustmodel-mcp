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

export interface EvaluatePublicModelBody {
  model_identifier: string;
  vendor_identifier: string;
  api_key?: string;
  categories?: string[];
  model_config_name?: string;
  application_type?: string;
  user_personas?: string[];
  application_description?: string;
  domain_expert_description?: string;
  evaluation_type?: string;
  template_id?: string;
  template_name?: string;
  trigger_source?: string;
}

export async function postEvaluate(body: EvaluatePublicModelBody): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/sdk/v1/evaluate/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ...body, trigger_source: body.trigger_source ?? "mcp" }),
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

export async function getCredits(): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/sdk/v1/credits/`, {
    headers: headers(),
  });
  return handleResponse(res);
}

// ── Agentic Trace Evaluation ──────────────────────────────────────────────────

export interface AgenticUploadUrlResponse {
  signed_url: string;
  file_path: string;
  expires_in: number;
  max_file_size: number;
}

export async function postAgenticUploadUrl(body: {
  file_type: "json" | "jsonl";
  file_size?: number;
}): Promise<AgenticUploadUrlResponse> {
  const res = await fetch(`${BASE_URL}/sdk/v1/agentic/upload-url/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const raw = (await handleResponse(res)) as {
    signed_url?: string;
    url?: string;
    file_path?: string;
    file_name?: string;
    expires_in?: number;
    max_file_size?: number;
  };

  // The backend returns `url` (and `file_name`); older/alternative versions use
  // `signed_url` (and `file_path`). Normalize to the canonical names so callers
  // never have to care which spelling came back.
  const signed_url = raw.signed_url ?? raw.url;
  const file_path = raw.file_path ?? raw.file_name;
  if (!signed_url || !file_path) {
    throw {
      status: res.status,
      message: "Upload-URL response missing signed URL or file path.",
      detail: raw,
    } satisfies TrustModelError;
  }

  return {
    signed_url,
    file_path,
    expires_in: raw.expires_in ?? 0,
    max_file_size: raw.max_file_size ?? 50 * 1024 * 1024,
  };
}

/**
 * PUT the trace file contents directly to a signed upload URL.
 *
 * The signed URL authenticates itself — we deliberately do NOT send the
 * TrustModel Bearer token here. Content-Type must match what the server
 * signed the URL with (see SDKAgenticTraceUploadURLView in aurora-gateway).
 */
export async function putToSignedUrl(
  signedUrl: string,
  body: string,
  contentType: string
): Promise<void> {
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.text();
    } catch {
      detail = undefined;
    }
    const err: TrustModelError = {
      status: res.status,
      message: `Signed-URL upload returned ${res.status} ${res.statusText}`,
      detail,
    };
    throw err;
  }
}

export async function postEvaluateAgent(body: {
  file_path: string;
  goal: string;
  name: string;
  agent_framework: string;
  agent_model?: string;
  expected_outcome?: string;
  actual_outcome?: string;
  goal_achieved?: boolean;
  trigger_source?: string;
}): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/sdk/v1/agentic/evaluate/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ...body, trigger_source: body.trigger_source ?? "mcp" }),
  });
  return handleResponse(res);
}

export async function getAgenticEvaluation(id: number): Promise<unknown> {
  const res = await fetch(
    `${BASE_URL}/sdk/v1/agentic/evaluations/${encodeURIComponent(String(id))}/`,
    { headers: headers() }
  );
  return handleResponse(res);
}

// ── Red Team (TRUS-722) ────────────────────────────────────────────────────────

export interface RedTeamProbeFilter {
  categories?: readonly string[];
  severities?: readonly string[];
  tags?: readonly string[];
  probe_ids?: readonly string[];
  limit?: number;
}

export interface PostRedTeamEvaluationBody {
  // Per-run target-model credentials. The gateway's
  // CreateEvaluationSerializer requires all three on every request —
  // they're forwarded to the metrics-v2 Cloud Run Job and never
  // persisted on the run row.
  model_name: string;
  api_key: string;
  api_base_url: string;
  // Optional overrides; default to model_name when blank.
  target_model_id?: string;
  target_model_name?: string;
  probe_filter?: RedTeamProbeFilter;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function postRedTeamEvaluation(
  body: PostRedTeamEvaluationBody
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/v1/red-team/evaluations/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function getRedTeamEvaluation(id: string | number): Promise<unknown> {
  const res = await fetch(
    `${BASE_URL}/api/v1/red-team/evaluations/${encodeURIComponent(String(id))}/`,
    { headers: headers() }
  );
  return handleResponse(res);
}

// ── Shadow AI Discovery (TRUS-756) ─────────────────────────────────────────

export interface ShadowAIScanFilter {
  github_orgs?: readonly string[];
  github_repos?: readonly string[];
  gcp_projects?: readonly string[];
}

export interface PostShadowAIScanBody {
  scan_filter: ShadowAIScanFilter;
  // Required when scan_filter includes github_orgs or github_repos.
  // Held in process memory by the gateway worker, never persisted.
  github_token?: string;
  metadata?: Record<string, unknown>;
}

export async function postShadowAIScan(
  body: PostShadowAIScanBody
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/v1/shadow-ai/scans/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function getShadowAIScan(id: string | number): Promise<unknown> {
  const res = await fetch(
    `${BASE_URL}/api/v1/shadow-ai/scans/${encodeURIComponent(String(id))}/`,
    { headers: headers() }
  );
  return handleResponse(res);
}

export async function listShadowAIEvents(
  id: string | number,
  filter: {
    system_type?: string;
    source?: string;
    page?: number;
    page_size?: number;
  } = {}
): Promise<unknown> {
  const params = new URLSearchParams();
  if (filter.system_type) params.set("system_type", filter.system_type);
  if (filter.source) params.set("source", filter.source);
  if (filter.page !== undefined) params.set("page", String(filter.page));
  if (filter.page_size !== undefined) params.set("page_size", String(filter.page_size));
  const qs = params.toString();
  const res = await fetch(
    `${BASE_URL}/api/v1/shadow-ai/scans/${encodeURIComponent(String(id))}/events/${qs ? `?${qs}` : ""}`,
    { headers: headers() }
  );
  return handleResponse(res);
}


export async function listRedTeamProbes(filter: {
  category?: string;
  severity?: string;
  tag?: string;
  limit?: number;
}): Promise<unknown> {
  const params = new URLSearchParams();
  if (filter.category) params.set("category", filter.category);
  if (filter.severity) params.set("severity", filter.severity);
  if (filter.tag) params.set("tag", filter.tag);
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  const qs = params.toString();
  const res = await fetch(
    `${BASE_URL}/api/v1/red-team/probes/${qs ? `?${qs}` : ""}`,
    { headers: headers() }
  );
  return handleResponse(res);
}
