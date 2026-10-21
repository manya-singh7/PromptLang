import type { ChainCheck, PromptStep } from "./types.ts";

export interface FixedStep extends PromptStep {
  promptPrefix?: string;
  inserted?: boolean;
}

// Only the list-to-text conversion is automatic. It has a clear JSON representation.
// Other mismatches should stay as errors until the team defines a safe conversion.
export function addSafeFixes(steps: PromptStep[], checks: ChainCheck[]): FixedStep[] {
  const result: FixedStep[] = [];

  steps.forEach((step, index) => {
    result.push({ ...step });
    if (index >= steps.length - 1) return;

    const check = checks.find((item) => item.fromIndex === index);
    if (check?.fix === "list-to-text" && step.outType === "list" && steps[index + 1]?.inType === "text") {
      result.push({
        name: `${step.name}_to_text`,
        inType: "list",
        outType: "text",
        inserted: true,
      });
    }
  });

  return result;
}
