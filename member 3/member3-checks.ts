import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addSafeFixes } from "./autofix.ts";
import { estimateRun } from "./estimate.ts";
import { calculateSavedCost, compareRun, evaluateCases } from "./metrics.ts";
import { checkRuntimeValue, makeApiCall, runSteps } from "./runtime.ts";
import { compileChain } from "./pipeline.ts";
import { checkPromptLang, parsePromptLang } from "./project-adapter.ts";
import { createRunHandler } from "./server.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ChainCheck, PromptStep } from "./types.ts";

describe("member 3 code", () => {
  it("generates code when the chain passes and refuses an unchecked mismatch", () => {
    const steps: PromptStep[] = [
      { name: "summarize", inType: "text", outType: "text" },
      { name: "format", inType: "text", outType: "list" },
    ];
    const good: ChainCheck[] = [{ fromIndex: 0, ok: true }];
    const bad: ChainCheck[] = [{ fromIndex: 0, ok: false, message: "types do not fit" }];

    assert.match(compileChain(steps, "article", good, prices).generatedCode, /runSteps/);
    assert.equal(compileChain(steps, "article", bad, prices).generatedCode, "");
  });

  it("adds only the supported list to text adapter", () => {
    const steps: PromptStep[] = [
      { name: "make_list", inType: "text", outType: "list" },
      { name: "summarize", inType: "text", outType: "text" },
    ];
    const fixed = addSafeFixes(steps, [{ fromIndex: 0, ok: false, fix: "list-to-text" }]);
    assert.equal(fixed.length, 3);
    assert.equal(fixed[1]?.inserted, true);
  });

  it("checks runtime output types and length limits", () => {
    assert.throws(() => checkRuntimeValue({ name: "short", inType: "text", outType: "text", outMax: 3 }, "long"), /limit is 3/);
    assert.deepEqual(checkRuntimeValue({ name: "items", inType: "text", outType: "list" }, "[1,2]"), [1, 2]);
    assert.throws(() => checkRuntimeValue({ name: "items", inType: "text", outType: "list" }, "not a list"), /JSON list/);
  });

  it("runs steps with injected model calls", async () => {
    const steps: PromptStep[] = [{ name: "echo", inType: "text", outType: "text" }];
    assert.equal(await runSteps(steps, "hello", async (_step, input) => `${String(input)}!`), "hello!");
  });

  it("estimates cost and reports actual run comparisons", () => {
    const estimate = estimateRun([{ name: "one", inType: "text", outType: "text" }], "hello", prices);
    assert.ok(estimate.costUsd > 0);
    assert.deepEqual(compareRun({ estimateCostUsd: 0.01, actualCostUsd: 0.02, estimateTimeSeconds: 5, actualTimeSeconds: 7 }),
      { costDifferenceUsd: 0.01, timeDifferenceSeconds: 2 });
    assert.ok(Math.abs(calculateSavedCost(0.02, 3) - 0.06) < 0.000001);
  });

  it("changes the estimate for longer input, more steps, and a smaller text limit", () => {
    const shortInput = estimateRun([{ name: "one", inType: "text", outType: "text" }], "hi", prices);
    const longInput = estimateRun([{ name: "one", inType: "text", outType: "text" }], "hi ".repeat(1000), prices);
    const moreSteps = estimateRun([
      { name: "one", inType: "text", outType: "text" },
      { name: "two", inType: "text", outType: "text" },
    ], "hi", prices);
    const limitedOutput = estimateRun([{ name: "one", inType: "text", outType: "text", outMax: 10 }], "hi", prices);

    assert.ok(longInput.costUsd > shortInput.costUsd);
    assert.ok(moreSteps.costUsd > shortInput.costUsd);
    assert.ok(limitedOutput.costUsd < shortInput.costUsd);
  });

  it("counts checker catches, misses and false alarms from actual checker calls", () => {
    const good: PromptStep[] = [{ name: "a", inType: "text", outType: "text" }, { name: "b", inType: "text", outType: "text" }];
    const broken: PromptStep[] = [{ name: "a", inType: "text", outType: "json" }, { name: "b", inType: "text", outType: "text" }];
    const report = evaluateCases([
      { steps: broken, expectedBroken: true },
      { steps: good, expectedBroken: false },
    ], (steps) => steps[0]?.outType === steps[1]?.inType
      ? [{ fromIndex: 0, ok: true }]
      : [{ fromIndex: 0, ok: false }]);
    assert.equal(report.total, 2);
    assert.equal(report.caught, 1);
    assert.equal(report.missed, 0);
    assert.equal(report.falseAlarms, 0);
  });

  it("parses and checks PromptLang source with the member 3 adapter", () => {
    const steps = parsePromptLang("step make_list: in=text, out=list -> step summarize: in=text, out=text");
    const checks = checkPromptLang(steps);
    assert.equal(steps.length, 2);
    assert.equal(checks[0]?.fix, "list-to-text");
    assert.equal(compileChain(steps, "hello", checks, prices).generatedCode.includes("make_list_to_text"), true);
  });

  it("reads valid text limits and rejects bad chain syntax", () => {
    const steps = parsePromptLang("step shorten: in=text[max 1000], out=text[max 280]");
    assert.equal(steps[0]?.inMax, 1000);
    assert.equal(steps[0]?.outMax, 280);
    assert.throws(() => parsePromptLang("step broken: in=text[max 0], out=text"), /positive whole number/);
    assert.throws(() => parsePromptLang("step broken: in=text, out=text ->"), /expected after/);
  });

  it("serves estimate and rejects a broken chain before calling the model", async () => {
    const handler = createRunHandler(parsePromptLang, checkPromptLang, {
      mode: "mock", baseUrl: "http://127.0.0.1:1/v1", model: "test",
    }, prices);
    const request = (url: string, body: object) => ({
      method: "POST",
      url,
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); },
    }) as unknown as IncomingMessage;
    const callHandler = async (url: string, body: object) => {
      let status = 0;
      let responseBody = "";
      const response = {
        setHeader() { return this; },
        writeHead(code: number) { status = code; return this; },
        end(data?: string) { responseBody = data ?? ""; return this; },
      } as unknown as ServerResponse;
      await handler(request(url, body), response);
      return { status, body: JSON.parse(responseBody) as Record<string, unknown> };
    };

    let page = "";
    const pageResponse = {
      writeHead(code: number) { assert.equal(code, 200); return this; },
      end(data: Buffer) { page = data.toString(); return this; },
    } as unknown as ServerResponse;
    await handler({ method: "GET", url: "/" } as IncomingMessage, pageResponse);
    assert.match(page, /Run without checking/);
    assert.match(page, /id="source-input" placeholder=/);
    assert.doesNotMatch(page, /<textarea[^>]*>[^<]*\S[^<]*<\/textarea>/);

    const estimate = await callHandler("/api/estimate", { source: "step one: in=text, out=text", input: "hello" });
    assert.equal(estimate.status, 200);
    assert.match(String(estimate.body.estimate), /Estimate/);

    const broken = await callHandler("/api/check-and-run", {
      source: "step one: in=text, out=json -> step two: in=text, out=text", input: "hello",
    });
    assert.equal(broken.status, 422);
    assert.match(String(broken.body.error), /outputs json/);

    const mockRun = await callHandler("/api/check-and-run", {
      source: "step one: in=text, out=text", input: "hello",
    });
    assert.equal(mockRun.status, 200);
    assert.equal(mockRun.body.mode, "mock");
    assert.match(String(mockRun.body.answer), /Mock result for one/);
    assert.match(String(mockRun.body.estimate), /Illustrative rates: \$1\/1M input and \$2\/1M output/);
    assert.match(String(mockRun.body.estimate), /no API call or charge/);
  });

  it("mock API call returns type-correct sample output without recording API usage", async () => {
    let recorded = false;
    const call = makeApiCall({ mode: "mock", baseUrl: "", model: "mock" }, () => { recorded = true; });
    assert.equal(await call({ name: "to_json", inType: "text", outType: "json" }, "hello"), '{"mock":true,"step":"to_json"}');
    assert.equal(await call({ name: "to_list", inType: "text", outType: "list" }, "hello"), '["Mock item from to_list"]');
    assert.equal(recorded, false);
  });
});

const prices = { inputUsdPerMillion: 1, outputUsdPerMillion: 2, expectedOutputCharsPerStep: 200 };
