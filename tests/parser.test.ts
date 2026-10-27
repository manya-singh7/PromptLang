import { describe, it, expect } from "vitest";
import { tokenize, parse, ParseError } from "../parser/parser";

describe("PromptLang parser", () => {
  it("parses a valid chain with multiple steps", () => {
    const source = "step summarize: in=text, out=text -> step translate: in=text, out=text";
    const steps = parse(tokenize(source));

    expect(steps).toEqual([
      { name: "summarize", inType: "text", outType: "text" },
      { name: "translate", inType: "text", outType: "text" },
    ]);
  });

  it("parses a single step with no chain", () => {
    const source = "step summarize: in=text, out=text";
    const steps = parse(tokenize(source));

    expect(steps).toEqual([{ name: "summarize", inType: "text", outType: "text" }]);
  });

  it("throws a ParseError when the colon is missing", () => {
    const source = "step summarize in=text, out=text";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
  });

  it("throws a ParseError when the arrow is dangling", () => {
    const source = "step summarize: in=text, out=text ->";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
  });

  it("throws a helpful error message identifying what was expected", () => {
    const source = "step summarize in=text, out=text";

    expect(() => parse(tokenize(source))).toThrow(/Expected COLON/);
  });

  it("parses a valid limit on out", () => {
    const source = "step shorten: in=text, out=text[max 280]";
    const steps = parse(tokenize(source));

    expect(steps).toEqual([
      { name: "shorten", inType: "text", outType: "text", outMax: 280 },
    ]);
  });

  it("parses a valid limit on in", () => {
    const source = "step translate: in=text[max 1000], out=text";
    const steps = parse(tokenize(source));

    expect(steps).toEqual([
      { name: "translate", inType: "text", outType: "text", inMax: 1000 },
    ]);
  });

  it("parses a chain with limits on both in and out", () => {
    const source =
      "step shorten: in=text[max 500], out=text[max 280] -> step translate: in=text[max 280], out=text[max 1000]";
    const steps = parse(tokenize(source));

    expect(steps).toEqual([
      { name: "shorten", inType: "text", outType: "text", inMax: 500, outMax: 280 },
      { name: "translate", inType: "text", outType: "text", inMax: 280, outMax: 1000 },
    ]);
  });

  it("verifies steps with no limit still work and have no limit fields", () => {
    const source = "step summarize: in=text, out=list";
    const steps = parse(tokenize(source));

    expect(steps).toEqual([{ name: "summarize", inType: "text", outType: "list" }]);
    expect(steps[0]).not.toHaveProperty("inMax");
    expect(steps[0]).not.toHaveProperty("outMax");
  });

  it("throws a ParseError when limit is placed on list", () => {
    const source = "step process: in=list[max 5], out=text";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(/only allowed on "text"/i);
  });

  it("throws a ParseError when limit is placed on json", () => {
    const source = "step process: in=text, out=json[max 5]";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(/only allowed on "text"/i);
  });

  it("throws a ParseError when closing bracket is missing", () => {
    const source = "step shorten: in=text[max 280, out=text";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(/closing "\]"/i);
  });

  it("throws a ParseError when length limit number is missing", () => {
    const source = "step shorten: in=text[max], out=text";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(/missing length limit number/i);
  });

  it("throws a ParseError when length limit number is non-numeric", () => {
    const source = "step shorten: in=text[max foo], out=text";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(/non-numeric/i);
  });

  it("throws a ParseError when length limit number is zero", () => {
    const source = "step shorten: in=text[max 0], out=text";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(/greater than zero/i);
  });

  it("throws a ParseError when length limit number is negative", () => {
    const source = "step shorten: in=text[max -5], out=text";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(/greater than zero/i);
  });

  it("parses parameterized JSON types with scalar value types", () => {
    const source = "step process: in=json{title:text,tags:list}, out=text";
    const steps = parse(tokenize(source));

    expect(steps).toEqual([
      { name: "process", inType: "json{title:text,tags:list}", outType: "text" },
    ]);
  });

  it("parses parameterized JSON types with internal whitespace", () => {
    const source = "step process: in=json{ title: text , tags: list }, out=text";
    const steps = parse(tokenize(source));

    expect(steps).toEqual([
      { name: "process", inType: "json{title:text,tags:list}", outType: "text" },
    ]);
  });

  it("parses nested parameterized JSON types", () => {
    const source = "step process: in=json{meta:json{id:text,count:number},tags:list}, out=text";
    const steps = parse(tokenize(source));

    expect(steps).toEqual([
      { name: "process", inType: "json{meta:json{id:text,count:number},tags:list}", outType: "text" },
    ]);
  });

  it("parses multiple chained steps with parameterized JSON types", () => {
    const source =
      "step A: in=text, out=json{title:text,tags:list} -> step B: in=json{title:text}, out=text";
    const steps = parse(tokenize(source));

    expect(steps).toEqual([
      { name: "A", inType: "text", outType: "json{title:text,tags:list}" },
      { name: "B", inType: "json{title:text}", outType: "text" },
    ]);
  });

  it("retains backward compatibility for plain unparameterized json", () => {
    const source = "step A: in=json, out=json -> step B: in=json, out=text";
    const steps = parse(tokenize(source));

    expect(steps).toEqual([
      { name: "A", inType: "json", outType: "json" },
      { name: "B", inType: "json", outType: "text" },
    ]);
  });

  it("throws a ParseError when closing brace is missing in parameterized json", () => {
    const source = "step process: in=json{title:text, out=text";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(/closing "}"/i);
  });

  it("throws a ParseError for missing colon after field key in json schema", () => {
    const source = "step process: in=json{title text}, out=text";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(/Expected ":"/i);
  });

  it("throws a ParseError for unknown field type in json schema", () => {
    const source = "step process: in=json{title:invalidType}, out=text";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(/Unknown field type "invalidType"/i);
  });

  it("throws a ParseError when length limit is placed on parameterized json", () => {
    const source = "step process: in=text, out=json{title:text}[max 100]";

    expect(() => parse(tokenize(source))).toThrow(ParseError);
    expect(() => parse(tokenize(source))).toThrow(/only allowed on "text"/i);
  });

  it("parses fan-out branching step A -> (step B, step C)", () => {
    const source =
      "step A: in=text, out=text -> (step B: in=text, out=text, step C: in=text, out=text)";
    const steps = parse(tokenize(source));

    expect(steps).toHaveLength(3);
    expect(steps[0]!.name).toBe("A");
    expect(steps[0]!.outputsTo).toEqual(["B", "C"]);
    expect(steps[1]!.name).toBe("B");
    expect(steps[1]!.inputsFrom).toEqual(["A"]);
    expect(steps[2]!.name).toBe("C");
    expect(steps[2]!.inputsFrom).toEqual(["A"]);
  });

  it("parses fan-in join (step B, step C) -> step D", () => {
    const source =
      "(step B: in=text, out=text, step C: in=text, out=text) -> step D: in=list, out=text";
    const steps = parse(tokenize(source));

    expect(steps).toHaveLength(3);
    expect(steps[0]!.name).toBe("B");
    expect(steps[0]!.outputsTo).toEqual(["D"]);
    expect(steps[1]!.name).toBe("C");
    expect(steps[1]!.outputsTo).toEqual(["D"]);
    expect(steps[2]!.name).toBe("D");
    expect(steps[2]!.inputsFrom).toEqual(["B", "C"]);
  });

  it("parses chained fan-out and fan-in A -> (B, C) -> D", () => {
    const source =
      "step A: in=text, out=text -> (step B: in=text, out=text, step C: in=text, out=text) -> step D: in=list, out=text";
    const steps = parse(tokenize(source));

    expect(steps).toHaveLength(4);
    expect(steps[0]!.outputsTo).toEqual(["B", "C"]);
    expect(steps[1]!.inputsFrom).toEqual(["A"]);
    expect(steps[1]!.outputsTo).toEqual(["D"]);
    expect(steps[2]!.inputsFrom).toEqual(["A"]);
    expect(steps[2]!.outputsTo).toEqual(["D"]);
    expect(steps[3]!.inputsFrom).toEqual(["B", "C"]);
  });

  it("parses multi-statement connections separated by semicolons", () => {
    const source =
      "step A: in=text, out=text -> step B: in=text, out=text; step A -> step C: in=text, out=text";
    const steps = parse(tokenize(source));

    expect(steps).toHaveLength(3);
    expect(steps[0]!.outputsTo).toEqual(["B", "C"]);
    expect(steps[1]!.inputsFrom).toEqual(["A"]);
    expect(steps[2]!.inputsFrom).toEqual(["A"]);
  });

  it("parses explicit labeled from= dependencies", () => {
    const source =
      "step A: in=text, out=text -> step B: in=text, out=text -> step C: in=list, out=text, from=A,B";
    const steps = parse(tokenize(source));

    expect(steps[2]!.inputsFrom).toEqual(["A", "B"]);
  });
});
