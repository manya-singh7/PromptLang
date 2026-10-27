import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import {
  runBenchmark,
  PRICING_PRESETS,
  simulateNaiveRun,
  simulateGuardedRun,
} from "../scripts/benchmark-savings";
import { parse, tokenize } from "../parser/parser";

describe("empirical savings benchmark runner", () => {
  it("executes the full benchmark across all seeded chains without error", () => {
    const deliverablePath = path.resolve(__dirname, "../runtime/deliverables/benchmark-results.md");
    const result = runBenchmark({ silent: true, deliverablePath });

    expect(result).toBeDefined();
    expect(result.presets).toBeDefined();

    const gpt4o = result.presets["gpt-4o"];
    expect(gpt4o).toBeDefined();
    expect(gpt4o.totalChains).toBe(40);
    expect(gpt4o.brokenChains).toBe(30);
    expect(gpt4o.validChains).toBe(10);

    // PromptLang static checking blocks every broken chain upfront
    expect(gpt4o.totalPreventedApiCalls).toBe(52);
    expect(gpt4o.totalPreventedTokens).toBeGreaterThan(10000);
    expect(gpt4o.totalNetDollarsSaved).toBeGreaterThan(0.05);
    expect(gpt4o.totalTimeSavedSeconds).toBeGreaterThan(50);
    expect(gpt4o.averageCheckTimeMs).toBeLessThan(1.0);

    // Multi-preset verification
    for (const presetKey of ["gpt-4o", "claude-3-5-sonnet", "gemini-1-5-flash", "promptlang-sample"]) {
      const p = result.presets[presetKey];
      expect(p).toBeDefined();
      expect(p.totalPreventedApiCalls).toBe(52);
      expect(p.totalNetDollarsSaved).toBeGreaterThan(0);
      expect(p.totalTimeSavedSeconds).toBeGreaterThan(0);
    }

    // Verify markdown deliverable file is written
    expect(fs.existsSync(deliverablePath)).toBe(true);
    const content = fs.readFileSync(deliverablePath, "utf-8");
    expect(content).toContain("# PromptLang Empirical Savings Benchmark Results");
    expect(content).toContain("Total Prevented API Calls");
    expect(content).toContain("GPT-4o");
    expect(content).toContain("Claude 3.5 Sonnet");
    expect(content).toContain("Gemini 1.5 Flash");
  });

  it("correctly simulates naive execution halting at first type mismatch", () => {
    const source = "step clean: in=text, out=text -> step tokenize: in=text, out=list -> step translate: in=text, out=text";
    const steps = parse(tokenize(source));
    const preset = PRICING_PRESETS["gpt-4o"]!;

    const naive = simulateNaiveRun(steps, preset, "Hello world input");
    expect(naive.stats.status).toBe("failed");
    expect(naive.stats.stepsExecuted).toBe(2); // clean + tokenize ran, translate failed on input
    expect(naive.stats.wastedSteps).toBe(2);
    expect(naive.stats.wastedCostUsd).toBeGreaterThan(0);
    expect(naive.failureStepIndex).toBe(2);
    expect(naive.failureReason).toContain('Type mismatch: step "tokenize" outputs "list", but step "translate" expects "text"');
  });

  it("blocks broken execution upfront in guarded mode with zero waste", () => {
    const source = "step clean: in=text, out=text -> step tokenize: in=text, out=list -> step translate: in=text, out=text";
    const steps = parse(tokenize(source));
    const preset = PRICING_PRESETS["gpt-4o"]!;

    const naive = simulateNaiveRun(steps, preset, "Hello world input");
    const guarded = simulateGuardedRun(steps, preset, "Hello world input", naive);

    expect(guarded.status).toBe("blocked");
    expect(guarded.stepsExecuted).toBe(0);
    expect(guarded.totalTokens).toBe(0);
    expect(guarded.costUsd).toBe(0);
    expect(guarded.checkTimeMs).toBeGreaterThan(0);
    expect(guarded.checkTimeMs).toBeLessThan(5); // sub-millisecond check
  });
});
