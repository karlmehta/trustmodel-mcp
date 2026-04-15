#!/usr/bin/env node

/**
 * TrustModel MCP Server
 *
 * A Model Context Protocol server that exposes TrustModel trust-evaluation
 * capabilities to any MCP-compatible AI agent (Claude Code, Cursor, Windsurf,
 * Workday agents, Eightfold AI Interviewer, etc.).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  evaluateToolName,
  evaluateToolDescription,
  evaluateToolSchema,
  handleEvaluate,
} from "./tools/evaluate.js";

import {
  evaluateCotsToolName,
  evaluateCotsToolDescription,
  evaluateCotsToolSchema,
  handleEvaluateCots,
} from "./tools/evaluate-cots.js";

import {
  guardrailsToolName,
  guardrailsToolDescription,
  guardrailsToolSchema,
  handleGuardrails,
} from "./tools/guardrails.js";

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
  evaluateAgentToolName,
  evaluateAgentToolDescription,
  evaluateAgentToolSchema,
  handleEvaluateAgent,
} from "./tools/evaluate-agent.js";

import {
  evaluateMCPServerToolName,
  evaluateMCPServerToolDescription,
  evaluateMCPServerToolSchema,
  handleEvaluateMCPServer,
} from "./tools/evaluate-mcp-server.js";

import {
  agentScoreToolName,
  agentScoreToolDescription,
  agentScoreToolSchema,
  handleAgentScore,
} from "./tools/agent-score.js";

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

// Tool 2 — trustmodel_evaluate_cots
server.tool(
  evaluateCotsToolName,
  evaluateCotsToolDescription,
  evaluateCotsToolSchema,
  async (args) => {
    try {
      const result = await handleEvaluateCots(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// Tool 3 — trustmodel_guardrails_check
server.tool(
  guardrailsToolName,
  guardrailsToolDescription,
  guardrailsToolSchema,
  async (args) => {
    try {
      const result = await handleGuardrails(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// Tool 4 — trustmodel_score
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

// Tool 5 — trustmodel_credits
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

// Tool 6 — trustmodel_evaluate_agent
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

// Tool 7 — trustmodel_evaluate_mcp_server
server.tool(
  evaluateMCPServerToolName,
  evaluateMCPServerToolDescription,
  evaluateMCPServerToolSchema,
  async (args) => {
    try {
      const result = await handleEvaluateMCPServer(args);
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: formatError(err) }],
        isError: true,
      };
    }
  }
);

// Tool 8 — trustmodel_agent_score
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

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TrustModel MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting TrustModel MCP Server:", err);
  process.exit(1);
});
