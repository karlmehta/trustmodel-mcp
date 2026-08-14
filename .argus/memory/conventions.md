# Repo conventions — trustmodel-mcp (TypeScript MCP server)

- ESM only (`"type": "module"`), `tsc` build, Node >= 22.12, strict TS.
- Native `fetch` / `node-fetch`; `zod` for schemas. No axios.
- The hosted HTTP server (`src/http-server.ts`) is MULTI-TENANT: the caller's API key
  MUST come per-request (Authorization: Bearer) threaded via AsyncLocalStorage
  (`src/auth-context.ts`) — NEVER a shared/global key (cross-tenant leak). Flag any code
  that reads `process.env.TRUSTMODEL_API_KEY` on the request path.
- Tools must stay stateless per call; session state keyed by Mcp-Session-Id only.
