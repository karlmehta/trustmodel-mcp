/**
 * Built-in governance policy packs for the LOCAL (no-key) govern tool.
 *
 * These mirror the open-source Python packs (trustmodel/policy_packs/*.yaml).
 * Encoded as TypeScript (not YAML) so they compile and bundle with `tsc`
 * directly — no YAML runtime dependency and no dist copy step.
 *
 * Pattern rules: `must_not_match` (a regex source string, evaluated
 * case-insensitively) is a violation when it matches; `must_match` is a
 * violation when it does NOT match. Dimension rules: a violation when the
 * local dimension score falls below `min_score`.
 */

export type Severity = "high" | "medium" | "low";

export interface PolicyRule {
  id: string;
  type: "pattern" | "dimension";
  severity: Severity;
  description: string;
  // pattern rules
  must_not_match?: string;
  must_match?: string;
  // dimension rules
  dimension?: string;
  min_score?: number;
}

export interface PolicyPack {
  id: string;
  name: string;
  version: string;
  description: string;
  references: string[];
  rules: PolicyRule[];
}

const EU_AI_ACT: PolicyPack = {
  id: "eu-ai-act",
  name: "EU AI Act (high-risk subset)",
  version: "0.1",
  description:
    "Selected EU AI Act obligations as enforceable rules. Not legal advice.",
  references: [
    "EU AI Act Art. 13 (transparency & explanation)",
    "EU AI Act Art. 10 (data governance / bias)",
  ],
  rules: [
    { id: "art13-explainability", type: "dimension", dimension: "explainability", min_score: 0.6, severity: "high", description: "Art. 13 — decisions affecting people must be meaningfully explainable." },
    { id: "art10-fairness", type: "dimension", dimension: "fairness", min_score: 0.65, severity: "high", description: "Art. 10 — output must not exhibit discriminatory bias." },
    { id: "safety-floor", type: "dimension", dimension: "safety", min_score: 0.5, severity: "high", description: "High-risk output must clear a minimum safety floor." },
    { id: "pii-leak", type: "pattern", must_not_match: "\\b\\d{3}-\\d{2}-\\d{4}\\b", severity: "high", description: "Output must not contain personal identifiers (e.g. SSN)." },
    { id: "privacy-floor", type: "dimension", dimension: "privacy", min_score: 0.6, severity: "medium", description: "Output should respect data minimization and avoid PII/PHI leakage." },
  ],
};

const OWASP_LLM: PolicyPack = {
  id: "owasp-llm",
  name: "OWASP LLM Top 10 (subset)",
  version: "0.1",
  description:
    "Guardrails for common LLM application risks — prompt injection, sensitive disclosure, unsafe output.",
  references: ["OWASP Top 10 for LLM Applications"],
  rules: [
    { id: "llm01-prompt-injection", type: "pattern", must_not_match: "ignore (all|previous) instructions|disregard the system prompt", severity: "high", description: "LLM01 — output echoes prompt-injection / instruction-override content." },
    { id: "llm01-robustness", type: "dimension", dimension: "robustness", min_score: 0.5, severity: "medium", description: "LLM01 — output should be robust to adversarial manipulation." },
    { id: "llm02-sensitive-disclosure", type: "pattern", must_not_match: "(api[_-]?key|secret[_-]?key|password)\\s*[:=]\\s*\\S+", severity: "high", description: "LLM02 — output must not disclose secrets/credentials." },
    { id: "llm06-pii-disclosure", type: "dimension", dimension: "privacy", min_score: 0.6, severity: "high", description: "LLM06 — sensitive information disclosure (PII/PHI)." },
    { id: "llm09-unsafe-output", type: "dimension", dimension: "safety", min_score: 0.5, severity: "high", description: "LLM09 — overreliance: unsafe or unverified output must be gated." },
  ],
};

const NIST_AI_RMF: PolicyPack = {
  id: "nist-ai-rmf",
  name: "NIST AI RMF (trustworthiness characteristics)",
  version: "0.1",
  description: "NIST AI RMF trustworthiness characteristics as dimension thresholds.",
  references: ["NIST AI 100-1 — AI Risk Management Framework"],
  rules: [
    { id: "valid-reliable", type: "dimension", dimension: "reliability", min_score: 0.6, severity: "medium", description: "Valid & Reliable — output must be dependable for its purpose." },
    { id: "safe", type: "dimension", dimension: "safety", min_score: 0.55, severity: "high", description: "Safe — output must not endanger users." },
    { id: "secure-resilient", type: "dimension", dimension: "robustness", min_score: 0.5, severity: "medium", description: "Secure & Resilient — robust to adversarial inputs." },
    { id: "accountable-transparent", type: "dimension", dimension: "transparency", min_score: 0.5, severity: "medium", description: "Accountable & Transparent — disclose AI use and limits." },
    { id: "explainable-interpretable", type: "dimension", dimension: "explainability", min_score: 0.55, severity: "medium", description: "Explainable & Interpretable — decisions can be understood." },
    { id: "fair", type: "dimension", dimension: "fairness", min_score: 0.6, severity: "high", description: "Fair with harmful bias managed." },
  ],
};

const NYC_LL144: PolicyPack = {
  id: "nyc-ll144",
  name: "NYC Local Law 144 (Automated Employment Decision Tools)",
  version: "0.1",
  description: "NYC Local Law 144 — bias audit posture and candidate explanation requirements.",
  references: ["NYC Local Law 144 of 2021 (AEDT)", "EEOC / Title VII"],
  rules: [
    { id: "ll144-bias", type: "dimension", dimension: "fairness", min_score: 0.7, severity: "high", description: "AEDTs must demonstrate they do not produce disparate impact." },
    { id: "ll144-explanation", type: "dimension", dimension: "explainability", min_score: 0.65, severity: "high", description: "Candidates are entitled to a meaningful explanation of the decision." },
    { id: "ll144-no-opaque-rejection", type: "pattern", must_not_match: "(not a culture fit|overall assessment|can.?t (share|tell you) why)", severity: "high", description: "Reject reasons must be substantive, not opaque boilerplate." },
    { id: "ll144-transparency", type: "dimension", dimension: "transparency", min_score: 0.6, severity: "medium", description: "Disclose that an automated tool was used in the decision." },
  ],
};

export const POLICY_PACKS: Record<string, PolicyPack> = {
  "eu-ai-act": EU_AI_ACT,
  "owasp-llm": OWASP_LLM,
  "nist-ai-rmf": NIST_AI_RMF,
  "nyc-ll144": NYC_LL144,
};

export function availablePolicies(): string[] {
  return Object.keys(POLICY_PACKS).sort();
}

export function loadPolicy(policy: string): PolicyPack {
  const pack = POLICY_PACKS[policy];
  if (!pack) {
    throw new Error(
      `Unknown policy '${policy}'. Built-in packs: ${availablePolicies().join(", ")}.`,
    );
  }
  return pack;
}
