/**
 * Disk-backed trace session store.
 *
 * Each active trace session is persisted as an append-only JSONL file under
 *   $TRUSTMODEL_TRACE_DIR/<trace_id>.jsonl
 *
 * Disk is the source of truth; the in-memory Map is a hot cache that rehydrates
 * from disk on cache miss (so sessions survive MCP server restarts).
 *
 *   line 1  : { "type": "meta",  ...start metadata... }
 *   line 2+ : { "type": "step",  ...step fields...    }
 *
 * Successful `finalizeAndRemove` deletes the file outright — the trace has
 * been uploaded to cloud storage and the local copy is redundant.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export type StepType =
  | "thought"
  | "think"
  | "tool_call"
  | "tool_result"
  | "observation"
  | "decision"
  | "error"
  | "human_input"
  | "response"
  | "final_answer";

export interface TraceMeta {
  trace_id: string;
  goal: string;
  name: string;
  agent_framework: string;
  agent_model?: string;
  user_query?: string;
  expected_outcome?: string;
  metadata?: Record<string, unknown>;
  started_at: string; // ISO 8601
}

export interface TraceStep {
  step_number: number;
  step_type: StepType;
  content: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: string | Record<string, unknown>;
  tool_call_success?: boolean;
  model_used?: string;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  timestamp?: string; // ISO 8601
}

export interface TraceSession {
  meta: TraceMeta;
  steps: TraceStep[];
}

// ── Config ─────────────────────────────────────────────────────────────────

const DEFAULT_DIR = path.join(os.homedir(), ".trustmodel-mcp", "traces");
const TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_SESSIONS = 100;

export function getTraceDir(): string {
  return process.env.TRUSTMODEL_TRACE_DIR || DEFAULT_DIR;
}

function sessionPath(traceId: string): string {
  return path.join(getTraceDir(), `${traceId}.jsonl`);
}

function ensureDir(): void {
  fs.mkdirSync(getTraceDir(), { recursive: true });
}

function nowIso(): string {
  return new Date().toISOString();
}

function newTraceId(): string {
  return `trace-${crypto.randomBytes(6).toString("hex")}`;
}

// ── Cache ──────────────────────────────────────────────────────────────────

const cache = new Map<string, TraceSession>();

// ── File load / rehydrate ──────────────────────────────────────────────────

/**
 * Parse a JSONL file into a TraceSession. Returns null if the file is missing,
 * empty, or malformed. On malformed input we delete the file and emit a stderr
 * warning, as documented in the plan.
 */
function loadSessionFromDisk(traceId: string): TraceSession | null {
  const p = sessionPath(traceId);
  if (!fs.existsSync(p)) return null;

  let raw: string;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch (err) {
    console.error(`[trace-store] failed to read ${p}: ${err}`);
    return null;
  }

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  let meta: TraceMeta | null = null;
  const steps: TraceStep[] = [];

  for (const [i, line] of lines.entries()) {
    let obj: { type?: string; [k: string]: unknown };
    try {
      obj = JSON.parse(line);
    } catch {
      console.error(
        `[trace-store] malformed JSONL in ${p} line ${i + 1}; discarding file`
      );
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
      return null;
    }

    if (obj.type === "meta") {
      const { type: _t, ...rest } = obj;
      meta = rest as unknown as TraceMeta;
    } else if (obj.type === "step") {
      const { type: _t, ...rest } = obj;
      steps.push(rest as unknown as TraceStep);
    }
    // ignore unknown types for forward-compat
  }

  if (!meta) {
    console.error(`[trace-store] no meta line in ${p}; discarding`);
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    return null;
  }

  return { meta, steps };
}

// ── Public API ─────────────────────────────────────────────────────────────

export function createSession(input: {
  goal: string;
  name: string;
  agent_framework: string;
  agent_model?: string;
  user_query?: string;
  expected_outcome?: string;
  metadata?: Record<string, unknown>;
}): TraceSession {
  ensureDir();

  // Enforce concurrency cap — count files currently on disk.
  const files = fs
    .readdirSync(getTraceDir())
    .filter((f) => f.endsWith(".jsonl"));
  if (files.length >= MAX_SESSIONS) {
    throw new Error(
      `Max ${MAX_SESSIONS} concurrent traces reached. Finalize or wait for TTL eviction.`
    );
  }

  const meta: TraceMeta = {
    trace_id: newTraceId(),
    goal: input.goal,
    name: input.name,
    agent_framework: input.agent_framework,
    agent_model: input.agent_model,
    user_query: input.user_query,
    expected_outcome: input.expected_outcome,
    metadata: input.metadata,
    started_at: nowIso(),
  };

  const session: TraceSession = { meta, steps: [] };

  // Write-through: disk first, then cache.
  const line = JSON.stringify({ type: "meta", ...meta }) + "\n";
  fs.writeFileSync(sessionPath(meta.trace_id), line, { flag: "wx" });

  cache.set(meta.trace_id, session);
  return session;
}

export function getSession(traceId: string): TraceSession | null {
  const cached = cache.get(traceId);
  if (cached) return cached;

  const loaded = loadSessionFromDisk(traceId);
  if (loaded) {
    cache.set(traceId, loaded);
    return loaded;
  }
  return null;
}

export function appendStep(
  traceId: string,
  step: Omit<TraceStep, "step_number"> & { step_number?: number }
): TraceStep {
  const session = getSession(traceId);
  if (!session) {
    throw new Error(
      "Unknown trace_id: did you call trustmodel_trace_start first? (It may have timed out after 30 min inactivity, or the JSONL file was deleted.)"
    );
  }

  const stepNumber = session.steps.length + 1;
  const finalStep: TraceStep = {
    step_number: stepNumber,
    step_type: step.step_type,
    content: step.content,
    ...(step.tool_name !== undefined && { tool_name: step.tool_name }),
    ...(step.tool_args !== undefined && { tool_args: step.tool_args }),
    ...(step.tool_result !== undefined && { tool_result: step.tool_result }),
    ...(step.tool_call_success !== undefined && {
      tool_call_success: step.tool_call_success,
    }),
    ...(step.model_used !== undefined && { model_used: step.model_used }),
    ...(step.input_tokens !== undefined && { input_tokens: step.input_tokens }),
    ...(step.output_tokens !== undefined && {
      output_tokens: step.output_tokens,
    }),
    ...(step.duration_ms !== undefined && { duration_ms: step.duration_ms }),
    timestamp: step.timestamp ?? nowIso(),
  };

  // Write-through: append to disk first.
  const line = JSON.stringify({ type: "step", ...finalStep }) + "\n";
  fs.appendFileSync(sessionPath(traceId), line);

  session.steps.push(finalStep);
  return finalStep;
}

/**
 * Remove the session from both disk and cache. Called after a successful
 * upload+evaluate, or after an upload-succeeded-but-evaluate-failed result
 * (the trace is safely in cloud storage at that point).
 */
export function removeSession(traceId: string): void {
  cache.delete(traceId);
  try {
    fs.unlinkSync(sessionPath(traceId));
  } catch (err: unknown) {
    // ENOENT is fine (already gone); anything else is logged but not fatal.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.error(`[trace-store] failed to unlink ${traceId}: ${err}`);
    }
  }
}

// ── Eviction ───────────────────────────────────────────────────────────────

export function evictStale(now: number = Date.now()): number {
  let evicted = 0;
  let files: string[];
  try {
    files = fs.readdirSync(getTraceDir());
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    console.error(`[trace-store] evictStale readdir failed: ${err}`);
    return 0;
  }

  for (const f of files) {
    if (!f.endsWith(".jsonl")) continue;
    const p = path.join(getTraceDir(), f);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(p);
    } catch {
      continue;
    }
    if (now - stat.mtimeMs > TTL_MS) {
      try {
        fs.unlinkSync(p);
        const traceId = f.replace(/\.jsonl$/, "");
        cache.delete(traceId);
        evicted++;
      } catch (err) {
        console.error(`[trace-store] failed to evict ${p}: ${err}`);
      }
    }
  }
  return evicted;
}

let evictionTimer: NodeJS.Timeout | null = null;

export function startEvictionTimer(intervalMs = 60_000): void {
  if (evictionTimer) return; // idempotent
  evictionTimer = setInterval(() => {
    try {
      evictStale();
    } catch (err) {
      console.error(`[trace-store] eviction tick failed: ${err}`);
    }
  }, intervalMs);
  evictionTimer.unref();
}
