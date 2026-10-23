
import { describe, it, expect } from "vitest";
import { checkChain } from "../web/check";
import type { Step } from "../parser/parser";

describe("checkChain", () => {
  it("returns an empty array for empty steps or single step", () => {
    expect(checkChain([])).toEqual([]);
    expect(
      checkChain([{ name: "single", inType: "text", outType: "text" }])
    ).toEqual([]);
  });

  it("returns ok: true when consecutive step types match", () => {
    const steps: Step[] = [
      { name: "summarize", inType: "text", outType: "text" },
      { name: "translate", inType: "text", outType: "text" },
      { name: "format", inType: "text", outType: "list" },
    ];

    expect(checkChain(steps)).toEqual([
      { fromIndex: 0, ok: true },
      { fromIndex: 1, ok: true },
    ]);
  });

  it("returns list-to-text fix when list output feeds text input", () => {
    const steps: Step[] = [
      { name: "summarize", inType: "text", outType: "text" },
      { name: "format", inType: "text", outType: "list" },
      { name: "email", inType: "text", outType: "text" },
    ];

    expect(checkChain(steps)).toEqual([
      { fromIndex: 0, ok: true },
      {
        fromIndex: 1,
        ok: false,
        message: 'Step "format" outputs list, but step "email" expects text.',
        fix: "list-to-text",
      },
    ]);
  });

  it("rejects mismatched types other than list-to-text", () => {
    const steps: Step[] = [
      { name: "first", inType: "text", outType: "json" },
      { name: "second", inType: "list", outType: "text" },
    ];

    const result = checkChain(steps)[0]!;

    expect(result.fromIndex).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("json");
    expect(result.message).toContain("list");
    expect(result.fix).toBeUndefined();
  });

  it("allows a text output limit when the next input limit is equal or larger", () => {
    const equalLimits: Step[] = [
      { name: "first", inType: "text", outType: "text", outMax: 280 },
      { name: "second", inType: "text", outType: "text", inMax: 280 },
    ];

    const largerInput: Step[] = [
      { name: "first", inType: "text", outType: "text", outMax: 280 },
      { name: "second", inType: "text", outType: "text", inMax: 1000 },
    ];

    expect(checkChain(equalLimits)[0]?.ok).toBe(true);
    expect(checkChain(largerInput)[0]?.ok).toBe(true);
  });

  it("rejects a smaller next input limit and includes both numbers", () => {
    const steps: Step[] = [
      { name: "first", inType: "text", outType: "text", outMax: 1000 },
      { name: "second", inType: "text", outType: "text", inMax: 280 },
    ];

    const result = checkChain(steps)[0]!;

    expect(result.ok).toBe(false);
    expect(result.message).toContain("1000");
    expect(result.message).toContain("280");
  });

  it("rejects unlimited text output feeding a limited input", () => {
    const steps: Step[] = [
      { name: "first", inType: "text", outType: "text" },
      { name: "second", inType: "text", outType: "text", inMax: 280 },
    ];

    const result = checkChain(steps)[0]!;

    expect(result.ok).toBe(false);
    expect(result.message).toContain("280");
  });

  it("rejects length limits on non-text types", () => {
    const steps: Step[] = [
      { name: "first", inType: "json", outType: "json", outMax: 100 },
      { name: "second", inType: "json", outType: "json" },
    ];

    expect(checkChain(steps)[0]?.ok).toBe(false);
    expect(checkChain(steps)[0]?.message).toContain("only allowed on text");
  });
});
