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
});