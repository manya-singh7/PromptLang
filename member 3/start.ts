import { createRunServer } from "./server.ts";
import { checkPromptLang, parsePromptLang } from "./project-adapter.ts";
import type { PriceSettings } from "./types.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before starting the PromptLang server`);
  return value;
}

function readPrice(name: string): number {
  const raw = process.env[name];
  if (raw === undefined && mode === "mock") {
    return name.includes("INPUT") ? 0.25 : 1.5;
  }
  const value = Number(raw ?? required(name));
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a zero or positive number`);
  return value;
}

const requestedMode = process.env.PROMPTLANG_MODE ?? "mock";
if (requestedMode !== "mock" && requestedMode !== "api") {
  throw new Error("PROMPTLANG_MODE must be either mock or api");
}
const mode = requestedMode;
const apiKey = process.env.OPENAI_API_KEY;
if (mode === "api" && !apiKey) throw new Error("Set OPENAI_API_KEY before using API mode");

const prices: PriceSettings = {
  inputUsdPerMillion: readPrice("PROMPTLANG_INPUT_USD_PER_MILLION"),
  outputUsdPerMillion: readPrice("PROMPTLANG_OUTPUT_USD_PER_MILLION"),
  expectedOutputCharsPerStep: Number(process.env.PROMPTLANG_OUTPUT_CHARS_PER_STEP ?? "500"),
};

const server = createRunServer(
  parsePromptLang,
  checkPromptLang,
  {
    mode,
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model: mode === "mock" ? (process.env.OPENAI_MODEL ?? "mock") : required("OPENAI_MODEL"),
    apiKey,
  },
  prices,
);

const port = Number(process.env.PORT ?? "4174");
server.listen(port, "127.0.0.1", () => {
  console.log(`PromptLang run server is listening on http://127.0.0.1:${port}`);
});
