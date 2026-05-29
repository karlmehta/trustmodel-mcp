/**
 * TRUS-873 smoke step — Shadow AI Azure scan create + round-trip read.
 *
 * Mirrors the AWS step: POST with stub Service Principal credentials,
 * assert the gateway accepts the new `azure_subscriptions` +
 * `azure_tenant_id` / `azure_client_id` / `azure_client_secret` fields
 * (TRUS-873), then GET round-trip to verify persistence.
 */
const STUB_SUBSCRIPTION = "00000000-0000-0000-0000-000000000001";
const STUB_TENANT_ID = "00000000-0000-0000-0000-000000000002";
const STUB_CLIENT_ID = "00000000-0000-0000-0000-000000000003";
// gitleaks:allow — stub value for E2E smoke, not a real secret
const STUB_CLIENT_SECRET = "smoke-stub-secret-not-real";

export async function runShadowAIAzureStep(ctx) {
  const createUrl = `${ctx.baseUrl}/sdk/v1/shadow-ai/scans/`;
  const body = {
    scan_filter: { azure_subscriptions: [STUB_SUBSCRIPTION] },
    azure_tenant_id: STUB_TENANT_ID,
    azure_client_id: STUB_CLIENT_ID,
    azure_client_secret: STUB_CLIENT_SECRET,
    metadata: { source: "e2e-smoke", ticket: "TRUS-873" },
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
      name: "Shadow AI Azure scan create",
      ok: false,
      detail: `network/fetch failed against ${createUrl}`,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }

  if (!createRes.ok) {
    const snippet = (await createRes.text().catch(() => "")).slice(0, 200);
    return {
      name: "Shadow AI Azure scan create",
      ok: false,
      detail:
        `POST returned HTTP ${createRes.status} ${createRes.statusText}` +
        (snippet ? ` — ${snippet}` : ""),
    };
  }

  const created = await createRes.json().catch(() => ({}));
  const id = created?.id;
  if (!id) {
    return {
      name: "Shadow AI Azure scan create",
      ok: false,
      detail: `response missing id (got keys: ${Object.keys(created).join(", ")})`,
    };
  }

  const detailUrl = `${ctx.baseUrl}/sdk/v1/shadow-ai/scans/${encodeURIComponent(String(id))}/`;
  const detailRes = await fetch(detailUrl, {
    headers: { Authorization: `Bearer ${ctx.apiKey}`, Accept: "application/json" },
  });
  if (!detailRes.ok) {
    return {
      name: "Shadow AI Azure scan create",
      ok: false,
      detail: `created id=${id} but GET round-trip returned HTTP ${detailRes.status}`,
    };
  }
  const detail = await detailRes.json().catch(() => ({}));
  const status = detail?.status ?? created?.status ?? "?";

  return {
    name: "Shadow AI Azure scan create",
    ok: true,
    detail: `scan id=${id} persisted, status=${status}, azure_subscriptions accepted`,
  };
}
