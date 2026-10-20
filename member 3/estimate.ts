import type { PriceSettings, PromptStep } from "./types.ts";

export interface RunEstimate {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timeLowSeconds: number;
  timeHighSeconds: number;
  note: string;
}

// Four characters per token is a rough rule only; use provider usage for the real result.
export function estimateRun(steps: PromptStep[], input: string, prices: PriceSettings): RunEstimate {
  let inputTokens = 0;
  let outputTokens = 0;
  let nextInputChars = input.length;

  for (const step of steps) {
    // Include the input passed to this step and a small allowance for its instruction.
    const instructionChars = step.name.length + step.inType.length + step.outType.length + 85;
    inputTokens += Math.ceil((nextInputChars + instructionChars) / 4);

    // A text max limit reduces the estimated output size for this step.
    const outputChars = step.outType === "text" && step.outMax !== undefined
      ? Math.min(prices.expectedOutputCharsPerStep, step.outMax)
      : prices.expectedOutputCharsPerStep;
    outputTokens += Math.ceil(outputChars / 4);
    nextInputChars = outputChars;
  }

  const costUsd = (inputTokens * prices.inputUsdPerMillion + outputTokens * prices.outputUsdPerMillion) / 1_000_000;

  return {
    inputTokens,
    outputTokens,
    costUsd,
    timeLowSeconds: Math.max(1, steps.length * 2),
    timeHighSeconds: Math.max(3, steps.length * 8),
    note: "Rough estimate. Token use and network time can be different.",
  };
}
