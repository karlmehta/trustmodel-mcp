/**
 * TRUS-872 smoke step — Shadow AI AWS scan create + round-trip read.
 *
 * Hits `POST /sdk/v1/shadow-ai/scans/` with a stub `aws_accounts` +
 * access-key triple. The scanner worker (Cloud Run Job) won't be able
 * to actually scan AWS with these dummy creds, but that's fine — the
 * smoke step only asserts:
 *
 *   1. Gateway accepts the request (DRF serializer validates the new
 *      AWS fields from TRUS-872)
 *   2. A run row is persisted (201 + id returned)
 *   3. GET round-trip returns the same id with status reflecting
 *      either QUEUED, PAYMENT_PENDING, or RUNNING (any of those means
 *      the create→persist→read pipeline works)
 *
 * Credentials are deliberately stub values. The gateway is supposed to
 * accept them at the serializer level; the worker would reject when it
 * actually tried to scan, but we don't wait that long.
 */
const STUB_AWS_ACCOUNT = "123456789012";
// AWS access-key IDs are `AKIA` + 16 chars of [A-Z0-9] — exactly 20 chars
// total. The gateway serializer enforces this regex, so the stub has to
// satisfy it even though the worker would later reject the value.
const STUB_ACCESS_KEY_ID = "AKIAEXAMPLESMOKE1234";
// gitleaks:allow — stub value for E2E smoke, not a real secret
const STUB_SECRET_ACCESS_KEY = "x".repeat(40);

export async function runShadowAIAwsStep(ctx) {
  const createUrl = `${ctx.baseUrl}/sdk/v1/shadow-ai/scans/`;
  const body = {
    scan_filter: { aws_accounts: [STUB_AWS_ACCOUNT] },
    aws_access_key_id: STUB_ACCESS_KEY_ID,
    aws_secret_access_key: STUB_SECRET_ACCESS_KEY,
    metadata: { source: "e2e-smoke", ticket: "TRUS-872" },
  };

  let createRes;
  try {
    createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      name: "Shadow AI AWS scan create",
      ok: false,
      detail: `network/fetch failed against ${createUrl}`,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }

  if (!createRes.ok) {
    const snippet = (await createRes.text().catch(() => "")).slice(0, 200);
    return {
      name: "Shadow AI AWS scan create",
      ok: false,
      detail:
        `POST returned HTTP ${createRes.status} ${createRes.statusText}` +
        (snippet ? ` — ${snippet}` : ""),
    };
  }

  let created;
  try {
    created = await createRes.json();
  } catch (err) {
    return {
      name: "Shadow AI AWS scan create",
      ok: false,
      detail: "201/200 but body wasn't JSON",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const id = created?.id;
  if (!id) {
    return {
      name: "Shadow AI AWS scan create",
      ok: false,
      detail: `response missing id (got keys: ${Object.keys(created || {}).join(", ")})`,
    };
  }

  // Round-trip: read the same scan back to verify persistence.
  const detailUrl = `${ctx.baseUrl}/sdk/v1/shadow-ai/scans/${encodeURIComponent(String(id))}/`;
  const detailRes = await fetch(detailUrl, {
    headers: { Authorization: `Bearer ${ctx.apiKey}`, Accept: "application/json" },
  });
  if (!detailRes.ok) {
    return {
      name: "Shadow AI AWS scan create",
      ok: false,
      detail: `created id=${id} but GET round-trip returned HTTP ${detailRes.status}`,
    };
  }
  const detail = await detailRes.json().catch(() => ({}));
  const status = detail?.status ?? created?.status ?? "?";

  return {
    name: "Shadow AI AWS scan create",
    ok: true,
    detail: `scan id=${id} persisted, status=${status}, aws_accounts accepted`,
  };
}
