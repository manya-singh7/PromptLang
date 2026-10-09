import { describe, it, expect } from "vitest";
import { checkChain } from "../web/check";
import type { Step } from "../parser/parser";

describe("checkChain", () => {
  it("returns an empty array for empty steps or single step", () => {
    expect(checkChain([])).toEqual([]);
    expect(checkChain([{ name: "single", inType: "text", outType: "text" }])).toEqual([]);
  });

  it("returns ok: true when consecutive step types match", () => {
    const steps: Step[] = [
      { name: "summarize", inType: "text", outType: "text" },
      { name: "translate", inType: "text", outType: "text" },
      { name: "format", inType: "text", outType: "list" },
    ];

    const results = checkChain(steps);
    expect(results).toEqual([
      { fromIndex: 0, ok: true },
      { fromIndex: 1, ok: true },
    ]);
  });

  it("returns ok: false with message when consecutive step types mismatch", () => {
    const steps: Step[] = [
      { name: "summarize", inType: "text", outType: "text" },
      { name: "format", inType: "text", outType: "list" },
      { name: "email", inType: "text", outType: "text" },
    ];

    const results = checkChain(steps);
    expect(results).toEqual([
      { fromIndex: 0, ok: true },
      {
        fromIndex: 1,
        ok: false,
        message: 'step "format" outputs list but step "email" expects text',
      },
    ]);
  });

  it("handles steps with length limits properly", () => {
    const steps: Step[] = [
      { name: "shorten", inType: "text", outType: "text", outMax: 280 },
      { name: "translate", inType: "text", outType: "text", inMax: 1000 },
    ];

    const results = checkChain(steps);
    expect(results).toEqual([{ fromIndex: 0, ok: true }]);
  });
});
