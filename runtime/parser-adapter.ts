import { parse, tokenize } from "../parser/parser.ts";
import type { PromptStep } from "./types.ts";

// Use the project tokenizer and parser. This function only connects their input/output shapes.
export function parseChainSource(source: string): PromptStep[] {
  return parse(tokenize(source));
}