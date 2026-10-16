import * as fs from "fs";
import * as path from "path";
import { tokenize, parse, type Step } from "../parser/parser";

export interface ManifestEntry {
  file: string;
  valid: boolean;
  category: "type-mismatch" | "limit-violation" | "ok";
  errorCount: number;
  failingPairs: number[];
  note: string;
}

export interface ValidationResult {
  total: number;
  broken: number;
  valid: number;
  errors: string[];
}

export function checkSubtype(
  prevOutType: string,
  prevOutMax: number | undefined,
  nextInType: string,
  nextInMax: number | undefined
): { ok: boolean; reason?: "type-mismatch" | "limit-violation" } {
  if (prevOutType !== nextInType) {
    return { ok: false, reason: "type-mismatch" };
  }
  if (prevOutType === "text") {
    if (nextInMax !== undefined) {
      if (prevOutMax === undefined) {
        return { ok: false, reason: "limit-violation" };
      }
      if (prevOutMax > nextInMax) {
        return { ok: false, reason: "limit-violation" };
      }
    }
  }
  return { ok: true };
}

export function evaluateChain(steps: Step[]): {
  valid: boolean;
  category: "type-mismatch" | "limit-violation" | "ok";
  errorCount: number;
  failingPairs: number[];
} {
  const failingPairs: number[] = [];
  const reasons: ("type-mismatch" | "limit-violation")[] = [];

  for (let i = 0; i < steps.length - 1; i++) {
    const prev = steps[i]!;
    const next = steps[i + 1]!;
    const res = checkSubtype(prev.outType, prev.outMax, next.inType, next.inMax);
    if (!res.ok) {
      failingPairs.push(i);
      reasons.push(res.reason!);
    }
  }

  const valid = failingPairs.length === 0;
  let category: "type-mismatch" | "limit-violation" | "ok" = "ok";
  if (!valid) {
    if (reasons.every((r) => r === "limit-violation")) {
      category = "limit-violation";
    } else {
      category = "type-mismatch";
    }
  }

  return {
    valid,
    category,
    errorCount: failingPairs.length,
    failingPairs,
  };
}

export function validateSeeded(baseDir?: string): ValidationResult {
  const errors: string[] = [];
  const seededDir = baseDir || path.resolve(__dirname, "../examples/seeded");
  const manifestPath = path.join(seededDir, "manifest.json");
  const brokenDir = path.join(seededDir, "broken");
  const validDir = path.join(seededDir, "valid");

  if (!fs.existsSync(manifestPath)) {
    errors.push(`manifest.json not found at ${manifestPath}`);
    return { total: 0, broken: 0, valid: 0, errors };
  }

  let manifest: ManifestEntry[] = [];
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(raw);
    if (!Array.isArray(manifest)) {
      errors.push("manifest.json must contain an array of entries");
      return { total: 0, broken: 0, valid: 0, errors };
    }
  } catch (err) {
    errors.push(`Failed to parse manifest.json: ${(err as Error).message}`);
    return { total: 0, broken: 0, valid: 0, errors };
  }

  // Scan disk files
  const diskBrokenFiles = fs.existsSync(brokenDir)
    ? fs
        .readdirSync(brokenDir)
        .filter((f) => f.endsWith(".promptlang"))
        .map((f) => `broken/${f}`)
    : [];

  const diskValidFiles = fs.existsSync(validDir)
    ? fs
        .readdirSync(validDir)
        .filter((f) => f.endsWith(".promptlang"))
        .map((f) => `valid/${f}`)
    : [];

  const allDiskFiles = new Set([...diskBrokenFiles, ...diskValidFiles]);
  const manifestFiles = new Set(manifest.map((m) => m.file));

  // Check every file on disk is listed in manifest
  for (const f of allDiskFiles) {
    if (!manifestFiles.has(f)) {
      errors.push(`File on disk is missing from manifest: ${f}`);
    }
  }

  // Check every file in manifest exists on disk
  for (const f of manifestFiles) {
    if (!allDiskFiles.has(f)) {
      errors.push(`File in manifest does not exist on disk: ${f}`);
    }
  }

  let brokenCount = 0;
  let validCount = 0;

  for (const entry of manifest) {
    if (entry.valid) {
      validCount++;
    } else {
      brokenCount++;
    }

    const fullPath = path.join(seededDir, entry.file);
    if (!fs.existsSync(fullPath)) {
      errors.push(`File not found: ${fullPath}`);
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length !== 1) {
      errors.push(`File must be exactly ONE line: ${entry.file} has ${lines.length} lines`);
      continue;
    }

    const line = lines[0]!;
    let steps: Step[] = [];
    try {
      const tokens = tokenize(line);
      steps = parse(tokens);
    } catch (err) {
      errors.push(`File ${entry.file} failed to parse: ${(err as Error).message}`);
      continue;
    }

    if (steps.length < 2) {
      errors.push(`File ${entry.file} has fewer than 2 steps: ${steps.length}`);
    }

    // Check step names are unique single words
    const names = steps.map((s) => s.name);
    if (new Set(names).size !== names.length) {
      errors.push(`File ${entry.file} contains duplicate step names: ${names.join(", ")}`);
    }
    for (const name of names) {
      if (!/^[A-Za-z0-9_]+$/.test(name)) {
        errors.push(`File ${entry.file} contains invalid step name "${name}" (must be letters, digits, underscore)`);
      }
    }

    // Recompute subtype check
    const evaluation = evaluateChain(steps);

    if (evaluation.valid !== entry.valid) {
      errors.push(
        `File ${entry.file} validity mismatch: expected ${entry.valid}, computed ${evaluation.valid}`
      );
    }
    if (evaluation.category !== entry.category) {
      errors.push(
        `File ${entry.file} category mismatch: expected ${entry.category}, computed ${evaluation.category}`
      );
    }
    if (evaluation.errorCount !== entry.errorCount) {
      errors.push(
        `File ${entry.file} errorCount mismatch: expected ${entry.errorCount}, computed ${evaluation.errorCount}`
      );
    }
    if (JSON.stringify(evaluation.failingPairs) !== JSON.stringify(entry.failingPairs)) {
      errors.push(
        `File ${entry.file} failingPairs mismatch: expected [${entry.failingPairs.join(
          ", "
        )}], computed [${evaluation.failingPairs.join(", ")}]`
      );
    }
    if (!entry.note || typeof entry.note !== "string" || entry.note.trim().length === 0) {
      errors.push(`File ${entry.file} missing or empty note in manifest`);
    }
  }

  // Structural rules for the seeded set
  const expectCount = (label: string, actual: number, expected: number) => {
    if (actual !== expected) errors.push(`Expected ${expected} ${label}, found ${actual}`);
  };
  expectCount("files in broken/", diskBrokenFiles.length, 30);
  expectCount("files in valid/", diskValidFiles.length, 10);
  expectCount("type-mismatch entries", manifest.filter((m) => m.category === "type-mismatch").length, 15);
  expectCount("limit-violation entries", manifest.filter((m) => m.category === "limit-violation").length, 15);

  for (const f of allDiskFiles) {
    if (!/^(broken|valid)\/\d{2}_[A-Za-z0-9_]+\.promptlang$/.test(f)) {
      errors.push(`File name does not match NN_<short_reason>.promptlang: ${f}`);
    }
  }
  for (const entry of manifest) {
    const folder = entry.file.split("/")[0];
    if ((folder === "valid") !== entry.valid) {
      errors.push(`File ${entry.file} is in ${folder}/ but manifest says valid=${entry.valid}`);
    }
  }

  return {
    total: manifest.length,
    broken: brokenCount,
    valid: validCount,
    errors,
  };
}

const isCLI = Boolean(
  !process.env.VITEST &&
    process.argv[1] &&
    process.argv[1].replace(/\\/g, "/").includes("validate-seeded")
);

if (isCLI) {
  const result = validateSeeded();
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`ERROR: ${err}`);
    }
    process.exit(1);
  }
  console.log(
    `${result.total} files, ${result.broken} broken, ${result.valid} valid, all parse OK, manifest consistent`
  );
}
