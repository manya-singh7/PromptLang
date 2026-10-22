import { readFile } from "node:fs/promises";
import type { ModelSettings, PriceSettings } from "./types.ts";

export interface RuntimeConfig {
  model: ModelSettings;
  prices: PriceSettings;
}

const SAMPLE_INPUT_RATE = 0.25;
const SAMPLE_OUTPUT_RATE = 1.5;

export async function loadRuntimeConfig(forceMock = false): Promise<RuntimeConfig> {
  await loadLocalEnv();
  const mode = forceMock ? "mock" : (process.env.PROMPTLANG_MODE ?? "mock");
  if (mode !== "mock" && mode !== "api") throw new Error("PROMPTLANG_MODE must be mock or api");

  const apiKey = process.env.OPENAI_API_KEY;
  if (mode === "api" && !apiKey) throw new Error("Set OPENAI_API_KEY before using API mode");
  const prices: PriceSettings = {
    inputUsdPerMillion: readPrice("PROMPTLANG_INPUT_USD_PER_MILLION", mode === "mock" ? SAMPLE_INPUT_RATE : undefined),
    outputUsdPerMillion: readPrice("PROMPTLANG_OUTPUT_USD_PER_MILLION", mode === "mock" ? SAMPLE_OUTPUT_RATE : undefined),
    expectedOutputCharsPerStep: readPositiveNumber("PROMPTLANG_OUTPUT_CHARS_PER_STEP", 500),
  };

  return {
    model: {
      mode,
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      model: mode === "mock" ? (process.env.OPENAI_MODEL ?? "mock") : required("OPENAI_MODEL"),
      apiKey,
    },
    prices,
  };
}

function readPrice(name: string, fallback?: number): number {
  const raw = process.env[name];
  if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(name + " must be set to zero or a positive number");
  return value;
}

function readPositiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(name + " must be a positive number");
  return value;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Set " + name + " before using API mode");
  return value;
}

async function loadLocalEnv(): Promise<void> {
  let source: string;
  try {
    source = await readFile(".env", "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const name = match[1]!;
    let value = match[2]!;
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined) process.env[name] = value;
  }
}