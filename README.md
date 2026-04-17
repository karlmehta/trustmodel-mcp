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
| `TRUSTMODEL_BASE_URL` | No | `https://api.trustmodel.ai` | API base URL. Override for QA (`https://api-trustmodel.pdxqa.com`) or local dev (`http://localhost:8000`). |
| `TRUSTMODEL_TRACE_DIR` | No | `~/.trustmodel-mcp/traces/` | Where streaming trace sessions are persisted as append-only JSONL. Sessions survive server restarts via rehydrate-on-read. |

## Tools

The server exposes **9 tools** across two areas: classic model evaluation and agentic trace evaluation.

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

### Scenario: code-review agent

Paste this prompt into Claude Code (or any MCP client with TrustModel connected):

```text
I want you to review the files in src/tools/ of this project for code quality
issues, while recording a TrustModel trace of your work.

Before you start, call trustmodel_trace_start with:
  goal: "Review src/tools/ for code quality, consistency, and potential bugs"
  name: "Code review agent"
  agent_framework: "claude-code"
  agent_model: "claude-sonnet-4-5"

As you work, record a trustmodel_trace_step for each action:
  - Before reading a file → step_type: "tool_call" with tool_name and path in tool_args
  - After reading → step_type: "tool_result" with a summary in content
  - When you form an observation → step_type: "thought" with your reasoning
  - When you spot an issue → step_type: "observation" with the finding

When done, call trustmodel_trace_finalize with your summary as final_response
and goal_achieved: true.

Print the evaluation_run_id so I can check the report.
```

### What happens

Claude Code executes the review while self-tracing. A typical session looks like:

```text
trustmodel_trace_start({ goal: "Review src/tools/...", name: "Code review agent", ... })
→ { trace_id: "trace-9a2f71c3b84e" }

trustmodel_trace_step({ step_type: "thought", content: "I'll review each tool file for consistent error handling, schema correctness, and edge cases." })
→ { step_number: 1 }

trustmodel_trace_step({ step_type: "tool_call", tool_name: "Read", tool_args: { file_path: "src/tools/evaluate.ts" } })
→ { step_number: 2 }

trustmodel_trace_step({ step_type: "tool_result", content: "evaluate.ts: 109 lines, defines trustmodel_evaluate with 12 Zod fields..." })
→ { step_number: 3 }

trustmodel_trace_step({ step_type: "observation", content: "evaluate.ts passes undefined optional fields to postEvaluate — consider stripping them to reduce payload." })
→ { step_number: 4 }

... (reads more files, records thoughts and observations) ...

trustmodel_trace_step({ step_type: "final_answer", content: "Reviewed 6 tool files. Found 3 minor issues: ..." })
→ { step_number: 14 }

trustmodel_trace_finalize({
  trace_id: "trace-9a2f71c3b84e",
  final_response: "Reviewed 6 tool files. Found 3 minor issues: ...",
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

## License

MIT
