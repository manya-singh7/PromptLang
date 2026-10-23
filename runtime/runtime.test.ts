import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { checkChain } from "./checker-adapter.ts";
import { addSafeFixes } from "./autofix.ts";
import { estimateRun } from "./estimate.ts";
import { calculateSavedCost, compareRun, evaluateCases } from "./metrics.ts";
import { parseChainSource } from "./parser-adapter.ts";
import { compileChain } from "./pipeline.ts";
import { checkRuntimeValue, makeApiCall, runSteps } from "./runtime.ts";
import { createRunHandler } from "./server.ts";
import { runDemoCase, runChain } from "./cli.ts";
import type { ModelSettings, PriceSettings, PromptStep } from "./types.ts";
import type { IncomingMessage, ServerResponse } from "node:http";

const prices: PriceSettings = { inputUsdPerMillion: 0.25, outputUsdPerMillion: 1.5, expectedOutputCharsPerStep: 200 };
const mockSettings: ModelSettings = { mode: "mock", baseUrl: "", model: "mock" };

describe("runtime integration", () => {
  it("uses the project parser and checker to compile a valid chain", () => {
    const steps = parseChainSource("step summarize: in=text, out=text -> step format: in=text, out=list");
    const checks = checkChain(steps);
    expect(steps).toHaveLength(2);
    expect(checks[0]?.ok).toBe(true);
    expect(compileChain(steps, "article", checks, prices).generatedCode).toContain("runSteps");
  });

  it("does not generate code for a broken project-checked chain", () => {
    const steps = parseChainSource("step format: in=text, out=list -> step email: in=text, out=text");
    const checks = checkChain(steps);
    expect(checks[0]?.ok).toBe(false);
    expect(compileChain(steps, "article", checks, prices).generatedCode).toBe("");
  });

  it("inserts only the supported list-to-text adapter", () => {
    const steps: PromptStep[] = [
      { name: "make_list", inType: "text", outType: "list" },
      { name: "summarize", inType: "text", outType: "text" },
    ];
    const fixed = addSafeFixes(steps, [{ fromIndex: 0, ok: false, fix: "list-to-text" }]);
    expect(fixed).toHaveLength(3);
    expect(fixed[1]?.inserted).toBe(true);
  });

  it("checks runtime output types and length limits", () => {
    expect(() => checkRuntimeValue({ name: "short", inType: "text", outType: "text", outMax: 3 }, "long"))
      .toThrow(/limit is 3/);
    expect(checkRuntimeValue({ name: "items", inType: "text", outType: "list" }, "[1,2]")).toEqual([1, 2]);
    expect(() => checkRuntimeValue({ name: "items", inType: "text", outType: "list" }, "not a list"))
      .toThrow(/JSON list/);
  });

  it("runs steps with an injected model call", async () => {
    const steps: PromptStep[] = [{ name: "echo", inType: "text", outType: "text" }];
    await expect(runSteps(steps, "hello", async (_step, input) => String(input) + "!"))
      .resolves.toBe("hello!");
  });

  it("estimates cost and reports run comparisons", () => {
    const estimate = estimateRun([{ name: "one", inType: "text", outType: "text" }], "hello", prices);
    expect(estimate.costUsd).toBeGreaterThan(0);
    expect(compareRun({ estimateCostUsd: 0.01, actualCostUsd: 0.02, estimateTimeSeconds: 5, actualTimeSeconds: 7 }))
      .toEqual({ costDifferenceUsd: 0.01, timeDifferenceSeconds: 2 });
    expect(calculateSavedCost(0.02, 3)).toBeCloseTo(0.06);
  });

  it("changes estimates with input length, step count and output limit", () => {
    const simple = [{ name: "one", inType: "text", outType: "text" }];
    const short = estimateRun(simple, "hi", prices);
    const long = estimateRun(simple, "hi ".repeat(1000), prices);
    const moreSteps = estimateRun([...simple, { name: "two", inType: "text", outType: "text" }], "hi", prices);
    const limited = estimateRun([{ name: "one", inType: "text", outType: "text", outMax: 10 }], "hi", prices);
    expect(long.costUsd).toBeGreaterThan(short.costUsd);
    expect(moreSteps.costUsd).toBeGreaterThan(short.costUsd);
    expect(limited.costUsd).toBeLessThan(short.costUsd);
  });

  it("reads text limits and rejects malformed PromptLang syntax", () => {
    const steps = parseChainSource("step shorten: in=text[max 1000], out=text[max 280]");
    expect(steps[0]?.inMax).toBe(1000);
    expect(steps[0]?.outMax).toBe(280);
    expect(() => parseChainSource("step broken: in=text[max 0], out=text")).toThrow();
    expect(() => parseChainSource("step broken: in=text, out=text ->")).toThrow();
  });

  it("blocks a broken CLI chain before any model call", async () => {
    const messages: string[] = [];
    const result = await runChain(
      "step format: in=text, out=list -> step email: in=text, out=text",
      "article",
      { model: mockSettings, prices },
      (line) => messages.push(line),
    );
    expect(result.status).toBe("blocked");
    expect(result.calls).toBe(0);
    expect(messages[0]).toContain("Estimate only");
    expect(messages[1]).toContain("Blocked before the model call");
  });

  it("serves the estimate and blocks broken chains before creating a model call", async () => {
    let modelFactoryCalls = 0;
    const handler = createRunHandler(parseChainSource, checkChain, mockSettings, prices, () => {
      modelFactoryCalls++;
      return async () => "should not run";
    });
    const estimate = await callHandler(handler, "/api/estimate", {
      source: "step one: in=text, out=text", input: "hello",
    });
    expect(estimate.status).toBe(200);
    expect(String(estimate.body.estimate)).toContain("Estimate only");

    const broken = await callHandler(handler, "/api/run", {
      source: "step one: in=text, out=json -> step two: in=text, out=text", input: "hello",
    });
    expect(broken.status).toBe(422);
    expect(String(broken.body.error)).toContain("outputs json");
    expect(modelFactoryCalls).toBe(0);
  });

  it("runs a valid chain after checking it and explains the sample mock", async () => {
    const handler = createRunHandler(parseChainSource, checkChain, mockSettings, prices);
    const response = await callHandler(handler, "/api/run", {
      source: "step one: in=text, out=text", input: "hello",
    });
    expect(response.status).toBe(200);
    expect(response.body.mode).toBe("mock");
    expect(String(response.body.answer)).toContain("Sample mock output");
    expect(String(response.body.estimate)).toContain("illustrative, not provider prices");
    expect(String(response.body.estimate)).toContain("no API call or charge");
  });

  it("serves an empty run page with no unchecked run button", async () => {
    const handler = createRunHandler(parseChainSource, checkChain, mockSettings, prices);
    let page = "";
    const response = {
      writeHead(status: number) { expect(status).toBe(200); return this; },
      end(body: Buffer) { page = body.toString(); return this; },
    } as unknown as ServerResponse;
    await handler({ method: "GET", url: "/" } as IncomingMessage, response);
    expect(page).toContain('id="check-and-run"');
    expect(page).not.toContain("Run without checking");
    expect(page).toMatch(/<textarea[^>]*><\/textarea>/);
  });

  it("uses mock values as samples and leaves runtime limits visible", async () => {
    let usageRecorded = false;
    const call = makeApiCall(mockSettings, () => { usageRecorded = true; });
    const value = await call({ name: "to_json", inType: "text", outType: "json" }, "hello");
    expect(value).toBe('{"mock":true,"step":"to_json"}');
    expect(usageRecorded).toBe(false);
    await expect(runSteps(
      [{ name: "short", inType: "text", outType: "text", outMax: 10 }],
      "hello",
      call,
    )).rejects.toThrow(/limit is 10/);
  });

  it("runs the valid, broken, and runtime-limit demo cases from demo-input.txt", async () => {
    const input = await readFile("examples/demo-input.txt", "utf8");
    const valid = await runDemoCase("valid", input, () => {});
    const broken = await runDemoCase("broken", input, () => {});
    const limit = await runDemoCase("limit", input, () => {});
    expect(valid.status).toBe("ran");
    expect(valid.calls).toBe(2);
    expect(broken.status).toBe("blocked");
    expect(broken.calls).toBe(0);
    expect(limit.status).toBe("runtime-limit");
    expect(limit.calls).toBe(1);
  });
});

async function callHandler(
  handler: ReturnType<typeof createRunHandler>,
  url: string,
  body: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let status = 0;
  let responseBody = "";
  const request = {
    method: "POST",
    url,
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); },
  } as unknown as IncomingMessage;
  const response = {
    setHeader() { return this; },
    writeHead(code: number) { status = code; return this; },
    end(data?: string) { responseBody = data ?? ""; return this; },
  } as unknown as ServerResponse;
  await handler(request, response);
  return { status, body: JSON.parse(responseBody) as Record<string, unknown> };
}