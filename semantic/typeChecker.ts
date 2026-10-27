import type { Step, JsonFieldDef } from "../parser/parser";
import { isParameterizedJson, parseJsonSchema } from "../parser/parser";
import type { PromptType } from "./types";

export interface TypeCheckIssue {
  stepIndex: number;
  message: string;
}

export interface SubtypeResult {
  ok: boolean;
  reason?: string;
  field?: string;
  expected?: string;
  actual?: string;
}

export interface SubtypeOptions {
  allowGenericJson?: boolean;
}

export function checkTypeSubtype(
  fromType: string,
  toType: string,
  options?: SubtypeOptions
): SubtypeResult {
  if (fromType === toType) {
    return { ok: true };
  }

  const fromIsJson = fromType === "json" || isParameterizedJson(fromType);
  const toIsJson = toType === "json" || isParameterizedJson(toType);

  if (!fromIsJson || !toIsJson) {
    return {
      ok: false,
      reason: `Type mismatch: expected "${toType}", but got "${fromType}"`,
    };
  }

  if (fromType === "json" && isParameterizedJson(toType)) {
    if (options?.allowGenericJson) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `Generic "json" cannot satisfy typed schema "${toType}"`,
    };
  }

  if (isParameterizedJson(fromType) && toType === "json") {
    return { ok: true };
  }

  const fromSchema = parseJsonSchema(fromType);
  const toSchema = parseJsonSchema(toType);

  if (!fromSchema || !toSchema) {
    return { ok: false, reason: "Malformed json schema" };
  }

  for (const [key, targetField] of Object.entries(toSchema)) {
    if (!(key in fromSchema)) {
      return {
        ok: false,
        field: key,
        expected: targetField.rawType,
        reason: `Missing required field "${key}"`,
      };
    }

    const sourceField = fromSchema[key]!;
    const fieldMatch = checkFieldTypeCompatibility(sourceField, targetField, options);
    if (!fieldMatch.ok) {
      const fullField = fieldMatch.field ? `${key}.${fieldMatch.field}` : key;
      const expectedType = fieldMatch.expected ?? targetField.rawType;
      const actualType = fieldMatch.actual ?? sourceField.rawType;
      return {
        ok: false,
        field: fullField,
        expected: expectedType,
        actual: actualType,
        reason: `Field "${fullField}" type mismatch: expected "${expectedType}", but got "${actualType}"`,
      };
    }
  }

  return { ok: true };
}

function checkFieldTypeCompatibility(
  source: JsonFieldDef,
  target: JsonFieldDef,
  options?: SubtypeOptions
): SubtypeResult {
  if (source.rawType === target.rawType) return { ok: true };

  const scalarTypes = ["text", "string", "number", "int", "float", "boolean", "bool", "scalar"];
  if (target.rawType === "scalar" && scalarTypes.includes(source.rawType)) {
    return { ok: true };
  }
  if (
    (source.rawType === "text" && target.rawType === "string") ||
    (source.rawType === "string" && target.rawType === "text")
  ) {
    return { ok: true };
  }
  if (
    (source.rawType === "boolean" && target.rawType === "bool") ||
    (source.rawType === "bool" && target.rawType === "boolean")
  ) {
    return { ok: true };
  }
  if (source.rawType === "number" && (target.rawType === "int" || target.rawType === "float")) {
    return { ok: true };
  }

  if (target.rawType === "json" && (source.rawType === "json" || isParameterizedJson(source.rawType))) {
    return { ok: true };
  }

  if (isParameterizedJson(source.rawType) && isParameterizedJson(target.rawType)) {
    return checkTypeSubtype(source.rawType, target.rawType, options);
  }

  return {
    ok: false,
    expected: target.rawType,
    actual: source.rawType,
  };
}

/**
 * Checks whether each step's output type matches
 * the next step's input type.
 */
export function checkTypes(steps: Step[], options?: SubtypeOptions): TypeCheckIssue[] {
  const issues: TypeCheckIssue[] = [];

  for (let i = 0; i < steps.length - 1; i++) {
    const currentStep = steps[i]!;
    const nextStep = steps[i + 1]!;

    const sub = checkTypeSubtype(currentStep.outType, nextStep.inType, options);
    if (!sub.ok) {
      let detail = "";
      if (
        sub.reason &&
        (isParameterizedJson(currentStep.outType) ||
          isParameterizedJson(nextStep.inType) ||
          (currentStep.outType === "json" && isParameterizedJson(nextStep.inType)))
      ) {
        detail = ` ${sub.reason}.`;
      }
      issues.push({
        stepIndex: i + 1,
        message:
          `Type mismatch between "${currentStep.name}" and "${nextStep.name}": ` +
          `"${currentStep.name}" outputs "${currentStep.outType}", but ` +
          `"${nextStep.name}" expects "${nextStep.inType}".${detail}`,
      });
    }
  }

  return issues;
}

/**
 * Checks whether a string is one of PromptLang's supported types.
 */
export function isPromptType(type: string): type is PromptType {
  return type === "text" || type === "list" || type === "json" || isParameterizedJson(type);
}
