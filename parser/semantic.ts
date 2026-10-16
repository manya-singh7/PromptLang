import type { Step } from "./parser";

export interface SemanticIssue {
  /** 0-based index of the offending step, or -1 for issues about the whole chain. */
  stepIndex: number;
  message: string;
}

const KNOWN_TYPES = ["text", "list", "json"];

function checkType(step: Step, index: number, type: string, issues: SemanticIssue[]): void {
  if (!KNOWN_TYPES.includes(type)) {
    issues.push({
      stepIndex: index,
      message: `step "${step.name}" uses unknown type "${type}" (expected text, list or json)`,
    });
  }
}

function checkLimit(
  step: Step,
  index: number,
  side: "input" | "output",
  type: string,
  max: number | undefined,
  issues: SemanticIssue[]
): void {
  if (max === undefined) return;

  if (type !== "text") {
    issues.push({
      stepIndex: index,
      message: `step "${step.name}" has a length limit on its ${side} of type "${type}" (limits are only allowed on text)`,
    });
  }
  if (!(max > 0)) {
    issues.push({
      stepIndex: index,
      message: `step "${step.name}" has an ${side} length limit of ${max} (limits must be greater than zero)`,
    });
  }
}

/**
 * Checks a parsed chain for problems the grammar alone does not catch.
 * Returns an empty array when the chain is fine; never throws.
 */
export function analyze(steps: Step[]): SemanticIssue[] {
  const issues: SemanticIssue[] = [];

  if (steps.length === 0) {
    issues.push({ stepIndex: -1, message: "the chain is empty (no steps defined)" });
    return issues;
  }

  const firstIndexByName = new Map<string, number>();

  steps.forEach((step, index) => {
    const firstIndex = firstIndexByName.get(step.name);
    if (firstIndex === undefined) {
      firstIndexByName.set(step.name, index);
    } else {
      issues.push({
        stepIndex: index,
        message: `step "${step.name}" is defined twice (steps ${firstIndex + 1} and ${index + 1})`,
      });
    }

    checkType(step, index, step.inType, issues);
    checkType(step, index, step.outType, issues);

    checkLimit(step, index, "input", step.inType, step.inMax, issues);
    checkLimit(step, index, "output", step.outType, step.outMax, issues);
  });

  return issues;
}
