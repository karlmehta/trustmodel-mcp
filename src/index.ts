#!/usr/bin/env node

/**
 * TrustModel MCP Server
 *
 * A Model Context Protocol server that exposes TrustModel trust-evaluation
 * capabilities to any MCP-compatible AI agent (Claude Code, Cursor, Windsurf,
 * Workday agents, Eightfold AI Interviewer, etc.).
 *
 * Active tools (9):
 *   1. trustmodel_evaluate         — POST /sdk/v1/evaluate/
 *   2. trustmodel_score            — GET  /sdk/v1/evaluations/{int}/
 *   3. trustmodel_credits          — GET  /sdk/v1/credits/
 *   4. trustmodel_upload_trace     — POST /sdk/v1/agentic/upload-url/ + PUT signed URL (one-shot)
 *   5. trustmodel_evaluate_agent   — POST /sdk/v1/agentic/evaluate/
 *   6. trustmodel_score_agent      — GET  /sdk/v1/agentic/evaluations/{int}/
 *   7. trustmodel_trace_start      — open a streaming trace session (local state)
 *   8. trustmodel_trace_step       — append a step to an active trace
 *   9. trustmodel_trace_finalize   — serialize + upload + auto-create evaluation run
 *
 * Inactive (kept in src/ but not registered — backend endpoints missing):
 *   - trustmodel_evaluate_cots
 *   - trustmodel_guardrails_check
 *   - trustmodel_evaluate_mcp_server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  evaluateToolName,
  evaluateToolDescription,
  evaluateToolSchema,
  handleEvaluate,
} from "./tools/evaluate.js";

import {
  scoreToolName,
  scoreToolDescription,
  scoreToolSchema,
  handleScore,
} from "./tools/score.js";

import {
  creditsToolName,
  creditsToolDescription,
  creditsToolSchema,
  handleCredits,
} from "./tools/credits.js";

import {
  uploadTraceToolName,
  uploadTraceToolDescription,
  uploadTraceToolSchema,
  handleUploadTrace,
} from "./tools/upload-trace.js";

import {
  evaluateAgentToolName,
  evaluateAgentToolDescription,
  evaluateAgentToolSchema,
  handleEvaluateAgent,
} from "./tools/evaluate-agent.js";

import {
  agentScoreToolName,
  agentScoreToolDescription,
  agentScoreToolSchema,
  handleAgentScore,
} from "./tools/agent-score.js";

import {
  traceStartToolName,
  traceStartToolDescription,
  traceStartToolSchema,
  handleTraceStart,
} from "./tools/trace-start.js";

import {
  traceStepToolName,
  traceStepToolDescription,
  traceStepToolSchema,
  handleTraceStep,
} from "./tools/trace-step.js";

import {
  traceFinalizeToolName,
  traceFinalizeToolDescription,
  traceFinalizeToolSchema,
  handleTraceFinalize,
} from "./tools/trace-finalize.js";

import { startEvictionTimer } from "./trace-store.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return JSON.stringify(err, null, 2);
  }
  return String(err);
}

// ── Server setup ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "trustmodel",
  version: "0.1.0",
});

// Tool 1 — trustmodel_evaluate
server.tool(
  evaluateToolName,
  evaluateToolDescription,
  evaluateToolSchema,
  async (args) => {
    try {
      const result = await handleEvaluate(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// Tool 2 — trustmodel_score
server.tool(
  scoreToolName,
  scoreToolDescription,
  scoreToolSchema,
  async (args) => {
    try {
      const result = await handleScore(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// Tool 3 — trustmodel_credits
server.tool(
  creditsToolName,
  creditsToolDescription,
  creditsToolSchema,
  async () => {
    try {
      const result = await handleCredits();
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// Tool 4 — trustmodel_upload_trace (NEW)
server.tool(
  uploadTraceToolName,
  uploadTraceToolDescription,
  uploadTraceToolSchema,
  async (args) => {
    try {
      const result = await handleUploadTrace(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// Tool 5 — trustmodel_evaluate_agent
server.tool(
  evaluateAgentToolName,
  evaluateAgentToolDescription,
  evaluateAgentToolSchema,
  async (args) => {
    try {
      const result = await handleEvaluateAgent(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// Tool 6 — trustmodel_score_agent (renamed from trustmodel_agent_score)
server.tool(
  agentScoreToolName,
  agentScoreToolDescription,
  agentScoreToolSchema,
  async (args) => {
    try {
      const result = await handleAgentScore(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// Tool 7 — trustmodel_trace_start (NEW)
server.tool(
  traceStartToolName,
  traceStartToolDescription,
  traceStartToolSchema,
  async (args) => {
    try {
      const result = await handleTraceStart(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// Tool 8 — trustmodel_trace_step (NEW)
server.tool(
  traceStepToolName,
  traceStepToolDescription,
  traceStepToolSchema,
  async (args) => {
    try {
      const result = await handleTraceStep(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// Tool 9 — trustmodel_trace_finalize (NEW)
server.tool(
  traceFinalizeToolName,
  traceFinalizeToolDescription,
  traceFinalizeToolSchema,
  async (args) => {
    try {
      const result = await handleTraceFinalize(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  startEvictionTimer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TrustModel MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting TrustModel MCP Server:", err);
  process.exit(1);
});
