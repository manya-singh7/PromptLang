import type { Step } from "../parser/parser";

export interface ChainCheckResult {
  fromIndex: number;
  ok: boolean;
  message?: string;
}

/**
 * Checks whether types match between consecutive steps in a prompt chain.
 * Compares outType of step i with inType of step i+1.
 * 
 * Signature is stable so teammates can plug in subtype checking later.
 */
export function checkChain(
  steps: Step[]
): { fromIndex: number; ok: boolean; message?: string }[] {
  const results: { fromIndex: number; ok: boolean; message?: string }[] = [];

  for (let i = 0; i < steps.length - 1; i++) {
    const current = steps[i];
    const next = steps[i + 1];
    if (!current || !next) continue;

    const ok = current.outType === next.inType;
    if (ok) {
      results.push({
        fromIndex: i,
        ok: true,
      });
    } else {
      results.push({
        fromIndex: i,
        ok: false,
        message: `step "${current.name}" outputs ${current.outType} but step "${next.name}" expects ${next.inType}`,
      });
    }
  }

  return results;
}
