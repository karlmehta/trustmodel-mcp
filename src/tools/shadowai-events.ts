import { z } from "zod";
import { listShadowAIEvents } from "../client.js";

export const shadowaiEventsToolName = "trustmodel_shadowai_events";

export const shadowaiEventsToolDescription =
  "Page through individual discovery events for a Shadow AI scan. Each " +
  "event represents one discovered AI system with system_type, " +
  "discovered_via, evidence (file/repo/line for GitHub; project/resource " +
  "for GCP), and a stable system_id fingerprint. Filter by system_type " +
  "(LLM_SDK_USAGE, VERTEX_ENDPOINT, CLOUD_RUN_AI_SERVICE, BIGQUERY_ML, …) " +
  "or by source (github, gcp_vertex, gcp_cloud_run, gcp_bigquery).";

export const shadowaiEventsToolSchema = {
  scan_id: z
    .union([z.number().int().positive(), z.string().min(1)])
    .describe("Scan ID returned by trustmodel_shadowai_scan."),
  system_type: z
    .string()
    .optional()
    .describe("Limit to one system_type."),
  source: z
    .string()
    .optional()
    .describe("Limit to one discovered_via source."),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-indexed page number (default 1)."),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Events per page (default 50, max 500)."),
};

export async function handleShadowaiEvents(args: {
  scan_id: number | string;
  system_type?: string;
  source?: string;
  page?: number;
  page_size?: number;
}): Promise<unknown> {
  return listShadowAIEvents(args.scan_id, {
    system_type: args.system_type,
    source: args.source,
    page: args.page,
    page_size: args.page_size,
  });
}
