import { z } from "zod";
import { getShadowAIScan } from "../client.js";

export const shadowaiResultsToolName = "trustmodel_shadowai_results";

export const shadowaiResultsToolDescription =
  "Get status, scan filter, total event count, and discoveries-by-system-" +
  "type / by-source aggregates for a Shadow AI scan previously created via " +
  "trustmodel_shadowai_scan. Returns partial counters while RUNNING and the " +
  "full summary when COMPLETED. Use trustmodel_shadowai_events for the " +
  "individual discoveries.";

export const shadowaiResultsToolSchema = {
  scan_id: z
    .union([z.number().int().positive(), z.string().min(1)])
    .describe("Scan ID returned by trustmodel_shadowai_scan."),
};

export async function handleShadowaiResults(args: {
  scan_id: number | string;
}): Promise<unknown> {
  return getShadowAIScan(args.scan_id);
}
