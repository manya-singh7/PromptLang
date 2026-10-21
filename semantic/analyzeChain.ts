
import type { Step } from "../parser/parser";
import { analyze } from "../parser/semantic";
import { checkTypes } from "./typeChecker";
import type { SemanticIssue } from "../parser/semantic";

/**
 * Runs existing semantic checks and type compatibility checks.
 */
export function analyzeChain(steps: Step[]): SemanticIssue[] {
  const existingIssues = analyze(steps);
  const typeIssues = checkTypes(steps);

  return [...existingIssues, ...typeIssues];
}
