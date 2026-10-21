
import { describe, it, expect } from "vitest";
import { SymbolTable } from "./symbolTable";

describe("SymbolTable", () => {
  it("adds and retrieves a step", () => {
    const table = new SymbolTable();
    const step = {
      name: "summarize",
      inType: "text" as const,
      outType: "json" as const,
    };

    table.addStep(step);

    expect(table.getStep("summarize")).toEqual(step);
    expect(table.hasStep("summarize")).toBe(true);
  });

  it("returns undefined for a missing step", () => {
    const table = new SymbolTable();

    expect(table.getStep("missing")).toBeUndefined();
    expect(table.hasStep("missing")).toBe(false);
  });

  it("returns all registered steps", () => {
    const table = new SymbolTable();
    table.addStep({ name: "first", inType: "text", outType: "json" });
    table.addStep({ name: "second", inType: "json", outType: "list" });

    expect(table.getAllSteps()).toHaveLength(2);
  });

  it("rejects duplicate step names", () => {
    const table = new SymbolTable();
    const step = {
      name: "summarize",
      inType: "text" as const,
      outType: "json" as const,
    };

    table.addStep(step);

    expect(() => table.addStep(step)).toThrow(
      'Step "summarize" is already registered.'
    );
  });
});
