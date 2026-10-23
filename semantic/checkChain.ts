
import type { Step } from "../parser/parser";

export interface ChainCheckResult {
  fromIndex: number;
  ok: boolean;
  message?: string;
  fix?: string;
}

/**
 * Checks compatibility between each pair of consecutive steps.
 * Returns one result for each arrow in the chain.
 */
export function checkChain(steps: Step[]): ChainCheckResult[] {
  const results: ChainCheckResult[] = [];

  for (let i = 0; i < steps.length - 1; i++) {
    const current = steps[i]!;
    const next = steps[i + 1]!;

    const fromType = current.outType;
    const toType = next.inType;

    // Special case: list -> text is recoverable using a conversion fix.
    if (fromType === "list" && toType === "text") {
      results.push({
        fromIndex: i,
        ok: false,
        message: `Step "${current.name}" outputs list, but step "${next.name}" expects text.`,
        fix: "list-to-text",
      });
      continue;
    }

    // Other mismatched types are errors.
    if (fromType !== toType) {
      results.push({
        fromIndex: i,
        ok: false,
        message: `Type mismatch: step "${current.name}" outputs "${fromType}", but step "${next.name}" expects "${toType}".`,
      });
      continue;
    }

    // Only text types may have length limits.
    if (
      (fromType !== "text" &&
        (current.outMax !== undefined || next.inMax !== undefined))
    ) {
      results.push({
        fromIndex: i,
        ok: false,
        message: `Length limits are only allowed on text. Check steps "${current.name}" and "${next.name}".`,
      });
      continue;
    }

    // Check text output against the next step's input limit.
    if (fromType === "text") {
      const outputLimit = current.outMax;
      const inputLimit = next.inMax;

      if (
        outputLimit === undefined &&
        inputLimit !== undefined
      ) {
        results.push({
          fromIndex: i,
          ok: false,
          message: `Step "${current.name}" has unlimited text output, but step "${next.name}" accepts at most ${inputLimit} characters.`,
        });
        continue;
      }

      if (
        outputLimit !== undefined &&
        inputLimit !== undefined &&
        inputLimit < outputLimit
      ) {
        results.push({
          fromIndex: i,
          ok: false,
          message: `Step "${current.name}" may output ${outputLimit} characters, but step "${next.name}" accepts only ${inputLimit}.`,
        });
        continue;
      }
    }

    results.push({ fromIndex: i, ok: true });
  }

  return results;
}
