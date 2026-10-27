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
});
