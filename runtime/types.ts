import type { Step } from "../parser/parser.ts";

export type PromptStep = Step & { inserted?: boolean };

export interface ChainCheck {
  fromIndex: number;
  ok: boolean;
  message?: string;
  fix?: string;
}

export interface ModelSettings {
  mode: "mock" | "api";
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface PriceSettings {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  expectedOutputCharsPerStep: number;
}