#!/usr/bin/env node
/** Hosted, multi-tenant TrustModel MCP endpoint over streamable-HTTP (TRUS-1712/1713).
 *
 * Fronts the SAME tools as the stdio server, but authenticates PER REQUEST: each caller
 * sends `Authorization: Bearer tm-…` (or `X-API-Key`), which is threaded to the tool/client
 * layer via AsyncLocalStorage — never a shared global (which would cross-tenant-leak under
 * concurrency). Local no-key tools still work without a key.
 *
 * Endpoints (MCP streamable-HTTP): POST /mcp (JSON-RPC), GET /mcp (SSE stream),
 * DELETE /mcp (end session). Health at GET /healthz. Session via `Mcp-Session-Id`.
 *
 * Dependency-free (Node `http` + the MCP SDK). Run: `node dist/http-server.js` (PORT env). */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildMcpServer } from "./index.js";
import { authContext } from "./auth-context.js";
import { startEvictionTimer } from "./trace-store.js";

const PORT = Number(process.env.PORT ?? 8080);
const MAX_BODY = 6 * 1024 * 1024; // 6 MB
// Comma-separated allowlist for browser Origins (DNS-rebinding protection). Empty =
// allow any (non-browser MCP clients send no Origin and are always allowed).
const ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
// Allowed Host header values (e.g. "mcp.trustmodel.ai") for SDK DNS-rebinding protection.
const ALLOWED_HOSTS = (process.env.MCP_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

// One transport per live session (Mcp-Session-Id → transport).
const transports = new Map<string, StreamableHTTPServerTransport>();

function apiKeyFrom(req: IncomingMessage): string | undefined {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || undefined;
  }
  const x = req.headers["x-api-key"];
  return typeof x === "string" && x ? x : undefined;
}

function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser MCP client
  if (ALLOWED_ORIGINS.length === 0) return true; // not configured
  return ALLOWED_ORIGINS.includes(String(origin));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/** Create a fresh MCP server + transport for a new session. */
async function newSession(): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    // Belt-and-suspenders to the Origin check above: the SDK's own Host/Origin
    // validation, enabled when the deploy configures its allowlists.
    ...(ALLOWED_HOSTS.length || ALLOWED_ORIGINS.length
      ? {
          enableDnsRebindingProtection: true,
          allowedHosts: ALLOWED_HOSTS,
          allowedOrigins: ALLOWED_ORIGINS,
        }
      : {}),
    onsessioninitialized: (sid: string) => {
      transports.set(sid, transport);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };
  const server = buildMcpServer();
  await server.connect(transport);
  return transport;
}

const httpServer = createServer(async (req, res) => {
  try {
    const url = (req.url ?? "").split("?")[0];

    if (req.method === "GET" && url === "/healthz") {
      return sendJson(res, 200, { ok: true, service: "trustmodel-mcp" });
    }
    if (url !== "/mcp") {
      return sendJson(res, 404, { error: "not_found" });
    }
    if (!originAllowed(req)) {
      return sendJson(res, 403, { error: "origin_not_allowed" });
    }

    const apiKey = apiKeyFrom(req);
    const rawSid = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(rawSid) ? rawSid[0] : rawSid; // dedupe header
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (req.method === "POST") {
      const body = await readBody(req);
      if (!transport) {
        if (sessionId) return sendJson(res, 404, { error: "unknown_session" });
        if (!isInitializeRequest(body)) {
          return sendJson(res, 400, { error: "expected_initialize_request" });
        }
        transport = await newSession();
      }
      // Thread the caller's key through every tool call in this request.
      return authContext.run({ apiKey }, () => transport!.handleRequest(req, res, body));
    }

    if (req.method === "GET" || req.method === "DELETE") {
      if (!transport) return sendJson(res, 404, { error: "unknown_session" });
      return authContext.run({ apiKey }, () => transport!.handleRequest(req, res));
    }

    return sendJson(res, 405, { error: "method_not_allowed" });
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 400, { error: "bad_request", detail: (err as Error)?.message });
    }
  }
});

// TTL-evict stale trace sessions (was previously only started by the stdio main()).
startEvictionTimer();

httpServer.listen(PORT, () => {
  if (ALLOWED_ORIGINS.length === 0) {
    console.error(
      "WARNING: MCP_ALLOWED_ORIGINS is unset — all browser Origins allowed. Set it for a public deploy (DNS-rebinding protection)."
    );
  }
  console.error(`TrustModel hosted MCP listening on :${PORT}  (POST/GET/DELETE /mcp)`);
});
