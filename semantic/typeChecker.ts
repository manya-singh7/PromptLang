
import type { Step } from "../parser/parser";
import type { PromptType } from "./types";

export interface TypeCheckIssue {
  stepIndex: number;
  message: string;
}

/**
 * Checks whether each step's output type matches
 * the next step's input type.
 */
export function checkTypes(steps: Step[]): TypeCheckIssue[] {
  const issues: TypeCheckIssue[] = [];

  for (let i = 0; i < steps.length - 1; i++) {
    const currentStep = steps[i]!;
    const nextStep = steps[i + 1]!;

    if (currentStep.outType !== nextStep.inType) {
      issues.push({
        stepIndex: i + 1,
        message:
          `Type mismatch between "${currentStep.name}" and "${nextStep.name}": ` +
          `"${currentStep.name}" outputs "${currentStep.outType}", but ` +
          `"${nextStep.name}" expects "${nextStep.inType}".`,
      });
    }
  }

  return issues;
}

/**
 * Checks whether a string is one of PromptLang's supported types.
 */
export function isPromptType(type: string): type is PromptType {
  return type === "text" || type === "list" || type === "json";
}
