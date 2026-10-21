export interface PromptStep {
  name: string;
  inType: string;
  outType: string;
  inMax?: number;
  outMax?: number;
  inserted?: boolean;
}

// B's checker can return this small object for each arrow.
export interface ChainCheck {
  fromIndex: number;
  ok: boolean;
  message?: string;
  fix?: "list-to-text";
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

