import { describe, it, expect } from "vitest";
import { tokenize, parse, ParseError, type Step } from "../parser/parser";
import { analyze } from "../parser/semantic";

describe("PromptLang semantic analysis", () => {
  it("reports no issues for a valid chain", () => {
    const source =
      "step shorten: in=text, out=text[max 280] -> step translate: in=text[max 1000], out=text -> step format: in=text, out=list";
    expect(analyze(parse(tokenize(source)))).toEqual([]);
  });

  it("reports duplicate step names with 1-based positions", () => {
    const source =
      "step summarize: in=text, out=text -> step format: in=text, out=text -> step translate: in=text, out=text -> step format: in=text, out=list";
    const issues = analyze(parse(tokenize(source)));

    expect(issues).toEqual([
      { stepIndex: 3, message: 'step "format" is defined twice (steps 2 and 4)' },
    ]);
  });

  it("reports an unknown type name", () => {
    const steps: Step[] = [{ name: "x", inType: "txt", outType: "text" }];
    const issues = analyze(steps);

    expect(issues).toEqual([
      { stepIndex: 0, message: 'step "x" uses unknown type "txt" (expected text, list or json)' },
    ]);
  });

  it("reports a limit on a non-text type", () => {
    const steps: Step[] = [{ name: "collect", inType: "text", outType: "list", outMax: 10 }];
    const issues = analyze(steps);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.stepIndex).toBe(0);
    expect(issues[0]!.message).toMatch(/collect/);
    expect(issues[0]!.message).toMatch(/only allowed on text/);
  });

  it("reports a limit that is not greater than zero", () => {
    const steps: Step[] = [
      { name: "a", inType: "text", outType: "text", inMax: 0 },
      { name: "b", inType: "text", outType: "text", outMax: -5 },
    ];
    const issues = analyze(steps);

    expect(issues.map((i) => i.stepIndex)).toEqual([0, 1]);
    for (const issue of issues) {
      expect(issue.message).toMatch(/greater than zero/);
    }
  });

  it("reports an empty chain", () => {
    const issues = analyze(parse(tokenize("")));

    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/empty/);
  });

  it("does not throw on odd input", () => {
    const steps = [{ name: "", inType: "", outType: "" }] as Step[];
    expect(() => analyze(steps)).not.toThrow();
  });

  it("detects and flags cycles in DAG pipelines", () => {
    const source =
      "step A: in=text, out=text -> step B: in=text, out=text -> step A";
    const issues = analyze(parse(tokenize(source)));

    expect(issues.some((i) => i.message.includes("Cycle detected"))).toBe(true);
  });

  it("detects dangling references to undefined steps", () => {
    const steps: Step[] = [
      { name: "A", inType: "text", outType: "text", outputsTo: ["Ghost"] },
    ];
    const issues = analyze(steps);

    expect(issues.some((i) => i.message.includes("Ghost") && i.message.includes("dangling"))).toBe(true);
  });

  it("detects unreachable steps in DAG pipelines", () => {
    const source =
      "step A: in=text, out=text -> step B: in=text, out=text; step C: in=text, out=text";
    const issues = analyze(parse(tokenize(source)));

    expect(issues.some((i) => i.message.includes("unreachable"))).toBe(true);
  });

  it("flags duplicate branch names in branch group", () => {
    const source =
      "step A: in=text, out=text -> (step B: in=text, out=text, step B: in=text, out=text)";
    const issues = analyze(parse(tokenize(source)));

    expect(
      issues.some(
        (i) => i.message.includes("Duplicate branch name") || i.message.includes("defined twice")
      )
    ).toBe(true);
  });
});

describe("PromptLang parser unknown type message", () => {
  it("names the bad word and lists valid types", () => {
    const source = "step x: in=txt, out=text";
    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(
      'Unknown type "txt". Expected text, list or json.'
    );
  });

  it("uses the same message for an unknown out type", () => {
    const source = "step x: in=text, out=jsn";
    expect(() => parse(tokenize(source))).toThrow('Unknown type "jsn". Expected text, list or json.');
  });
});
