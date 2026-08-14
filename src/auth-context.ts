/** Per-request auth context for the hosted HTTP server (TRUS-1713).
 *
 * The stdio server uses a single env `TRUSTMODEL_API_KEY`. The hosted, multi-tenant
 * HTTP server must NOT — each request carries its own `Authorization: Bearer tm-…`, and
 * that key must reach the tool/client layer WITHOUT a shared global (which would
 * cross-tenant-leak under concurrency). We thread it via AsyncLocalStorage: the HTTP
 * handler wraps `transport.handleRequest` in `authContext.run({ apiKey }, …)`, and
 * `client.ts getApiKey()` reads it here (falling back to env for the stdio path). */

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestAuth {
  apiKey?: string;
}

export const authContext = new AsyncLocalStorage<RequestAuth>();

/** API key for the current request: per-request (hosted) → env (stdio/local). */
export function getRequestApiKey(): string | undefined {
  return authContext.getStore()?.apiKey ?? process.env.TRUSTMODEL_API_KEY;
}
