import type { Step } from "../parser/parser";
import { isParameterizedJson } from "../parser/parser";
import { checkTypeSubtype, type SubtypeOptions } from "./typeChecker";

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
export function checkChain(steps: Step[], options?: SubtypeOptions): ChainCheckResult[] {
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

    const sub = checkTypeSubtype(fromType, toType, options);
    if (!sub.ok) {
      let detail = "";
      if (
        sub.reason &&
        (isParameterizedJson(fromType) ||
          isParameterizedJson(toType) ||
          (fromType === "json" && isParameterizedJson(toType)))
      ) {
        detail = ` ${sub.reason}.`;
      }
      results.push({
        fromIndex: i,
        ok: false,
        message: `Type mismatch: step "${current.name}" outputs "${fromType}", but step "${next.name}" expects "${toType}".${detail}`,
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
