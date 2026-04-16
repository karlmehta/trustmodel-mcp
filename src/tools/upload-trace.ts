import { z } from "zod";
import { postAgenticUploadUrl, putToSignedUrl } from "../client.js";

export const uploadTraceToolName = "trustmodel_upload_trace";

export const uploadTraceToolDescription =
  "Upload an agent execution trace to TrustModel cloud storage in preparation for evaluation. " +
  "Returns a file_path token that must be passed to trustmodel_evaluate_agent. " +
  "The trace must be a JSON object (max 50 MB once serialized).";

export const uploadTraceToolSchema = {
  trace: z
    .record(z.unknown())
    .describe(
      "Agent execution trace as a JSON object (e.g. { agent_name, user_query, steps: [...], final_response, ... }). " +
        "The full object is serialized as JSON and uploaded."
    ),
};

export async function handleUploadTrace(args: {
  trace: Record<string, unknown>;
}): Promise<{ file_path: string; expires_in: number }> {
  const body = JSON.stringify(args.trace);
  const file_size = Buffer.byteLength(body, "utf8");

  const { signed_url, file_path, expires_in } = await postAgenticUploadUrl({
    file_type: "json",
    file_size,
  });

  await putToSignedUrl(signed_url, body, "application/json");

  return { file_path, expires_in };
}
