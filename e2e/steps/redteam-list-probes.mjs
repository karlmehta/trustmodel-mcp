/**
 * TRUS-726 smoke step — Red Team list_probes via gateway SDK.
 *
 * Hits `GET /sdk/v1/red-team/probes/` and asserts the response shape
 * (list-of-probes with the required fields). Surfaces:
 *   - QA-deploy gaps (route doesn't exist on QA → 404)
 *   - Auth / scope issues (401/403)
 *   - Empty probe library (server up but seeds didn't run)
 */
export async function runRedTeamListProbesStep(ctx) {
  const url = `${ctx.baseUrl}/sdk/v1/red-team/probes/?limit=5`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${ctx.apiKey}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    return {
      name: "Red Team list_probes",
      ok: false,
      detail: `network/fetch failed against ${url}`,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }

  if (!res.ok) {
    // Read the body once as text — many gateway errors return HTML/JSON
    // we want surfaced verbatim. Don't double-consume the stream
    // (TRUS-1032 lesson).
    const body = await res.text().catch(() => "");
    const snippet = body.slice(0, 200).replace(/\s+/g, " ").trim();
    return {
      name: "Red Team list_probes",
      ok: false,
      detail:
        `HTTP ${res.status} ${res.statusText} from ${url}` +
        (snippet ? ` — ${snippet}` : ""),
    };
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    return {
      name: "Red Team list_probes",
      ok: false,
      detail: "200 OK but body wasn't JSON",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Accept both `{probes: [...]}` and `{results: [...]}` shapes — the
  // SDK wrapper has changed once before and we don't want to pin to one.
  const list =
    Array.isArray(payload) ? payload
    : Array.isArray(payload?.probes) ? payload.probes
    : Array.isArray(payload?.results) ? payload.results
    : null;

  if (list === null) {
    return {
      name: "Red Team list_probes",
      ok: false,
      detail: "200 OK but body wasn't a probe list (expected array or {probes|results})",
    };
  }
  if (list.length === 0) {
    return {
      name: "Red Team list_probes",
      ok: false,
      detail: "endpoint returned an empty probe library — probe seeds run?",
    };
  }

  // Sanity-check the first probe has the fields the dashboard consumes.
  const first = list[0];
  const required = ["id", "category", "severity"];
  const missing = required.filter((k) => first?.[k] === undefined);
  if (missing.length > 0) {
    return {
      name: "Red Team list_probes",
      ok: false,
      detail:
        `probe is missing required fields: ${missing.join(", ")} ` +
        `(got keys: ${Object.keys(first || {}).join(", ")})`,
    };
  }

  return {
    name: "Red Team list_probes",
    ok: true,
    detail: `${list.length} probes returned, first=${first.id} (${first.category}/${first.severity})`,
  };
}
