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
