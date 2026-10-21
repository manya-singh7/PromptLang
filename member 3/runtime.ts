import type { ModelSettings, PromptStep } from "./types.ts";

export type ModelCall = (step: PromptStep, input: unknown) => Promise<unknown>;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export function makeApiCall(settings: ModelSettings, onUsage?: (usage: TokenUsage) => void): ModelCall {
  if (settings.mode === "mock") {
    return async (step, input) => {
      const text = `Mock result for ${step.name}.`;
      if (step.outType === "json") return JSON.stringify({ mock: true, step: step.name });
      if (step.outType === "list") return JSON.stringify([`Mock item from ${step.name}`]);
      if (step.outMax !== undefined) return text.slice(0, step.outMax);
      return text;
    };
  }

  if (!settings.apiKey) throw new Error("Set OPENAI_API_KEY to use API mode");
  return async (step, input) => {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: settings.temperature ?? 0,
        max_tokens: settings.maxOutputTokens ?? 512,
        messages: [
          {
            role: "system",
            content: `Do the ${step.name} task. Return only the requested result. The declared output type is ${step.outType}.`,
          },
          { role: "user", content: toText(input) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`API request for step "${step.name}" failed (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    if (data.usage) {
      onUsage?.({
        inputTokens: data.usage.prompt_tokens ?? 0,
        outputTokens: data.usage.completion_tokens ?? 0,
      });
    }
    const answer = data.choices?.[0]?.message?.content;
    if (typeof answer !== "string") throw new Error(`Step "${step.name}" returned no text answer`);
    return answer;
  };
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function checkRuntimeValue(step: PromptStep, value: unknown): unknown {
  if (step.outType === "text") {
    if (typeof value !== "string") throw new Error(`Step "${step.name}" promised text but returned a different value`);
    if (step.outMax !== undefined && value.length > step.outMax) {
      throw new Error(`Step "${step.name}" returned ${value.length} characters; the limit is ${step.outMax}`);
    }
    return value;
  }

  if (step.outType === "json") {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error(`Step "${step.name}" promised JSON but its answer was not valid JSON`);
    }
  }

  if (step.outType === "list") {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* The clearer error below is enough. */ }
    }
    throw new Error(`Step "${step.name}" promised a list but did not return a JSON list`);
  }

  return value;
}

export async function runSteps(
  steps: PromptStep[],
  initialInput: unknown,
  callModel: ModelCall,
): Promise<unknown> {
  let value = initialInput;
  for (const step of steps) {
    checkInputValue(step, value);
    if (step.inType === "text" && step.inMax !== undefined && (value as string).length > step.inMax) {
      throw new Error(`Step "${step.name}" input is longer than its ${step.inMax} character limit`);
    }
    if (step.inserted && step.name.endsWith("_to_text")) {
      if (!Array.isArray(value)) throw new Error(`Adapter "${step.name}" expected a list`);
      value = JSON.stringify(value);
      continue;
    }
    value = checkRuntimeValue(step, await callModel(step, value));
  }
  return value;
}

function checkInputValue(step: PromptStep, value: unknown): void {
  if (step.inType === "text" && typeof value !== "string") {
    throw new Error(`Step "${step.name}" expects text input`);
  }
  if (step.inType === "list" && !Array.isArray(value)) {
    throw new Error(`Step "${step.name}" expects a list input`);
  }
  if (step.inType === "json" && (value === null || typeof value !== "object")) {
    throw new Error(`Step "${step.name}" expects a JSON object input`);
  }
}
