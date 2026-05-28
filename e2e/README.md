# Axis-2 E2E smoke harness (TRUS-1037)

Runnable harness that exercises the five Axis-2 sprint features against a configured environment and reports pass/fail per feature. Used as the Friday-demo stack-up check.

## Steps

| Ticket | Step | Layers asserted |
|---|---|---|
| TRUS-847 | MCP scanner (`scan_server`) | local AGT only |
| TRUS-848 | Shadow Discovery (`scan_paths`) | local AGT only |
| TRUS-726 | Red Team `list_probes` | MCP → gateway → DB |
| TRUS-872 | Shadow AI AWS scan create | MCP → gateway → DB (round-trip GET) |
| TRUS-873 | Shadow AI Azure scan create | MCP → gateway → DB (round-trip GET) |

The webhook leg is **not** exercised in v1 (needs a subscribed endpoint to verify against) — tracked as a follow-up.

## Invoke

```bash
# QA target
export TRUSTMODEL_API_KEY=tm-qa-...
export TRUSTMODEL_BASE_URL=https://api-trustmodel.pdxqa.com

npm run smoke
```

`npm run smoke` builds first (`tsc`), then drives `e2e/smoke.mjs`. Each step is independent — a failure in one doesn't abort the others; you get the full report at the end.

Exit codes:
- `0` — all steps green
- `1` — at least one step failed
- `2` — required env vars missing (couldn't even attempt the gateway steps)

## Interpreting failures

- **404 on `red-team/probes/`** → QA gateway image predates TRUS-726's `sdk/urls.py` wrappers. Redeploy gateway main to QA.
- **400 on Shadow AI AWS create** → DRF serializer rejected the AWS field shape; TRUS-872 may not be deployed to QA, or the field names changed.
- **400 on Shadow AI Azure create** → same shape, TRUS-873 not deployed or fields changed.
- **`scan was skipped: feature_flag_disabled`** → `TRUSTMODEL_AGT_DISCOVERY_ENABLED` not set on this process. The harness sets it automatically, so if you see this something stripped it.
- **`network/fetch failed`** → DNS / TLS / connectivity to the gateway. Check `TRUSTMODEL_BASE_URL` is reachable from this host.

## What stub credentials do

The Shadow AI AWS + Azure steps post **deliberately fake** credentials. The gateway accepts them at the serializer layer (which is what we want to assert); the Cloud Run worker would refuse them when it actually tried to scan, but we don't wait for that — we just verify create + persist + round-trip.

Credentials in `e2e/steps/shadow-ai-{aws,azure}.mjs` are clearly-fake values flagged with `gitleaks:allow` so the secrets scanner doesn't false-positive.

## v2 follow-ups

- Webhook leg — subscribe a webhook receiver (e.g. webhook.site URL via env var), trigger an event, assert delivery
- TRUS-847 / TRUS-848 dashboard tab assertion (requires the cosmic-vector list endpoints — gateway side already exercised in steps above)
- TRUS-873 scan completion check (poll the run row until status flips) — out of scope for a smoke pass
