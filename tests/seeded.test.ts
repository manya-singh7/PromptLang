import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { tokenize, parse } from "../parser/parser";
import { validateSeeded, evaluateChain, checkSubtype } from "../scripts/validate-seeded";

const SEEDED_DIR = path.resolve(__dirname, "../examples/seeded");

describe("seeded type-checker test set", () => {
  it("is consistent with its manifest", () => {
    const result = validateSeeded(SEEDED_DIR);

    expect(result.errors).toEqual([]);
    expect(result.total).toBe(40);
    expect(result.broken).toBe(30);
    expect(result.valid).toBe(10);
  });
});

describe("subtype rules used by the validator", () => {
  it("rejects different base types", () => {
    expect(checkSubtype("text", undefined, "list", undefined)).toEqual({ ok: false, reason: "type-mismatch" });
    expect(checkSubtype("json", undefined, "text", undefined)).toEqual({ ok: false, reason: "type-mismatch" });
  });

  it("accepts a smaller or equal limit into a larger one", () => {
    expect(checkSubtype("text", 100, "text", 280).ok).toBe(true);
    expect(checkSubtype("text", 280, "text", 280).ok).toBe(true);
  });

  it("accepts a bounded text into plain text", () => {
    expect(checkSubtype("text", 280, "text", undefined).ok).toBe(true);
  });

  it("rejects a larger limit into a smaller one", () => {
    expect(checkSubtype("text", 1000, "text", 280)).toEqual({ ok: false, reason: "limit-violation" });
  });

  it("rejects plain text into bounded text", () => {
    expect(checkSubtype("text", undefined, "text", 280)).toEqual({ ok: false, reason: "limit-violation" });
  });

  it("reports every failing pair by the index of its first step", () => {
    const steps = parse(
      tokenize(
        "step a: in=text, out=list -> step b: in=list, out=text -> step c: in=json, out=text[max 500] -> step d: in=text[max 100], out=text"
      )
    );
    expect(evaluateChain(steps)).toEqual({
      valid: false,
      category: "type-mismatch",
      errorCount: 2,
      failingPairs: [1, 2],
    });
  });
});

describe("validator catches a corrupted set", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "seeded-"));
    fs.cpSync(SEEDED_DIR, tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function rewriteManifest(edit: (entries: any[]) => void): void {
    const manifestPath = path.join(tmpDir, "manifest.json");
    const entries = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    edit(entries);
    fs.writeFileSync(manifestPath, JSON.stringify(entries, null, 2));
  }

  it("flags wrong failingPairs", () => {
    rewriteManifest((entries) => {
      entries[0].failingPairs = [1];
    });
    expect(validateSeeded(tmpDir).errors.join("\n")).toMatch(/failingPairs mismatch/);
  });

  it("flags a file missing from the manifest", () => {
    rewriteManifest((entries) => {
      entries.pop();
    });
    expect(validateSeeded(tmpDir).errors.join("\n")).toMatch(/missing from manifest/);
  });

  it("flags a file that does not parse", () => {
    const first = fs.readdirSync(path.join(tmpDir, "broken"))[0]!;
    fs.writeFileSync(path.join(tmpDir, "broken", first), "step a in=text, out=text");
    expect(validateSeeded(tmpDir).errors.join("\n")).toMatch(/failed to parse/);
  });
});
