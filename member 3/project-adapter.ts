import type { ChainCheck, PromptStep } from "./types.ts";

// A small parser for the same one-line step form used by the current project.
// Keeping this bridge here lets the member 3 folder run on its own when shared.
export function parsePromptLang(source: string): PromptStep[] {
  if (!source.trim()) return [];
  const parts = source.split(/\s*->\s*/);
  if (parts.some((part) => !part.trim())) throw new Error("A step was expected after ->");

  return parts.map((part, index) => {
    const match = part.match(/^step\s+([A-Za-z_][\w-]*)\s*:\s*in\s*=\s*(text|list|json)(?:\s*\[\s*max\s+(\d+)\s*\])?\s*,\s*out\s*=\s*(text|list|json)(?:\s*\[\s*max\s+(\d+)\s*\])?\s*$/);
    if (!match) throw new Error(`Could not parse step ${index + 1}: ${part.trim()}`);

    const [, name, inType, inMaxText, outType, outMaxText] = match;
    const inMax = parseLimit(inType!, inMaxText, index + 1);
    const outMax = parseLimit(outType!, outMaxText, index + 1);
    const step: PromptStep = { name: name!, inType: inType!, outType: outType! };
    if (inMax !== undefined) step.inMax = inMax;
    if (outMax !== undefined) step.outMax = outMax;
    return step;
  });
}

export function checkPromptLang(steps: PromptStep[]): ChainCheck[] {
  const checks: ChainCheck[] = [];
  for (let index = 0; index < steps.length - 1; index++) {
    const left = steps[index]!;
    const right = steps[index + 1]!;
    if (left.outType === right.inType) {
      checks.push({ fromIndex: index, ok: true });
    } else if (left.outType === "list" && right.inType === "text") {
      checks.push({ fromIndex: index, ok: false, fix: "list-to-text", message: `step "${left.name}" outputs list; step "${right.name}" expects text (a list-to-text adapter can be inserted)` });
    } else {
      checks.push({ fromIndex: index, ok: false, message: `step "${left.name}" outputs ${left.outType}; step "${right.name}" expects ${right.inType}` });
    }
  }
  return checks;
}

function parseLimit(type: string, raw: string | undefined, stepNumber: number): number | undefined {
  if (raw === undefined) return undefined;
  if (type !== "text") throw new Error(`Step ${stepNumber}: length limits are only allowed on text`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Step ${stepNumber}: text limit must be a positive whole number`);
  return value;
}
