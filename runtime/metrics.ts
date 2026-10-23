import { performance } from "node:perf_hooks";
import type { ChainCheck, PromptStep } from "./types.ts";

export interface EvaluationCase {
  steps: PromptStep[];
  expectedBroken: boolean;
}

export interface EvaluationResult {
  total: number;
  caught: number;
  missed: number;
  falseAlarms: number;
  checkTimeMs: number;
}

// Feed real, labeled chains to this function. It only reports the supplied run.
export function evaluateCases(
  cases: EvaluationCase[],
  runChecker: (steps: PromptStep[]) => ChainCheck[],
): EvaluationResult {
  let caught = 0;
  let missed = 0;
  let falseAlarms = 0;
  const start = performance.now();
  for (const item of cases) {
    const checks = runChecker(item.steps);
    const rejected = checks.some((check) => !check.ok && !check.fix);
    if (item.expectedBroken && rejected) caught++;
    else if (item.expectedBroken) missed++;
    else if (rejected) falseAlarms++;
  }
  const checkTimeMs = performance.now() - start;
  return { total: cases.length, caught, missed, falseAlarms, checkTimeMs };
}

export interface RunComparison {
  estimateCostUsd: number;
  actualCostUsd: number;
  estimateTimeSeconds: number;
  actualTimeSeconds: number;
}

export function compareRun(run: RunComparison): { costDifferenceUsd: number; timeDifferenceSeconds: number } {
  return {
    costDifferenceUsd: run.actualCostUsd - run.estimateCostUsd,
    timeDifferenceSeconds: run.actualTimeSeconds - run.estimateTimeSeconds,
  };
}

// Use the actual cost of a failed call and the number of retries that checking prevented.
export function calculateSavedCost(failedAttemptCostUsd: number, preventedRetries: number): number {
  return failedAttemptCostUsd * preventedRetries;
}
