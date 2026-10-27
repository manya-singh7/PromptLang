import { describe, it, expect } from "vitest";
import { checkChain } from "./checkChain";
import type { Step } from "../parser/parser";
import * as fs from "fs";
import * as path from "path";
import { tokenize, parse } from "../parser/parser";

describe("checkChain", () => {
  it("passes when adjacent types match", () => {
    const steps: Step[] = [
      { name: "first", inType: "text", outType: "text" },
      { name: "second", inType: "text", outType: "json" },
    ];

    expect(checkChain(steps)).toEqual([{ fromIndex: 0, ok: true }]);
  });

  it("reports a type mismatch", () => {
    const steps: Step[] = [
      { name: "first", inType: "text", outType: "json" },
      { name: "second", inType: "list", outType: "text" },
    ];

    const result = checkChain(steps);

    expect(result[0]?.ok).toBe(false);
    expect(result[0]?.fromIndex).toBe(0);
    expect(result[0]?.message).toContain("json");
    expect(result[0]?.message).toContain("list");
  });

  it('suggests "list-to-text" for list into text', () => {
    const steps: Step[] = [
      { name: "first", inType: "text", outType: "list" },
      { name: "second", inType: "text", outType: "text" },
    ];

    expect(checkChain(steps)[0]).toMatchObject({
      fromIndex: 0,
      ok: false,
      fix: "list-to-text",
    });
  });

  it("allows a text output limit when the next input limit is equal", () => {
    const steps: Step[] = [
      { name: "first", inType: "text", outType: "text", outMax: 100 },
      { name: "second", inType: "text", outType: "text", inMax: 100 },
    ];

    expect(checkChain(steps)[0]?.ok).toBe(true);
  });

  it("allows a larger next input limit", () => {
    const steps: Step[] = [
      { name: "first", inType: "text", outType: "text", outMax: 100 },
      { name: "second", inType: "text", outType: "text", inMax: 200 },
    ];

    expect(checkChain(steps)[0]?.ok).toBe(true);
  });

  it("rejects a smaller next input limit and includes both numbers", () => {
    const steps: Step[] = [
      { name: "first", inType: "text", outType: "text", outMax: 200 },
      { name: "second", inType: "text", outType: "text", inMax: 100 },
    ];

    const result = checkChain(steps)[0]!;

    expect(result.ok).toBe(false);
    expect(result.message).toContain("200");
    expect(result.message).toContain("100");
  });

  it("rejects unlimited output feeding a limited input", () => {
    const steps: Step[] = [
      { name: "first", inType: "text", outType: "text" },
      { name: "second", inType: "text", outType: "text", inMax: 100 },
    ];

    expect(checkChain(steps)[0]?.ok).toBe(false);
    expect(checkChain(steps)[0]?.message).toContain("100");
  });

  it("returns no arrow results for a single step", () => {
    const steps: Step[] = [
      { name: "only", inType: "text", outType: "text" },
    ];

    expect(checkChain(steps)).toEqual([]);
  });

  it("accepts valid width subtyping when output satisfies all required fields of input", () => {
    const steps: Step[] = [
      { name: "fetch", inType: "text", outType: "json{title:text,tags:list,author:text}" },
      { name: "render", inType: "json{title:text,tags:list}", outType: "text" },
    ];

    const results = checkChain(steps);
    expect(results).toEqual([{ fromIndex: 0, ok: true }]);
  });

  it("accepts property matching regardless of field declaration order", () => {
    const steps: Step[] = [
      { name: "fetch", inType: "text", outType: "json{tags:list,title:text}" },
      { name: "render", inType: "json{title:text,tags:list}", outType: "text" },
    ];

    const results = checkChain(steps);
    expect(results).toEqual([{ fromIndex: 0, ok: true }]);
  });

  it("flags generic json into typed json as a type mismatch by default", () => {
    const steps: Step[] = [
      { name: "raw", inType: "text", outType: "json" },
      { name: "process", inType: "json{title:text,tags:list}", outType: "text" },
    ];

    const results = checkChain(steps);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.message).toContain('Generic "json" cannot satisfy typed schema');
  });

  it("allows generic json into typed json when explicitly configured", () => {
    const steps: Step[] = [
      { name: "raw", inType: "text", outType: "json" },
      { name: "process", inType: "json{title:text,tags:list}", outType: "text" },
    ];

    const results = checkChain(steps, { allowGenericJson: true });
    expect(results[0]?.ok).toBe(true);
  });

  it("accepts typed json output feeding generic json input", () => {
    const steps: Step[] = [
      { name: "typed", inType: "text", outType: "json{title:text}" },
      { name: "consumer", inType: "json", outType: "text" },
    ];

    const results = checkChain(steps);
    expect(results).toEqual([{ fromIndex: 0, ok: true }]);
  });

  it("flags missing required keys with a clear error message", () => {
    const steps: Step[] = [
      { name: "A", inType: "text", outType: "json{title:text}" },
      { name: "B", inType: "json{title:text,tags:list}", outType: "text" },
    ];

    const results = checkChain(steps);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.message).toContain('Missing required field "tags"');
  });

  it("reports exact field-level mismatch error message when field types mismatch", () => {
    const steps: Step[] = [
      { name: "A", inType: "text", outType: "json{title:text,tags:list}" },
      { name: "B", inType: "json{title:text,tags:text}", outType: "text" },
    ];

    const results = checkChain(steps);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.message).toContain('Field "tags" type mismatch: expected "text", but got "list"');
  });

  it("supports nested schema subtyping and detects nested field mismatch", () => {
    const validNestedSteps: Step[] = [
      { name: "A", inType: "text", outType: "json{meta:json{id:text,count:number},title:text}" },
      { name: "B", inType: "json{meta:json{id:text}}", outType: "text" },
    ];
    expect(checkChain(validNestedSteps)[0]?.ok).toBe(true);

    const invalidNestedSteps: Step[] = [
      { name: "A", inType: "text", outType: "json{meta:json{id:number}}" },
      { name: "B", inType: "json{meta:json{id:text}}", outType: "text" },
    ];
    const invalidResult = checkChain(invalidNestedSteps)[0]!;
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.message).toContain('Field "meta.id" type mismatch: expected "text", but got "number"');
  });

  it("catches all broken seeded chains and accepts all valid ones", () => {
    const seededDir = path.resolve(__dirname, "../examples/seeded");
    const brokenDir = path.join(seededDir, "broken");
    const validDir = path.join(seededDir, "valid");

    const checkDirectory = (dir: string) => {
      const files = fs
        .readdirSync(dir)
        .filter((file) => file.endsWith(".promptlang"));

      return files.map((file) => {
        const source = fs.readFileSync(path.join(dir, file), "utf-8");
        const steps = parse(tokenize(source));
        const results = checkChain(steps);

        return {
          file,
          hasError: results.some((result) => !result.ok),
        };
      });
    };

    const brokenResults = checkDirectory(brokenDir);
    const validResults = checkDirectory(validDir);

    expect(brokenResults).toHaveLength(30);
    expect(
      brokenResults.filter((result) => result.hasError)
    ).toHaveLength(30);

    expect(validResults).toHaveLength(10);
    expect(
      validResults.filter((result) => !result.hasError)
    ).toHaveLength(10);
  }, 15000);

  describe("DAG checking (fan-out and fan-in joins)", () => {
    it("passes for valid fan-out when source satisfies all branch input types", () => {
      const source = "step source: in=text, out=text -> (step branch1: in=text, out=text, step branch2: in=text, out=list)";
      const steps = parse(tokenize(source));
      const results = checkChain(steps);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it("flags error when fan-out source is incompatible with one branch", () => {
      const source = "step source: in=text, out=text -> (step branch1: in=text, out=text, step branch2: in=list, out=text)";
      const steps = parse(tokenize(source));
      const results = checkChain(steps);
      const branch2Result = results.find((r) => !r.ok);
      expect(branch2Result).toBeDefined();
      expect(branch2Result?.message).toContain("Fan-out type mismatch");
      expect(branch2Result?.message).toContain('step "source" outputs "text"');
      expect(branch2Result?.message).toContain('step "branch2" expects "list"');
    });

    it("passes fan-out with structured json satisfying branch subschemas", () => {
      const source = "step source: in=text, out=json{id:text,tags:list,score:number} -> (step branch1: in=json{id:text}, out=text, step branch2: in=json{tags:list}, out=text)";
      const steps = parse(tokenize(source));
      const results = checkChain(steps);
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it("passes valid fan-in join where target expects structured dictionary of inputs", () => {
      const source = "step src: in=text, out=text -> (step branchA: in=text, out=text, step branchB: in=text, out=list) -> step merge: in=json{branchA:text,branchB:list}, out=text";
      const steps = parse(tokenize(source));
      const results = checkChain(steps);
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it("flags fan-in join when a branch type mismatches target dictionary field type", () => {
      const source = "step src: in=text, out=text -> (step branchA: in=text, out=text, step branchB: in=text, out=list) -> step merge: in=json{branchA:text,branchB:text}, out=text";
      const steps = parse(tokenize(source));
      const results = checkChain(steps);
      const failure = results.find((r) => !r.ok);
      expect(failure).toBeDefined();
      expect(failure?.message).toContain('Field "branchB" type mismatch: expected "text", but got "list"');
    });

    it("flags fan-in join when target dictionary requires a field not provided by incoming branches", () => {
      const source = "step src: in=text, out=text -> (step branchA: in=text, out=text, step branchB: in=text, out=list) -> step merge: in=json{branchA:text,branchB:list,branchC:text}, out=text";
      const steps = parse(tokenize(source));
      const results = checkChain(steps);
      const failure = results.find((r) => !r.ok && r.message?.includes("requires input"));
      expect(failure).toBeDefined();
      expect(failure?.message).toContain('step "merge" requires input "branchC"');
    });

    it("passes fan-in join when target expects list of inputs", () => {
      const source = "step src: in=text, out=text -> (step branchA: in=text, out=text, step branchB: in=text, out=text) -> step merge: in=list, out=text";
      const steps = parse(tokenize(source));
      const results = checkChain(steps);
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it("passes fan-in join when target expects text (concatenation) and all branches output text", () => {
      const source = "step src: in=text, out=text -> (step branchA: in=text, out=text, step branchB: in=text, out=text) -> step merge: in=text, out=text";
      const steps = parse(tokenize(source));
      const results = checkChain(steps);
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it("flags fan-in join when target expects text but a branch outputs list", () => {
      const source = "step src: in=text, out=text -> (step branchA: in=text, out=text, step branchB: in=text, out=list) -> step merge: in=text, out=text";
      const steps = parse(tokenize(source));
      const results = checkChain(steps);
      const failure = results.find((r) => !r.ok);
      expect(failure).toBeDefined();
      expect(failure?.message).toContain('Fan-in type mismatch: step "branchB" outputs "list", but step "merge" expects "text"');
    });
  });
});
