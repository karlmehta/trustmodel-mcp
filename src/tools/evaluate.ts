import { z } from "zod";
import { postEvaluate } from "../client.js";

export const evaluateToolName = "trustmodel_evaluate";

export const evaluateToolDescription =
  "Create an evaluation run against an AI model on the TrustModel platform. " +
  "The backend runs a batch evaluation (safety, bias, accuracy, hallucination, reasoning, etc.) and returns an evaluation_run_id. " +
  "Poll the status or fetch the full result later with trustmodel_score. " +
  "By default the platform's API key is used; pass your own api_key for BYOK evaluation of public models.";

export const evaluateToolSchema = {
  model_identifier: z
    .string()
    .describe(
      "Model identifier (e.g. 'gpt-4o', 'claude-sonnet-4-5', 'gemini-2.5-pro'). Discover valid values via GET /sdk/v1/models/."
    ),
  vendor_identifier: z
    .string()
    .describe(
      "Vendor identifier (e.g. 'openai', 'anthropic', 'google'). Required. Discover valid values via GET /sdk/v1/config/."
    ),
  api_key: z
    .string()
    .optional()
    .describe(
      "Optional vendor API key for BYOK (bring-your-own-key) evaluation. Omit to use TrustModel's platform key. Do NOT pass a TrustModel API key here — that goes in the TRUSTMODEL_API_KEY env var."
    ),
  categories: z
    .array(z.string())
    .optional()
    .describe(
      "List of category names to evaluate, e.g. ['Safety', 'Accuracy', 'Bias']. Only honored when evaluation_type is 'Custom' or 'Score Only'; defaults to all enabled categories."
    ),
  evaluation_type: z
    .string()
    .optional()
    .describe(
      "Evaluation type. One of: 'Custom' (default), 'Score Only', 'Comprehensive', 'Limited', 'Quick Scan'. Only 'Custom' and 'Score Only' respect the 'categories' parameter."
    ),
  model_config_name: z
    .string()
    .optional()
    .describe("Optional display name for this run; auto-generated if omitted."),
  application_type: z
    .string()
    .optional()
    .describe(
      "Type of application being evaluated. One of: 'chatbot', 'knowledge-agent', 'creation-tool', 'document-repository', 'analysis-tool', 'automation-agent', 'generic' (default)."
    ),
  user_personas: z
    .array(z.string())
    .optional()
    .describe(
      "User personas for the evaluation. Any of: 'external-customer' (default), 'internal-employee', 'technical-user', 'domain-expert', 'vulnerable-groups', 'generic'."
    ),
  application_description: z
    .string()
    .optional()
    .describe("Free-text description of the application (most relevant when application_type is 'generic')."),
  domain_expert_description: z
    .string()
    .optional()
    .describe(
      "Only used when user_personas includes 'domain-expert'. One of: 'cross-domain' (default), 'medical', 'commercial_banking'."
    ),
  template_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Optional UUID of an existing evaluation run template to reuse. Discover via GET /sdk/v1/evaluation-run-templates/."
    ),
  template_name: z
    .string()
    .optional()
    .describe("Optional new name for the template (only used when template_id is provided)."),
};

export async function handleEvaluate(args: {
  model_identifier: string;
  vendor_identifier: string;
  api_key?: string;
  categories?: string[];
  evaluation_type?: string;
  model_config_name?: string;
  application_type?: string;
  user_personas?: string[];
  application_description?: string;
  domain_expert_description?: string;
  template_id?: string;
  template_name?: string;
}): Promise<unknown> {
  return postEvaluate({
    model_identifier: args.model_identifier,
    vendor_identifier: args.vendor_identifier,
    api_key: args.api_key,
    categories: args.categories,
    evaluation_type: args.evaluation_type,
    model_config_name: args.model_config_name,
    application_type: args.application_type,
    user_personas: args.user_personas,
    application_description: args.application_description,
    domain_expert_description: args.domain_expert_description,
    template_id: args.template_id,
    template_name: args.template_name,
    trigger_source: "mcp",
  });
}
