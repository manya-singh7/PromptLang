import type { PromptStep } from "./types.ts";

// Returns a small TS program that uses the runtime guard on every model result.
export function generateTypeScript(steps: PromptStep[], initialInput: string): string {
  const safeInput = JSON.stringify(initialInput);
  const safeSteps = JSON.stringify(steps, null, 2);
  return `import { makeApiCall, runSteps } from "./runtime.ts";
import type { ModelSettings } from "./types.ts";

const settings: ModelSettings = {
  mode: "api",
  baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  model: process.env.OPENAI_MODEL ?? "",
  apiKey: process.env.OPENAI_API_KEY ?? "",
};

if (!settings.model || !settings.apiKey) {
  throw new Error("Set OPENAI_MODEL and OPENAI_API_KEY before running this file");
}

const steps = ${safeSteps};
runSteps(steps, ${safeInput}, makeApiCall(settings))
  .then((answer) => console.log(answer))
  .catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
`;
}
