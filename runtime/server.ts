import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { estimateRun } from "./estimate.ts";
import { runSteps, makeApiCall, type ModelCall, type TokenUsage } from "./runtime.ts";
import { addSafeFixes } from "./autofix.ts";
import { getChainErrors } from "./pipeline.ts";
import type { ChainCheck, ModelSettings, PriceSettings, PromptStep } from "./types.ts";

export type ParseChain = (source: string) => PromptStep[];
export type CheckChain = (steps: PromptStep[]) => ChainCheck[];
export type ModelCallFactory = (settings: ModelSettings, onUsage?: (usage: TokenUsage) => void) => ModelCall;

interface RunRequest {
  source?: string;
  input?: string;
}

export function createRunServer(
  parseChain: ParseChain,
  checkChain: CheckChain,
  settings: ModelSettings,
  prices: PriceSettings,
  modelFactory: ModelCallFactory = makeApiCall,
) {
  return createServer(createRunHandler(parseChain, checkChain, settings, prices, modelFactory));
}

export function createRunHandler(
  parseChain: ParseChain,
  checkChain: CheckChain,
  settings: ModelSettings,
  prices: PriceSettings,
  modelFactory: ModelCallFactory = makeApiCall,
) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method === "GET" && (request.url === "/" || request.url === "/web-panel.html")) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(await readFile(join(process.cwd(), "runtime", "web-panel.html")));
      return;
    }
    if (request.method === "GET" && request.url === "/web-panel.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(await readFile(join(process.cwd(), "runtime", "web-panel.js")));
      return;
    }

    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (request.method !== "POST" || !["/api/run", "/api/estimate"].includes(request.url ?? "")) {
      response.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
      return;
    }

    try {
      const body = await readBody(request);
      if (!body.source?.trim()) throw new Error("Enter a PromptLang chain first");
      const steps = parseChain(body.source);
      if (!steps.length) throw new Error("The chain has no steps");
      const input = body.input ?? "";
      const estimate = estimateRun(steps, input, prices);
      const estimateText = makeEstimateText(estimate, settings.mode, prices);
      if (request.url === "/api/estimate") {
        response.writeHead(200).end(JSON.stringify({ estimate: estimateText, mode: settings.mode }));
        return;
      }

      // Every run is checked before a model call. There is no unchecked run route.
      const checks = checkChain(steps);
      const errors = getChainErrors(steps, checks);
      if (errors.length) {
        response.writeHead(422).end(JSON.stringify({ error: errors.join("; "), estimate: estimateText }));
        return;
      }

      const stepsToRun = addSafeFixes(steps, checks);
      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      const start = performance.now();
      const callModel = modelFactory(settings, (part) => {
        usage.inputTokens += part.inputTokens;
        usage.outputTokens += part.outputTokens;
      });
      let answer: unknown;
      let runError: unknown;
      try {
        answer = await runSteps(stepsToRun, input, callModel);
      } catch (error) {
        runError = error;
      }
      const measurement = makeMeasurement(usage, prices, estimate.costUsd, (performance.now() - start) / 1000, settings.mode);
      response.writeHead(200).end(JSON.stringify({
        answer: runError ? undefined : answer,
        error: runError instanceof Error ? runError.message : runError ? String(runError) : undefined,
        mode: settings.mode,
        estimate: estimateText,
        estimateDetails: {
          costUsd: estimate.costUsd,
          timeLowSeconds: estimate.timeLowSeconds,
          timeHighSeconds: estimate.timeHighSeconds,
        },
        measurement,
      }));
    } catch (error) {
      response.writeHead(400).end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  };
}

function makeEstimateText(
  estimate: ReturnType<typeof estimateRun>,
  mode: "mock" | "api",
  prices: PriceSettings,
): string {
  const rateNote = mode === "mock"
    ? "Sample rates ($" + prices.inputUsdPerMillion + "/1M input, $" + prices.outputUsdPerMillion + "/1M output) are illustrative, not provider prices. Mock outputs are sample text; mock mode makes no API call or charge."
    : "Uses configured rates. Actual token use and network time can differ.";
  return "Estimate only: about $" + estimate.costUsd.toFixed(6) + " (" + estimate.inputTokens + " input tokens, " + estimate.outputTokens + " output tokens), " + estimate.timeLowSeconds + "-" + estimate.timeHighSeconds + " seconds. " + estimate.note + " " + rateNote;
}

function makeMeasurement(usage: TokenUsage, prices: PriceSettings, estimateCostUsd: number, actualTimeSeconds: number, mode: "mock" | "api") {
  const actualCostUsd = (usage.inputTokens * prices.inputUsdPerMillion + usage.outputTokens * prices.outputUsdPerMillion) / 1_000_000;
  const measured = usage.inputTokens + usage.outputTokens > 0;
  return {
    actualTimeSeconds,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    actualCostUsd: measured ? actualCostUsd : null,
    costDifferenceUsd: measured ? actualCostUsd - estimateCostUsd : null,
    note: mode === "mock"
      ? "Mock mode returned sample text; no API usage or real cost was recorded."
      : measured ? "Token counts came from the API response." : "The provider did not return token usage, so actual cost is unavailable.",
  };
}

async function readBody(request: IncomingMessage): Promise<RunRequest> {
  let data = "";
  for await (const part of request) {
    data += part.toString();
    if (data.length > 100_000) throw new Error("Request is too large");
  }
  try {
    return JSON.parse(data) as RunRequest;
  } catch {
    throw new Error("Request body must be JSON");
  }
}