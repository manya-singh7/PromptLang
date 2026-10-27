import type { Step } from "./parser";
import { isParameterizedJson } from "./parser";

export interface SemanticIssue {
  /** 0-based index of the offending step, or -1 for issues about the whole chain. */
  stepIndex: number;
  message: string;
}

const KNOWN_TYPES = ["text", "list", "json"];

function checkType(step: Step, index: number, type: string, issues: SemanticIssue[]): void {
  if (!KNOWN_TYPES.includes(type) && !isParameterizedJson(type)) {
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
  let hasDuplicateNames = false;

  steps.forEach((step, index) => {
    const firstIndex = firstIndexByName.get(step.name);
    if (firstIndex === undefined) {
      firstIndexByName.set(step.name, index);
    } else {
      hasDuplicateNames = true;
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

  // Dangling references and duplicate branch names
  const stepNameSet = new Set(steps.map((s) => s.name));

  steps.forEach((step, index) => {
    const seenInputs = new Set<string>();
    for (const dep of step.inputsFrom || []) {
      if (seenInputs.has(dep)) {
        issues.push({
          stepIndex: index,
          message: `Duplicate branch name "${dep}" in inputs to step "${step.name}"`,
        });
      }
      seenInputs.add(dep);

      if (!stepNameSet.has(dep)) {
        issues.push({
          stepIndex: index,
          message: `Step "${step.name}" references undefined step "${dep}" (dangling reference)`,
        });
      }
    }

    const seenOutputs = new Set<string>();
    for (const target of step.outputsTo || []) {
      if (seenOutputs.has(target)) {
        issues.push({
          stepIndex: index,
          message: `Duplicate branch name "${target}" in outputs from step "${step.name}"`,
        });
      }
      seenOutputs.add(target);

      if (!stepNameSet.has(target)) {
        issues.push({
          stepIndex: index,
          message: `Step "${step.name}" references undefined step "${target}" (dangling reference)`,
        });
      }
    }
  });

  const hasGraphAnnotations = steps.some(
    (s) => (s.inputsFrom && s.inputsFrom.length > 0) || (s.outputsTo && s.outputsTo.length > 0)
  );

  if (!hasDuplicateNames && hasGraphAnnotations) {
    // Cycle detection via topological sort (Kahn's algorithm)
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.name, (step.inputsFrom || []).length);
      adj.set(step.name, [...(step.outputsTo || [])]);
    }

    const queue: string[] = [];
    for (const [name, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(name);
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      visitedCount++;
      const neighbors = adj.get(curr) || [];
      for (const n of neighbors) {
        const currentDeg = inDegree.get(n);
        if (currentDeg !== undefined) {
          const newDeg = currentDeg - 1;
          inDegree.set(n, newDeg);
          if (newDeg === 0) queue.push(n);
        }
      }
    }

    if (visitedCount < steps.length) {
      const cyclicStepNames = steps
        .filter((s) => (inDegree.get(s.name) ?? 0) > 0)
        .map((s) => s.name);
      const firstCyclicIndex = steps.findIndex((s) => cyclicStepNames.includes(s.name));
      issues.push({
        stepIndex: firstCyclicIndex >= 0 ? firstCyclicIndex : 0,
        message: `Cycle detected: chain contains circular dependency involving step "${steps[firstCyclicIndex]?.name ?? cyclicStepNames[0]}"`,
      });
    }

    // Unreachable steps check
    if (steps.length > 1) {
      const rootSteps = steps.filter(
        (s) => (s.inputsFrom || []).length === 0 && (s.outputsTo || []).length > 0
      );
      const reachable = new Set<string>();
      const reachQueue = [...rootSteps.map((s) => s.name)];
      for (const r of reachQueue) reachable.add(r);

      while (reachQueue.length > 0) {
        const curr = reachQueue.shift()!;
        const neighbors = adj.get(curr) || [];
        for (const n of neighbors) {
          if (!reachable.has(n)) {
            reachable.add(n);
            reachQueue.push(n);
          }
        }
      }

      steps.forEach((step, index) => {
        const inCount = (step.inputsFrom || []).length;
        const outCount = (step.outputsTo || []).length;
        if (inCount === 0 && outCount === 0) {
          issues.push({
            stepIndex: index,
            message: `Step "${step.name}" is unreachable (disconnected from chain)`,
          });
        } else if (inCount > 0 && !reachable.has(step.name)) {
          issues.push({
            stepIndex: index,
            message: `Step "${step.name}" is unreachable from pipeline entry roots`,
          });
        }
      });
    }
  }

  return issues;
}
