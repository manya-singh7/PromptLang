import { describe, it, expect } from "vitest";
import { checkTypes } from "../semantic/typeChecker";
import type { Step } from "../parser/parser";

describe("PromptLang type checker", () => {
  it("accepts a compatible chain", () => {
    const steps: Step[] = [
      { name: "summarize", inType: "text", outType: "text" },
      { name: "translate", inType: "text", outType: "text" },
    ];

    expect(checkTypes(steps)).toEqual([]);
  });

  it("reports a type mismatch between consecutive steps", () => {
    const steps: Step[] = [
      { name: "summarize", inType: "text", outType: "text" },
      { name: "process", inType: "json", outType: "list" },
    ];

    const issues = checkTypes(steps);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.stepIndex).toBe(1);
    expect(issues[0]!.message).toContain("summarize");
    expect(issues[0]!.message).toContain("process");
    expect(issues[0]!.message).toContain("text");
    expect(issues[0]!.message).toContain("json");
  });

  it("accepts a chain with different compatible types at each step", () => {
    const steps: Step[] = [
      { name: "collect", inType: "text", outType: "json" },
      { name: "format", inType: "json", outType: "list" },
    ];

    expect(checkTypes(steps)).toEqual([]);
  });

  it("accepts a single-step chain", () => {
    const steps: Step[] = [
      { name: "summarize", inType: "text", outType: "text" },
    ];

    expect(checkTypes(steps)).toEqual([]);
  });

  it("accepts valid width subtyping between steps", () => {
    const steps: Step[] = [
      { name: "fetch", inType: "text", outType: "json{title:text,tags:list,author:text}" },
      { name: "process", inType: "json{title:text,tags:list}", outType: "text" },
    ];

    expect(checkTypes(steps)).toEqual([]);
  });

  it("reports an exact field-level mismatch error message", () => {
    const steps: Step[] = [
      { name: "A", inType: "text", outType: "json{title:text,tags:list}" },
      { name: "B", inType: "json{title:text,tags:text}", outType: "text" },
    ];

    const issues = checkTypes(steps);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('Field "tags" type mismatch: expected "text", but got "list"');
  });

  it("reports a missing required field in typed json", () => {
    const steps: Step[] = [
      { name: "A", inType: "text", outType: "json{title:text}" },
      { name: "B", inType: "json{title:text,tags:list}", outType: "text" },
    ];

    const issues = checkTypes(steps);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('Missing required field "tags"');
  });

  it("flags generic json into typed json as a type mismatch", () => {
    const steps: Step[] = [
      { name: "A", inType: "text", outType: "json" },
      { name: "B", inType: "json{title:text}", outType: "text" },
    ];

    const issues = checkTypes(steps);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('Generic "json" cannot satisfy typed schema');
  });
});
