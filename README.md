# TrustModel MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets any AI agent call [TrustModel](https://trustmodel.ai) for trust evaluation, bias detection, and guardrail enforcement.

Works with Claude Code, Cursor, Windsurf, Workday AI agents, Eightfold AI Interviewer, and any other MCP-compatible client.

## Quick Start

### 1. Get an API key

Sign up at [app.trustmodel.ai](https://app.trustmodel.ai) and create an API key under **Settings > API Keys**.

### 2. Install & configure

#### Claude Code

```bash
claude mcp add trustmodel -- npx -y @trustmodel/mcp-server
``Fc�Set your API key:

```bash
export TRUNTMODEL_API_KEY="tm_your_key_here"
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
        "TRUSTMODEL_API_KEY": "tm_your_key_here"
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
        "TRUSTMODEL_API_KEY": "tm_your_key_here"
      }
    }
  }
}
```

### 3. Run from source (development)

```bash
git clone https://github.com/pdxlab/trustmodel-mcp-server.git
cd trustmodel-mcp-server
npm install
npm run build
TRUSTMODEL_API_KEY=tm_your_key npm start
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TRUSTMODEL_API_KEY` | Yes | — | Your TrustModel API key |
| `TRUSTMODEL_BASE_URL` | No | `https://api.trustmodel.ai` | API base URL (override for self-hosted) |

## Tools

### `trustmodel_evaluate`

Evaluate AI output for trust and safety. Sends a prompt/response pair to TrustModel and returns trust dimension scores, flags, and recommendations.

**Inputs:**
- `prompt` (string, required) — The prompt sent to the AI model
- `response` (string, required) — The AI model's response to evaluate
- `dimension` (string, optional) — Specific trust dimension (e.g. `fairness`, `toxicity`, `hallucination`)
- `context` (object, optional) — Additional metadata
- `guardrail_set_id` (string, optional) — Guardrail set to apply

### `trustmodel_evaluate_cots`

Evaluate a COTS (Commercial Off-The-Shelf) HR AI decision for bias. Sends hiring/screening data from systems like Workday, Eightfold, or HireVue to TrustModel for fairness and compliance analysis.

**Inputs:**
- `connection_id` (string, required) — Your COTS integration ID
- `data` (object, required) — Decision data (candidate info, scores, recommendation)
- `categories` (array of strings, optional) — Evaluation categories (e.g. `adverse_impact`, `proxy_discrimination`)
- `guardrail_set_id` (string, optional) — Guardrail set to apply

### `trustmodel_guardrails_check`

Check data against a TrustModel guardrail rule set. Returns pass/fail status and details for each rule.

**Inputs:**
- `guardrail_set_id` (string, required) — The guardrail set ID
- `evaluation_data` (object, required) — Data to check against the rules

### `trustmodel_score`

Get the current trust score for a previous evaluation or a COTS connection.

**Inputs:**
- `evaluation_id` (string, optional) — ID from a previous `trustmodel_evaluate` call
- `connection_id` (string, optional) — COTS connection ID

*Provide one of `evaluation_id` or `connection_id`.*

### `trustmodel_credits`

Check remaining TrustModel API credit balance. Takes no inputs.

## License

MIT
