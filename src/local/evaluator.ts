/**
 * LocalEvaluator — score AI output locally across the 10 dimensions and roll it
 * into a 0–100 TrustScore. Ported from the Python package (trustmodel/eval.py).
 * No API key, no network. Local scores are uncalibrated (calibrated=false).
 */

import {
  BY_KEY,
  DIMENSION_KEYS,
  WEIGHTS,
  grade,
} from "./dimensions.js";
import { DimensionScore, Judge, getDefaultJudge } from "./judge.js";

export interface Violation {
  dimension: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

export interface TrustResult {
  trust_score: number; // 0–100
  grade: string;
  calibrated: boolean;
  judge: string;
  dimensions: Record<string, number>; // key -> 0–1
  scores: DimensionScore[];
  violations: Violation[];
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function severity(value: number): "high" | "medium" | "low" {
  return value < 0.4 ? "high" : value < 0.65 ? "medium" : "low";
}

export class LocalEvaluator {
  private judge: Judge;

  constructor(judge?: Judge) {
    this.judge = judge ?? getDefaultJudge();
  }

  evaluate(output: string, context?: string, dimensions?: readonly string[]): TrustResult {
    const keys = dimensions && dimensions.length ? dimensions : DIMENSION_KEYS;
    const scores: DimensionScore[] = keys.map((key) =>
      this.judge.score(output, BY_KEY[key], context),
    );

    const dimMap: Record<string, number> = {};
    for (const s of scores) dimMap[s.key] = s.value;

    const wsum = scores.reduce((acc, s) => acc + WEIGHTS[s.key], 0);
    const weighted = wsum
      ? scores.reduce((acc, s) => acc + s.value * WEIGHTS[s.key], 0) / wsum
      : 0;
    const trust = Math.round(weighted * 100 * 10) / 10;

    const violations: Violation[] = scores
      .filter((s) => s.value < 0.65 && s.rationale)
      .map((s) => ({
        dimension: s.key,
        detail: s.rationale || `low ${s.key} score`,
        severity: severity(s.value),
      }));
    violations.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    const round3 = (v: number) => Math.round(v * 1000) / 1000;
    const dimensionsRounded: Record<string, number> = {};
    for (const [k, v] of Object.entries(dimMap)) dimensionsRounded[k] = round3(v);

    return {
      trust_score: Math.round(trust * 10) / 10,
      grade: grade(trust),
      calibrated: false,
      judge: this.judge.fingerprint(),
      dimensions: dimensionsRounded,
      scores,
      violations,
    };
  }
}
