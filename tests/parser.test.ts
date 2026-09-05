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
});