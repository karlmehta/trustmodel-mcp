/**
 * Local Guardrail — evaluate output against a policy pack and decide allow/block.
 * Ported from the Python package (trustmodel/govern.py). No API key, no network.
 */

import { LocalEvaluator } from "./evaluator.js";
import {
  PolicyPack,
  PolicyRule,
  Severity,
  loadPolicy,
} from "../policy_packs/index.js";

export interface RuleViolation {
  rule_id: string;
  description: string;
  severity: Severity;
  kind: "pattern" | "dimension";
}

export interface GuardrailVerdict {
  allowed: boolean;
  blocked: boolean;
  policy: string;
  violations: RuleViolation[];
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export class Guardrail {
  private pack: PolicyPack;
  private rules: PolicyRule[];
  private blockSeverity: Severity;
  private needsEval: boolean;
  private evaluator: LocalEvaluator;

  constructor(policy = "eu-ai-act", blockSeverity: Severity = "high", evaluator?: LocalEvaluator) {
    this.pack = loadPolicy(policy);
    this.rules = this.pack.rules;
    this.blockSeverity = blockSeverity;
    this.needsEval = this.rules.some((r) => r.type === "dimension");
    this.evaluator = evaluator ?? new LocalEvaluator();
  }

  check(output: string, context?: string): GuardrailVerdict {
    const violations: RuleViolation[] = [];

    // Run the eval engine once only if a dimension rule needs it.
    let dimScores: Record<string, number> = {};
    if (this.needsEval) {
      dimScores = this.evaluator.evaluate(output, context).dimensions;
    }

    for (const rule of this.rules) {
      const rid = rule.id ?? "rule";
      const sev = rule.severity ?? "medium";
      const desc = rule.description ?? rid;

      if (rule.type === "pattern") {
        // "should_not" semantics: a match is a violation (score inversion).
        if (rule.must_not_match && new RegExp(rule.must_not_match, "i").test(output || "")) {
          violations.push({ rule_id: rid, description: desc, severity: sev, kind: "pattern" });
        }
        if (rule.must_match && !new RegExp(rule.must_match, "i").test(output || "")) {
          violations.push({ rule_id: rid, description: desc, severity: sev, kind: "pattern" });
        }
      } else if (rule.type === "dimension" && rule.dimension) {
        const minScore = rule.min_score ?? 0.65;
        if ((dimScores[rule.dimension] ?? 1.0) < minScore) {
          violations.push({ rule_id: rid, description: desc, severity: sev, kind: "dimension" });
        }
      }
    }

    violations.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    const threshold = SEVERITY_ORDER[this.blockSeverity];
    const allowed = !violations.some((v) => SEVERITY_ORDER[v.severity] <= threshold);
    return { allowed, blocked: !allowed, policy: this.pack.id, violations };
  }
}
