import { addSafeFixes } from "./autofix.ts";
import { generateTypeScript } from "./codegen.ts";
import { estimateRun } from "./estimate.ts";
import type { ChainCheck, PriceSettings, PromptStep } from "./types.ts";

export interface PipelineResult {
  steps: PromptStep[];
  executableSteps: ReturnType<typeof addSafeFixes>;
  generatedCode: string;
  estimate: ReturnType<typeof estimateRun>;
  errors: string[];
}

export function getChainErrors(steps: PromptStep[], checks: ChainCheck[]): string[] {
  const errors: string[] = [];
  for (let index = 0; index < steps.length - 1; index++) {
    const current = steps[index]!;
    const next = steps[index + 1]!;
    const check = checks.find((item) => item.fromIndex === index);
    if (!check) {
      errors.push("No type check result was returned for the step " + current.name + " -> " + next.name);
      continue;
    }
    if (check.ok) continue;
    const safeListFix = check.fix === "list-to-text" && current.outType === "list" && next.inType === "text";
    if (!safeListFix) errors.push(check.message ?? "Type mismatch between " + current.name + " and " + next.name);
  }
  return errors;
}

export function compileChain(
  steps: PromptStep[],
  input: string,
  checks: ChainCheck[],
  prices: PriceSettings,
): PipelineResult {
  const errors = getChainErrors(steps, checks);
  const executableSteps = addSafeFixes(steps, checks);
  return {
    steps,
    executableSteps,
    generatedCode: errors.length ? "" : generateTypeScript(executableSteps, input),
    estimate: estimateRun(steps, input, prices),
    errors,
  };
}