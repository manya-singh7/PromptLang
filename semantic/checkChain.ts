import type { Step } from "../parser/parser";
import { isParameterizedJson, parseJsonSchema } from "../parser/parser";
import { checkTypeSubtype, type SubtypeOptions } from "./typeChecker";

export interface ChainCheckResult {
  fromIndex: number;
  ok: boolean;
  message?: string;
  fix?: string;
}

/**
 * Checks compatibility between consecutive steps or DAG dependencies.
 * Returns results for each edge/join in the chain.
 */
export function checkChain(steps: Step[], options?: SubtypeOptions): ChainCheckResult[] {
  const results: ChainCheckResult[] = [];
  if (steps.length === 0) return results;

  const stepMap = new Map<string, Step>();
  const stepIndexMap = new Map<string, number>();
  steps.forEach((s, idx) => {
    stepMap.set(s.name, s);
    stepIndexMap.set(s.name, idx);
  });

  const isDag = steps.some(
    (s) =>
      (s.inputsFrom && s.inputsFrom.length > 1) ||
      (s.outputsTo && s.outputsTo.length > 1)
  );

  // If linear (or steps created manually without DAG annotations), run the classic linear check
  if (!isDag) {
    for (let i = 0; i < steps.length - 1; i++) {
      const current = steps[i]!;
      const next = steps[i + 1]!;
      checkPair(current, next, i, results, options);
    }
    return results;
  }

  // DAG Checking:
  // 1. Check fan-in joins: for each step with inputsFrom.length > 1
  const handledJoins = new Set<string>();

  for (const step of steps) {
    const depNames = step.inputsFrom || [];
    if (depNames.length > 1) {
      handledJoins.add(step.name);
      const targetIndex = stepIndexMap.get(step.name) ?? -1;
      const depSteps = depNames.map((name) => stepMap.get(name)).filter(Boolean) as Step[];

      if (isParameterizedJson(step.inType)) {
        const schema = parseJsonSchema(step.inType);
        if (schema) {
          for (const dep of depSteps) {
            const depIndex = stepIndexMap.get(dep.name) ?? -1;
            const fieldKey =
              dep.name in schema
                ? dep.name
                : dep.name.toLowerCase() in schema
                ? dep.name.toLowerCase()
                : null;

            if (!fieldKey) {
              results.push({
                fromIndex: depIndex,
                ok: false,
                message: `Fan-in contract mismatch: step "${step.name}" does not declare an input field for step "${dep.name}".`,
              });
            } else {
              const expectedField = schema[fieldKey]!;
              const sub = checkTypeSubtype(dep.outType, expectedField.rawType, options);
              if (!sub.ok) {
                results.push({
                  fromIndex: depIndex,
                  ok: false,
                  message: `Fan-in contract mismatch: step "${dep.name}" outputs "${dep.outType}", but step "${step.name}" expects "${expectedField.rawType}" for input "${fieldKey}". Field "${fieldKey}" type mismatch: expected "${expectedField.rawType}", but got "${dep.outType}".`,
                });
              } else {
                results.push({ fromIndex: depIndex, ok: true });
              }
            }
          }

          for (const requiredKey of Object.keys(schema)) {
            const provided = depSteps.some(
              (d) => d.name === requiredKey || d.name.toLowerCase() === requiredKey
            );
            if (!provided) {
              results.push({
                fromIndex: targetIndex,
                ok: false,
                message: `Fan-in contract mismatch: step "${step.name}" requires input "${requiredKey}", but no matching incoming step was provided.`,
              });
            }
          }
        }
      } else if (step.inType === "list" || step.inType === "json") {
        for (const dep of depSteps) {
          const depIndex = stepIndexMap.get(dep.name) ?? -1;
          results.push({ fromIndex: depIndex, ok: true });
        }
      } else {
        for (const dep of depSteps) {
          const depIndex = stepIndexMap.get(dep.name) ?? -1;
          const sub = checkTypeSubtype(dep.outType, step.inType, options);
          if (!sub.ok) {
            results.push({
              fromIndex: depIndex,
              ok: false,
              message: `Fan-in type mismatch: step "${dep.name}" outputs "${dep.outType}", but step "${step.name}" expects "${step.inType}".`,
            });
          } else {
            results.push({ fromIndex: depIndex, ok: true });
          }
        }
      }
    }
  }

  // 2. Check 1-to-N fan-outs and remaining 1-to-1 edges
  for (const step of steps) {
    const targets = step.outputsTo || [];
    const fromIndex = stepIndexMap.get(step.name) ?? -1;

    for (const targetName of targets) {
      const target = stepMap.get(targetName);
      if (!target) continue;

      if (handledJoins.has(target.name)) continue;

      const isFanOut = targets.length > 1;
      const sub = checkTypeSubtype(step.outType, target.inType, options);
      if (!sub.ok) {
        let detail = "";
        if (
          sub.reason &&
          (isParameterizedJson(step.outType) ||
            isParameterizedJson(target.inType) ||
            (step.outType === "json" && isParameterizedJson(target.inType)))
        ) {
          detail = ` ${sub.reason}.`;
        }
        const prefix = isFanOut ? "Fan-out type mismatch: " : "Type mismatch: ";
        results.push({
          fromIndex,
          ok: false,
          message: `${prefix}step "${step.name}" outputs "${step.outType}", but step "${target.name}" expects "${target.inType}".${detail}`,
        });
      } else {
        if (
          step.outType !== "text" &&
          (step.outMax !== undefined || target.inMax !== undefined)
        ) {
          results.push({
            fromIndex,
            ok: false,
            message: `Length limits are only allowed on text. Check steps "${step.name}" and "${target.name}".`,
          });
        } else if (step.outType === "text") {
          const outputLimit = step.outMax;
          const inputLimit = target.inMax;
          if (outputLimit === undefined && inputLimit !== undefined) {
            results.push({
              fromIndex,
              ok: false,
              message: `Step "${step.name}" has unlimited text output, but step "${target.name}" accepts at most ${inputLimit} characters.`,
            });
          } else if (
            outputLimit !== undefined &&
            inputLimit !== undefined &&
            inputLimit < outputLimit
          ) {
            results.push({
              fromIndex,
              ok: false,
              message: `Step "${step.name}" may output ${outputLimit} characters, but step "${target.name}" accepts only ${inputLimit}.`,
            });
          } else {
            results.push({ fromIndex, ok: true });
          }
        } else {
          results.push({ fromIndex, ok: true });
        }
      }
    }
  }

  return results;
}

function checkPair(
  current: Step,
  next: Step,
  i: number,
  results: ChainCheckResult[],
  options?: SubtypeOptions
): void {
  const fromType = current.outType;
  const toType = next.inType;

  // Special case: list -> text is recoverable using a conversion fix.
  if (fromType === "list" && toType === "text") {
    results.push({
      fromIndex: i,
      ok: false,
      message: `Step "${current.name}" outputs list, but step "${next.name}" expects text.`,
      fix: "list-to-text",
    });
    return;
  }

  const sub = checkTypeSubtype(fromType, toType, options);
  if (!sub.ok) {
    let detail = "";
    if (
      sub.reason &&
      (isParameterizedJson(fromType) ||
        isParameterizedJson(toType) ||
        (fromType === "json" && isParameterizedJson(toType)))
    ) {
      detail = ` ${sub.reason}.`;
    }
    results.push({
      fromIndex: i,
      ok: false,
      message: `Type mismatch: step "${current.name}" outputs "${fromType}", but step "${next.name}" expects "${toType}".${detail}`,
    });
    return;
  }

  // Only text types may have length limits.
  if (
    fromType !== "text" &&
    (current.outMax !== undefined || next.inMax !== undefined)
  ) {
    results.push({
      fromIndex: i,
      ok: false,
      message: `Length limits are only allowed on text. Check steps "${current.name}" and "${next.name}".`,
    });
    return;
  }

  // Check text output against the next step's input limit.
  if (fromType === "text") {
    const outputLimit = current.outMax;
    const inputLimit = next.inMax;

    if (outputLimit === undefined && inputLimit !== undefined) {
      results.push({
        fromIndex: i,
        ok: false,
        message: `Step "${current.name}" has unlimited text output, but step "${next.name}" accepts at most ${inputLimit} characters.`,
      });
      return;
    }

    if (
      outputLimit !== undefined &&
      inputLimit !== undefined &&
      inputLimit < outputLimit
    ) {
      results.push({
        fromIndex: i,
        ok: false,
        message: `Step "${current.name}" may output ${outputLimit} characters, but step "${next.name}" accepts only ${inputLimit}.`,
      });
      return;
    }
  }

  results.push({ fromIndex: i, ok: true });
}
