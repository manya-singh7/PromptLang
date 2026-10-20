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

export function compileChain(
  steps: PromptStep[],
  input: string,
  checks: ChainCheck[],
  prices: PriceSettings,
): PipelineResult {
  const errors = checks.filter((check) => !check.ok && !check.fix).map((check) => check.message ?? `Type mismatch on arrow ${check.fromIndex + 1}`);
  const executableSteps = addSafeFixes(steps, checks);
  return {
    steps,
    executableSteps,
    generatedCode: errors.length ? "" : generateTypeScript(executableSteps, input),
    estimate: estimateRun(steps, input, prices),
    errors,
  };
}
