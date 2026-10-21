

import { describe, it, expect } from "vitest";
import { analyzeChain } from "./analyzeChain";
import type { Step } from "../parser/parser";

describe("analyzeChain", () => {
  it("accepts a compatible chain", () => {
    const steps: Step[] = [
      { name: "summarize", inType: "text", outType: "text" },
      { name: "translate", inType: "text", outType: "json" },
    ];

    expect(analyzeChain(steps)).toEqual([]);
  });

  it("detects incompatible adjacent steps", () => {
    const steps: Step[] = [
      { name: "summarize", inType: "text", outType: "text" },
      { name: "format", inType: "json", outType: "list" },
    ];

    const issues = analyzeChain(steps);

    expect(issues.some(issue => issue.message.includes("Type mismatch"))).toBe(true);
  });
});
