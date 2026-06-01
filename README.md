# TrustModel MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets any AI agent call [TrustModel](https://trustmodel.ai) for trust evaluation, safety/bias analysis, and end-to-end agentic trace evaluation.

Works with Claude Code, Cursor, Windsurf, Claude Desktop, and any other MCP-compatible client.

## Quick Start

### 1. Get an API key

Sign up at [app.trustmodel.ai](https://app.trustmodel.ai) and create an API key under **Settings → API Keys**. Keys have the format `tm-{env}-{keyid}_{secret}` (e.g. `tm-prod-abc12345_0123456789abcdef…`).

### 2. Configure your MCP client

#### Claude Code

```bash
claude mcp add trustmodel \
  --env TRUSTMODEL_API_KEY=tm-prod-xxxx_yyyy \
  -- npx -y @trustmodel/mcp-server
```

#### Cursor / Windsurf

Add to your MCP configuration file (`.cursor/mcp.json` or equivalent):

```json
{
  "mcpServers": {
    "trustmodel": {
      "command": "npx",
      "args": ["-y", "@trustmodel/mcp-server"],
      "env": {
        "TRUSTMODEL_API_KEY": "tm-prod-xxxx_yyyy"
      }
    }
  }
}
```

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "trustmodel": {
      "command": "npx",
      "args": ["-y", "@trustmodel/mcp-server"],
      "env": {
        "TRUSTMODEL_API_KEY": "tm-prod-xxxx_yyyy"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TRUSTMODEL_API_KEY` | Yes | — | Your TrustModel API key (`tm-{env}-{keyid}_{secret}`). |
| `TRUSTMODEL_TRACE_DIR` | No | `~/.trustmodel-mcp/traces/` | Where streaming trace sessions are persisted as append-only JSONL. Sessions survive server restarts via rehydrate-on-read. |
| `TRUSTMODEL_AGT_DISCOVERY_ENABLED` | No | `false` | Enables the filesystem-touching Shadow Discovery tools (`trustmodel_shadow_discovery_*`). When unset, those tools return a skip report. |

## Tools

The server exposes **18 tools** across six areas. Use this table to pick the right one; full input/output docs follow below.

| Tool | Group | When to use |
|---|---|---|
| `trustmodel_evaluate` | Eval | Kick off a batch trust evaluation of a model (safety, bias, accuracy, …); returns an `id` to poll. |
| `trustmodel_score` | Eval | Fetch status/scores for an evaluation created with `trustmodel_evaluate`. |
| `trustmodel_credits` | Eval | Check remaining API credit balance. |
| `trustmodel_trace_start` | Agentic Trace | Open a streaming trace session before an agent starts working. |
| `trustmodel_trace_step` | Agentic Trace | Record one reasoning step, tool call, tool result, or response as the agent runs. |
| `trustmodel_trace_finalize` | Agentic Trace | Close the session, upload the trace, and auto-create the agent evaluation run. |
| `trustmodel_upload_trace` | Agentic Trace | One-shot: PUT a pre-assembled trace JSON when you didn't stream it. |
| `trustmodel_evaluate_agent` | Agentic Trace | Create an agentic evaluation run against an already-uploaded trace `file_path`. |
| `trustmodel_score_agent` | Agentic Trace | Fetch scores/grade for an agentic evaluation run. |
| `trustmodel_mcp_scan_server` | Security | Security-scan a third-party MCP server's tool list for risky/abusable tools. |
| `trustmodel_shadow_discovery_scan_paths` | Shadow Discovery | Scan local filesystem paths for unregistered/shadow AI usage. |
| `trustmodel_shadow_discovery_fingerprint_keys` | Shadow Discovery | Detect & fingerprint OpenAI/Anthropic API keys found on disk. |
| `trustmodel_redteam_evaluate` | Red Team | Launch an adversarial red-team evaluation against a model/endpoint. |
| `trustmodel_redteam_results` | Red Team | Fetch results for a red-team evaluation. |
| `trustmodel_redteam_list_probes` | Red Team | List available red-team probes/attack categories. |
| `trustmodel_shadowai_scan` | Shadow AI | Start a Shadow AI scan to find unregistered AI use across an environment. |
| `trustmodel_shadowai_results` | Shadow AI | Fetch results for a Shadow AI scan. |
| `trustmodel_shadowai_events` | Shadow AI | Stream the detection events for a Shadow AI scan. |

> **Shadow Discovery** tools (`trustmodel_shadow_discovery_*`) touch the local filesystem. They are always listed, but return a skip report unless `TRUSTMODEL_AGT_DISCOVERY_ENABLED=true` is set on the server.

### Classic evaluation

#### `trustmodel_evaluate`

Create a batch evaluation run against a specified AI model. The backend runs a comprehensive suite (safety, bias, accuracy, hallucination, reasoning, etc.) and returns an `id` you can poll with `trustmodel_score`.

**Inputs:**
- `model_identifier` (string, required) — e.g. `"gpt-4o"`, `"claude-sonnet-4-5"`. Discover via `GET /sdk/v1/models/`.
- `vendor_identifier` (string, required) — e.g. `"openai"`, `"anthropic"`, `"google"`.
- `api_key` (string, optional) — Vendor API key for BYOK. Omit to use TrustModel's platform key. Do **not** pass a TrustModel API key here — that goes in the `TRUSTMODEL_API_KEY` env var.
- `categories` (string[], optional) — Category names to evaluate. Only honored when `evaluation_type` is `"Custom"` or `"Score Only"`.
- `evaluation_type` (string, optional, default `"Custom"`) — One of `"Custom"`, `"Score Only"`, `"Comprehensive"`, `"Limited"`, `"Quick Scan"`.
- `application_type` (string, optional, default `"generic"`) — `chatbot`, `knowledge-agent`, `creation-tool`, `document-repository`, `analysis-tool`, `automation-agent`, `generic`.
- `user_personas` (string[], optional, default `["external-customer"]`) — Any of `external-customer`, `internal-employee`, `technical-user`, `domain-expert`, `vulnerable-groups`, `generic`.
- `application_description` (string, optional).
- `domain_expert_description` (string, optional) — When `user_personas` includes `"domain-expert"`. One of `"cross-domain"` (default), `"medical"`, `"commercial_banking"`.
- `model_config_name` (string, optional) — Display name for this run.
- `template_id` (UUID, optional), `template_name` (string, optional) — Reuse or rename an existing evaluation template.

#### `trustmodel_score`

Fetch the detail (status, completion %, scores) for an evaluation created via `trustmodel_evaluate`.

**Inputs:**
- `evaluation_id` (integer or numeric string, required) — The `id` returned by `trustmodel_evaluate`.

#### `trustmodel_credits`

Check remaining API credit balance. No inputs.

### Agentic trace evaluation

TrustModel evaluates AI agents by consuming their execution trace (thoughts, tool calls, tool results, responses) and scoring them across 4 categories: `tool_use_accuracy`, `reasoning_quality`, `goal_completion`, `safety_compliance`.

There are two ways to submit a trace — **streaming** (preferred for live agents) and **one-shot** (when you have a pre-assembled trace).

#### Streaming capture (preferred)

Open a session, record steps as the agent works, finalize at the end. Finalize uploads to cloud storage and auto-creates the evaluation run.

##### `trustmodel_trace_start`

Open a new trace session.

**Inputs:**
- `goal` (string, required) — What the agent is trying to achieve.
- `name` (string, required) — Display name for the evaluation run.
- `agent_framework` (string, required) — e.g. `"langchain"`, `"crewai"`, `"claude-code"`, `"custom"`.
- `agent_model` (string, optional) — e.g. `"gpt-4o"`, `"claude-sonnet-4-5"`.
- `user_query` (string, optional) — Original user prompt, if different from `goal`.
- `expected_outcome` (string, optional).
- `metadata` (object, optional) — Free-form passthrough metadata.

**Returns:** `{ trace_id, started_at }`.

##### `trustmodel_trace_step`

Append a single step to the active session. Call once per reasoning step, tool call, tool result, or user-facing response.

**Inputs:**
- `trace_id` (string, required) — From `trustmodel_trace_start`.
- `step_type` (enum, required) — One of `thought`, `think`, `tool_call`, `tool_result`, `observation`, `decision`, `error`, `human_input`, `response`, `final_answer`.
- `content` (string, required) — Human-readable text for the step. Empty string allowed.
- `tool_name` (string, optional), `tool_args` (object, optional) — Use with `tool_call`.
- `tool_result` (string or object, optional), `tool_call_success` (boolean, optional) — Use with `tool_result`.
- `model_used` (string, optional), `input_tokens` / `output_tokens` (int, optional), `duration_ms` (int, optional), `timestamp` (ISO 8601, optional).

**Returns:** `{ trace_id, step_number, steps_recorded }`. `step_number` is auto-assigned.

##### `trustmodel_trace_finalize`

Close the session, upload the trace, and auto-create the evaluation run.

**Inputs:**
- `trace_id` (string, required).
- `final_response` (string, optional), `actual_outcome` (string, optional), `goal_achieved` (boolean, optional), `success` (boolean, optional), `total_duration_ms` (int, optional — computed from step durations if omitted).
- `goal` / `name` / `agent_framework` / `agent_model` / `expected_outcome` (all optional) — Override start-time metadata if the agent learned more at runtime.

**Returns (happy path):** `{ trace_id, file_path, expires_in, step_count, evaluation_run_id, evaluation_status, evaluation_message }`.

**Returns (evaluate failed after successful upload):** `{ trace_id, file_path, expires_in, step_count, evaluation_error }`. You can retry evaluation without re-uploading via `trustmodel_evaluate_agent({ file_path, goal, name, agent_framework })`.

#### One-shot (pre-assembled trace)

##### `trustmodel_upload_trace`

PUT an already-built trace JSON object to cloud storage. Returns a `file_path` you then pass to `trustmodel_evaluate_agent`.

**Inputs:**
- `trace` (object, required) — Complete `AgentTrace` JSON.

**Returns:** `{ file_path, expires_in }`.

##### `trustmodel_evaluate_agent`

Create an agentic evaluation run against a previously-uploaded trace.

**Inputs:**
- `file_path` (string, required) — From `trustmodel_upload_trace` or `trustmodel_trace_finalize`.
- `goal` / `name` / `agent_framework` (strings, required).
- `agent_model` / `expected_outcome` / `actual_outcome` (string, optional).
- `goal_achieved` (boolean, optional).

**Returns:** `{ evaluation_run_id, status, message }`.

##### `trustmodel_score_agent`

Fetch the detail (scores, grade, summary) for an agentic evaluation run.

**Inputs:**
- `evaluation_run_id` (integer or numeric string, required).

### Security

#### `trustmodel_mcp_scan_server`

Run AGT's MCP security scanner over a third-party MCP server's tool list to detect tool poisoning, typosquatting, hidden instructions, and rug-pull patterns. Static analysis — no LLM, no network, deterministic. Intended as a pre-registration check before an agent enables a third-party MCP server.

**Inputs:**
- `tools` (array, required) — The third-party server's tool definitions (`name`, `description`, optional input schema).

**Returns:** A `ScanReport` with overall status (`ok` / `warning` / `blocked`), worst severity seen, and per-tool findings.

### Shadow Discovery

> Filesystem-touching. Returns a skip report unless `TRUSTMODEL_AGT_DISCOVERY_ENABLED=true`.

#### `trustmodel_shadow_discovery_scan_paths`

Walk local filesystem paths and detect agents in config files (`agentmesh.yaml`, `crewai.yaml`, `mcp.json`, `claude_desktop_config.json`, …), Dockerfiles/compose, and optionally source. Reconciles detections against a caller-supplied registry and returns the unregistered ones as **shadow agents** with AGT risk scoring + remediation. Static analysis only.

**Inputs:**
- `paths` (string[], required) — Local paths to scan.
- `registry` (array, optional) — Known agents (`did`, `name`, `owner`, …) to reconcile against.

#### `trustmodel_shadow_discovery_fingerprint_keys`

Fingerprint a batch of provider API keys (OpenAI / Anthropic) by calling each provider's read-only models endpoint — no inference is run. A reachable key is flagged high-risk (possible credential exposure); a revoked key is informational. Key material is never logged or returned — only a `provider:****last4` fingerprint.

**Inputs:**
- `keys` (string[], required) — API keys to probe.

### Red Team

#### `trustmodel_redteam_evaluate`

Run an adversarial red-team evaluation against an OpenAI-compatible target. Probes cover 8 attack categories aligned with OWASP LLM Top 10 (2025) — prompt injection, jailbreak, PII extraction, bias elicitation, hallucination triggers, and more.

**Inputs:**
- `model_name` (string, required) — e.g. `"openai/gpt-oss-20b:free"`.
- `api_key` (string, required), `api_base_url` (string, required) — e.g. `"https://openrouter.ai/api/v1"`.
- `categories` (string[], optional), `severities` (string[], optional), `metadata` (object, optional).

**Returns:** The evaluation `id` — poll with `trustmodel_redteam_results`.

#### `trustmodel_redteam_results`

Get status, progress, overall score, per-category breakdown, and severity buckets for a red-team evaluation. Partial progress while running, full summary when completed.

**Inputs:**
- `evaluation_id` (integer or numeric string, required).

#### `trustmodel_redteam_list_probes`

Browse the red-team probe library (metadata only — payloads are not exposed). Filter by category, severity, or tag.

**Inputs:**
- `category` (string, optional), `severity` (string, optional), `tag` (string, optional).

### Shadow AI

#### `trustmodel_shadowai_scan`

Kick off a Shadow AI Discovery scan against GitHub orgs/repos and (optionally) GCP projects. Detects unregistered AI by sniffing source for LLM SDK usage (15 libraries) and listing Vertex AI endpoints, Cloud Run services with AI env vars, and BigQuery ML models.

**Inputs:**
- `github_orgs` (string[], optional), `github_repos` (string[] of `owner/name`, optional), `gcp_projects` (string[], optional), `metadata` (object, optional).

**Returns:** The scan `id` — poll with `trustmodel_shadowai_results`, page discoveries with `trustmodel_shadowai_events`.

#### `trustmodel_shadowai_results`

Get status, scan filter, total event count, and discoveries-by-system-type / by-source aggregates for a Shadow AI scan.

**Inputs:**
- `scan_id` (integer or numeric string, required).

#### `trustmodel_shadowai_events`

Page through individual discovery events — each is one discovered AI system with `system_type`, `discovered_via`, evidence, and a stable `system_id` fingerprint. Filter by `system_type` or `source`.

**Inputs:**
- `scan_id` (integer or numeric string, required), plus optional `system_type` / `source` filters and pagination.

## Example — streaming agent capture

```text
trustmodel_trace_start({
  goal: "Book a flight from NYC to SF",
  name: "Flight booking agent",
  agent_framework: "claude-code",
  agent_model: "claude-sonnet-4-5"
})
→ { trace_id: "trace-abc123def456", started_at: "..." }

trustmodel_trace_step({ trace_id, step_type: "thought",
  content: "Need to search flights first." })
→ { step_number: 1, steps_recorded: 1 }

trustmodel_trace_step({ trace_id, step_type: "tool_call",
  content: "Searching flights",
  tool_name: "flight_api.search",
  tool_args: { from: "NYC", to: "SFO", date: "2026-04-20" },
  duration_ms: 500 })
→ { step_number: 2, steps_recorded: 2 }

trustmodel_trace_step({ trace_id, step_type: "tool_result",
  content: "Found UA123 at $350",
  tool_name: "flight_api.search",
  tool_result: { flight: "UA123", price: 350 },
  tool_call_success: true })
→ { step_number: 3, steps_recorded: 3 }

trustmodel_trace_step({ trace_id, step_type: "final_answer",
  content: "Booked UA123 for $350." })
→ { step_number: 4, steps_recorded: 4 }

trustmodel_trace_finalize({ trace_id,
  final_response: "Booked UA123 for $350.",
  goal_achieved: true })
→ {
    file_path: "agent-traces/<org>/<ts>_<uuid>.json",
    step_count: 4,
    evaluation_run_id: 42,
    evaluation_status: "processing"
  }

trustmodel_score_agent({ evaluation_run_id: 42 })
→ { status: "processing" | "completed", scores: [...], grade, overall_score, ... }
```

## Example — realistic agentic flow

Below is a real-world scenario: you ask Claude Code to perform a task while instrumenting itself with TrustModel trace capture. At the end, TrustModel scores the agent across tool-use accuracy, reasoning quality, goal completion, and safety compliance — giving you a trust report before you ship the agent to production.

### Scenario: research agent

Paste this prompt into Claude Code (or any MCP client with TrustModel connected):

```text
Research the pros and cons of using WebSockets vs Server-Sent Events for
real-time notifications in a web app, while recording a TrustModel trace.

Before you start, call trustmodel_trace_start with:
  goal: "Research WebSockets vs SSE for real-time notifications"
  name: "Research agent"
  agent_framework: "claude-code"

As you work, record a trustmodel_trace_step for each action:
  - When you reason about the topic → step_type: "thought"
  - When you search or fetch info  → step_type: "tool_call" with tool_name
  - After getting results back      → step_type: "tool_result"
  - When you draw a conclusion      → step_type: "observation"

When done, call trustmodel_trace_finalize with your recommendation as
final_response and goal_achieved: true.

Print the evaluation_run_id so I can check the trust report.
```

### What happens

The agent researches the topic while self-tracing every reasoning step, search, and conclusion. A typical session looks like:

```text
trustmodel_trace_start({ goal: "Research WebSockets vs SSE...", name: "Research agent", ... })
→ { trace_id: "trace-9a2f71c3b84e" }

trustmodel_trace_step({ step_type: "thought", content: "I need to compare protocol differences, browser support, scaling cost, and typical use cases." })
→ { step_number: 1 }

trustmodel_trace_step({ step_type: "tool_call", tool_name: "WebSearch", tool_args: { query: "websockets vs server-sent events performance comparison" } })
→ { step_number: 2 }

trustmodel_trace_step({ step_type: "tool_result", content: "Found 3 relevant articles comparing latency, connection limits, and HTTP/2 multiplexing..." })
→ { step_number: 3 }

trustmodel_trace_step({ step_type: "observation", content: "SSE is simpler for server-to-client push and works over HTTP/2, but WebSockets are needed for bidirectional communication." })
→ { step_number: 4 }

... (more research, comparisons, trade-off analysis) ...

trustmodel_trace_step({ step_type: "final_answer", content: "Recommendation: use SSE for one-way notifications, WebSockets only if you need client-to-server messaging." })
→ { step_number: 10 }

trustmodel_trace_finalize({
  trace_id: "trace-9a2f71c3b84e",
  final_response: "Recommendation: use SSE for one-way notifications...",
  goal_achieved: true
})
→ {
    file_path: "agent-traces/<org>/<timestamp>.json",
    evaluation_run_id: 42,
    evaluation_status: "processing"
  }
```

### The evaluation result

Poll `trustmodel_score_agent({ evaluation_run_id: 42 })` after 1-2 minutes. TrustModel returns:

```json
{
  "status": "completed",
  "overall_score": 7.6,
  "grade": "C",
  "scores": [
    { "category": "tool_use_accuracy",  "score": 100.0 },
    { "category": "reasoning_quality",  "score": 60.0  },
    { "category": "goal_completion",    "score": 70.0  },
    { "category": "safety_compliance",  "score": 80.0  }
  ],
  "summary": {
    "trust_dimensions": {
      "safety": 9.0, "fairness": 7.0, "privacy": 10.0,
      "transparency": 6.0, "robustness": 10.0, "accountability": 10.0
    }
  }
}
```

A PDF/HTML report with detailed findings is also generated and accessible from the TrustModel dashboard.

### Why this matters

Every AI agent making decisions — reviewing code, processing claims, screening candidates — needs a trust baseline before going to production. This flow gives you that baseline with **zero changes to your agent's core logic**: just wrap it with `trace_start`, record steps as it works, and `trace_finalize` when it's done. TrustModel handles the rest.

## Trace persistence

Active trace sessions are written as append-only JSONL at `$TRUSTMODEL_TRACE_DIR/<trace_id>.jsonl` (default `~/.trustmodel-mcp/traces/`). Disk is the source of truth; the in-memory map is a cache that rehydrates lazily — so sessions survive an MCP server restart. On successful `trustmodel_trace_finalize` the local file is deleted (the trace is already in cloud storage).

Sessions idle more than 30 minutes are auto-evicted. Maximum 100 concurrent sessions per server.

## Dashboard

Reports, evaluation history, and detailed PDF/HTML findings are available in the TrustModel dashboard at **[app.trustmodel.ai](https://app.trustmodel.ai)**.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Server exits immediately / `TRUSTMODEL_API_KEY` error | Set a valid key (`tm-{env}-{keyid}_{secret}`) in your client's `env` block. Get one at [app.trustmodel.ai](https://app.trustmodel.ai) → **Settings → API Keys**. |
| `trustmodel_shadow_discovery_*` returns a skip report | Set `TRUSTMODEL_AGT_DISCOVERY_ENABLED=true` on the server. These tools touch the local filesystem and are off by default. |
| `npx` can't find the package | Ensure Node ≥ 20.19 and run `npx -y @trustmodel/mcp-server` so the latest version is fetched. |
| Tool not listed by the client | Restart the MCP client after editing its config; confirm the `command`/`args` match the examples above. |

## TrustModel open-source

This MCP server is part of the TrustModel OSS toolkit:

- **CLI + SDK** — [`trustmodel`](https://github.com/karlmehta/trustmodel) on PyPI: local trust scoring, governance, and the cloud client. `pip install trustmodel`.
- **MCP server (this repo)** — `@trustmodel/mcp-server` on npm: exposes TrustModel to any MCP client.

## License

MIT
