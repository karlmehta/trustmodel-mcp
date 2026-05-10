import { z } from "zod";
import { postShadowAIScan } from "../client.js";

export const shadowaiScanToolName = "trustmodel_shadowai_scan";

export const shadowaiScanToolDescription =
  "Kick off a Shadow AI Discovery scan against one or more GitHub orgs/" +
  "repos and (optionally) GCP projects. Detects unregistered AI systems " +
  "by sniffing GitHub source for LLM SDK usage (15 libraries: openai, " +
  "anthropic, langchain, llamaindex, etc.) and listing Vertex AI endpoints, " +
  "Cloud Run services with AI env vars, and BigQuery ML models. Returns " +
  "the scan ID for status polling. Use trustmodel_shadowai_results to track " +
  "progress and trustmodel_shadowai_events to page through discoveries. " +
  "github_token is required when scanning GitHub.";

export const shadowaiScanToolSchema = {
  github_orgs: z
    .array(z.string().min(1))
    .optional()
    .describe("GitHub organization slugs to scan (e.g. ['pdxlab'])."),
  github_repos: z
    .array(z.string().regex(/^[^/]+\/[^/]+$/, "expected 'owner/name'"))
    .optional()
    .describe("Specific repos to scan, in 'owner/name' form."),
  gcp_projects: z
    .array(z.string().min(1))
    .optional()
    .describe("GCP project IDs to scan via Vertex AI / Cloud Run / BigQuery ML."),
  github_token: z
    .string()
    .optional()
    .describe(
      "GitHub PAT (classic, with 'repo' scope) for the Code Search API. Required when github_orgs or github_repos is set."
    ),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Free-form metadata attached to the scan."),
};

export async function handleShadowaiScan(args: {
  github_orgs?: readonly string[];
  github_repos?: readonly string[];
  gcp_projects?: readonly string[];
  github_token?: string;
  metadata?: Record<string, unknown>;
}): Promise<unknown> {
  const scan_filter: Record<string, readonly string[]> = {};
  if (args.github_orgs?.length) scan_filter.github_orgs = args.github_orgs;
  if (args.github_repos?.length) scan_filter.github_repos = args.github_repos;
  if (args.gcp_projects?.length) scan_filter.gcp_projects = args.gcp_projects;

  return postShadowAIScan({
    scan_filter,
    github_token: args.github_token,
    metadata: args.metadata,
  });
}
