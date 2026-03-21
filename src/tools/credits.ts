import { getCredits } from "../client.js";

export const creditsToolName = "trustmodel_credits";

export const creditsToolDescription =
  "Check remaining TrustModel API credit balance for the authenticated account.";

export const creditsToolSchema = {};

export async function handleCredits(): Promise<unknown> {
  return getCredits();
}
