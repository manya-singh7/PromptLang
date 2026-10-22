import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkChain } from "../web/check.ts";
import { estimateRun } from "./estimate.ts";
import { parseChainSource } from "./parser-adapter.ts";
import { getChainErrors } from "./pipeline.ts";
import { loadRuntimeConfig } from "./settings.ts";
import { makeApiCall, runSteps, type ModelCall } from "./runtime.ts";
import type { PromptStep } from "./types.ts";

export type DemoCase = "valid" | "broken" | "limit";

const demoChains: Record<DemoCase, string> = {
  valid: "step summarize: in=text, out=text -> step format: in=text, out=list",
  broken: "step format: in=text, out=list -> step email: in=text, out=text",
  limit: "step shorten: in=text, out=text[max 10]",
};

export interface CliRunResult {
  status: "ran" | "blocked" | "runtime-limit" | "runtime-error";
  calls: number;
  output?: unknown;
  error?: string;
  estimateText: string;
}

export async function runChain(
  source: string,
  input: string,
  config: Awaited<ReturnType<typeof loadRuntimeConfig>>,
  write: (line: string) => void = console.log,
): Promise<CliRunResult> {
  let steps: PromptStep[];
  try {
    steps = parseChainSource(source);
    if (!steps.length) throw new Error("The chain has no steps");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    write("Parse error: " + message);
    return { status: "blocked", calls: 0, error: message, estimateText: "Estimate unavailable because the chain could not be parsed." };
  }

  const estimate = estimateRun(steps, input, config.prices);
  const estimateText = makeEstimateText(estimate, config.model.mode, config.prices);
  write(estimateText);

  const errors = getChainErrors(steps, checkChain(steps));
  if (errors.length) {
    const message = errors.join("; ");
    write("Blocked before the model call: " + message);
    return { status: "blocked", calls: 0, error: message, estimateText };
  }

  let calls = 0;
  const modelCall = makeApiCall(config.model);
  const countedCall: ModelCall = async (step, value) => {
    calls++;
    return modelCall(step, value);
  };
  try {
    const output = await runSteps(steps, input, countedCall);
    write("Run finished. Output: " + formatOutput(output));
    if (config.model.mode === "mock") write("Mock output is sample text; no API call or charge was made.");
    return { status: "ran", calls, output, estimateText };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /limit/.test(message) ? "runtime-limit" : "runtime-error";
    write("Run stopped: " + message);
    return { status, calls, error: message, estimateText };
  }
}

export async function runDemoCase(
  name: DemoCase,
  input: string,
  write: (line: string) => void = console.log,
): Promise<CliRunResult> {
  const config = await loadRuntimeConfig(true);
  write("\nDemo case: " + name);
  return runChain(demoChains[name], input, config, write);
}

async function main(args: string[]): Promise<void> {
  if (args[0] === "demo") {
    const input = await readFile(resolve("examples/demo-input.txt"), "utf8");
    for (const name of ["valid", "broken", "limit"] as const) await runDemoCase(name, input);
    return;
  }
  if (args[0] === "run" && args[1]) {
    const source = await readFile(resolve(args[1]), "utf8");
    const input = args[2] ? await readFile(resolve(args[2]), "utf8") : "";
    await runChain(source, input, await loadRuntimeConfig());
    return;
  }
  console.log("Usage:");
  console.log("  npx tsx runtime/cli.ts demo");
  console.log("  npx tsx runtime/cli.ts run <chain-file> [input-file]");
}

function makeEstimateText(
  estimate: ReturnType<typeof estimateRun>,
  mode: "mock" | "api",
  prices: { inputUsdPerMillion: number; outputUsdPerMillion: number },
): string {
  const rateNote = mode === "mock"
    ? "The sample rates ($" + prices.inputUsdPerMillion + "/1M input, $" + prices.outputUsdPerMillion + "/1M output) are illustrative, not provider prices."
    : "Uses the rates configured for this run; provider usage can differ.";
  return "Estimate only: about $" + estimate.costUsd.toFixed(6) + ", " + estimate.inputTokens + " input and " + estimate.outputTokens + " output tokens, " + estimate.timeLowSeconds + "-" + estimate.timeHighSeconds + " seconds. " + estimate.note + " " + rateNote;
}

function formatOutput(output: unknown): string {
  return typeof output === "string" ? output : JSON.stringify(output);
}

if (process.argv[1] && /[\\/]cli\.ts$/.test(process.argv[1])) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}