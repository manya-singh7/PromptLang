"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // parser/parser.ts
  function isParameterizedJson(type) {
    return typeof type === "string" && type.startsWith("json{") && type.endsWith("}");
  }
  function parseJsonSchema(typeStr) {
    if (!isParameterizedJson(typeStr)) return null;
    const inner = typeStr.slice(5, -1).trim();
    if (inner.length === 0) return {};
    const fields = {};
    const fieldStrings = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === "," && depth === 0) {
        const part = inner.slice(start, i).trim();
        if (part.length > 0) fieldStrings.push(part);
        start = i + 1;
      }
    }
    const lastPart = inner.slice(start).trim();
    if (lastPart.length > 0) fieldStrings.push(lastPart);
    for (const fieldStr of fieldStrings) {
      const colonIdx = fieldStr.indexOf(":");
      if (colonIdx === -1) return null;
      const key = fieldStr.slice(0, colonIdx).trim();
      const rawType = fieldStr.slice(colonIdx + 1).trim();
      if (!key || !rawType) return null;
      if (isParameterizedJson(rawType)) {
        const nested = parseJsonSchema(rawType);
        if (!nested) return null;
        fields[key] = { rawType, schema: nested };
      } else {
        fields[key] = { rawType };
      }
    }
    return fields;
  }
  function tokenize(source) {
    const tokens = [];
    const words = source.replace(/->/g, " -> ").replace(/:/g, " : ").replace(/,/g, " , ").replace(/=/g, " = ").replace(/\[/g, " [ ").replace(/\]/g, " ] ").replace(/\{/g, " { ").replace(/\}/g, " } ").replace(/\(/g, " ( ").replace(/\)/g, " ) ").replace(/;/g, " ; ").split(/\s+/).filter((w) => w.length > 0);
    const types = ["text", "list", "json"];
    for (const word of words) {
      if (word === "step") tokens.push({ type: "KEYWORD", value: word });
      else if (word === "max") tokens.push({ type: "KEYWORD", value: word });
      else if (word === "->") tokens.push({ type: "ARROW", value: word });
      else if (word === ":") tokens.push({ type: "COLON", value: word });
      else if (word === ",") tokens.push({ type: "COMMA", value: word });
      else if (word === "=") tokens.push({ type: "EQUALS", value: word });
      else if (word === "[") tokens.push({ type: "LBRACKET", value: word });
      else if (word === "]") tokens.push({ type: "RBRACKET", value: word });
      else if (word === "{") tokens.push({ type: "LBRACE", value: word });
      else if (word === "}") tokens.push({ type: "RBRACE", value: word });
      else if (word === "(") tokens.push({ type: "LPAREN", value: word });
      else if (word === ")") tokens.push({ type: "RPAREN", value: word });
      else if (word === ";") tokens.push({ type: "SEMICOLON", value: word });
      else if (types.includes(word)) tokens.push({ type: "TYPE", value: word });
      else if (word === "in" || word === "out" || word === "from") tokens.push({ type: "PARAM", value: word });
      else if (/^-?\d+$/.test(word)) tokens.push({ type: "NUMBER", value: word });
      else tokens.push({ type: "IDENTIFIER", value: word });
    }
    return tokens;
  }
  function expect(tokens, pos, type) {
    if (!tokens[pos] || tokens[pos].type !== type) {
      const got = tokens[pos] ? `${tokens[pos].type} ("${tokens[pos].value}")` : "end of input";
      throw new ParseError(`Expected ${type} at token ${pos}, but got ${got}`);
    }
  }
  function parseFieldValueType(tokens, pos) {
    if (!tokens[pos]) {
      throw new ParseError(`Expected field type at token ${pos}, but got end of input`);
    }
    const token = tokens[pos];
    if (token.value === "json") {
      pos++;
      if (tokens[pos] && (tokens[pos].type === "LBRACE" || tokens[pos].value === "{")) {
        return parseJsonRecordType(tokens, pos);
      }
      return { type: "json", nextPos: pos };
    }
    const allowedFieldTypes = [
      "text",
      "list",
      "number",
      "boolean",
      "bool",
      "scalar",
      "string",
      "int",
      "float"
    ];
    if (allowedFieldTypes.includes(token.value)) {
      pos++;
      return { type: token.value, nextPos: pos };
    }
    throw new ParseError(
      `Unknown field type "${token.value}" at token ${pos}. Expected text, list, or another scalar.`
    );
  }
  function parseJsonRecordType(tokens, pos) {
    const bracePos = pos;
    pos++;
    const fields = [];
    if (tokens[pos] && (tokens[pos].type === "RBRACE" || tokens[pos].value === "}")) {
      pos++;
      return { type: "json{}", nextPos: pos };
    }
    while (pos < tokens.length) {
      if (!tokens[pos]) {
        throw new ParseError(`Unclosed "{" in json schema at token ${bracePos}: unexpected end of input`);
      }
      if (tokens[pos].type === "PARAM" && (tokens[pos].value === "in" || tokens[pos].value === "out") && tokens[pos + 1]?.type === "EQUALS") {
        throw new ParseError(`Missing closing "}" for json schema at token ${pos}`);
      }
      if (tokens[pos].type === "ARROW") {
        throw new ParseError(`Missing closing "}" for json schema at token ${pos}`);
      }
      const keyToken = tokens[pos];
      if (keyToken.type !== "IDENTIFIER" && keyToken.type !== "PARAM" && keyToken.type !== "KEYWORD" && keyToken.type !== "TYPE") {
        throw new ParseError(
          `Expected field key in json schema at token ${pos}, but got ${keyToken.type} ("${keyToken.value}")`
        );
      }
      const key = keyToken.value;
      pos++;
      if (!tokens[pos] || tokens[pos].type !== "COLON") {
        const got = tokens[pos] ? `${tokens[pos].type} ("${tokens[pos].value}")` : "end of input";
        throw new ParseError(`Expected ":" after field "${key}" in json schema at token ${pos}, but got ${got}`);
      }
      pos++;
      const fieldTypeResult = parseFieldValueType(tokens, pos);
      fields.push({ key, type: fieldTypeResult.type });
      pos = fieldTypeResult.nextPos;
      if (!tokens[pos]) {
        throw new ParseError(`Unclosed "{" in json schema: expected "," or "}" at token ${pos}, but got end of input`);
      }
      if (tokens[pos].type === "COMMA" || tokens[pos].value === ",") {
        pos++;
        if (tokens[pos] && (tokens[pos].type === "RBRACE" || tokens[pos].value === "}")) {
          pos++;
          break;
        }
      } else if (tokens[pos].type === "RBRACE" || tokens[pos].value === "}") {
        pos++;
        break;
      } else {
        const got = `${tokens[pos].type} ("${tokens[pos].value}")`;
        throw new ParseError(`Expected "," or "}" in json schema at token ${pos}, but got ${got}`);
      }
    }
    const typeStr = `json{${fields.map((f) => `${f.key}:${f.type}`).join(",")}}`;
    return { type: typeStr, nextPos: pos };
  }
  function parseTypeWithLimit(tokens, pos) {
    if (tokens[pos] && tokens[pos].type === "IDENTIFIER") {
      throw new ParseError(`Unknown type "${tokens[pos].value}". Expected text, list or json.`);
    }
    expect(tokens, pos, "TYPE");
    let typeName = tokens[pos].value;
    pos++;
    if (typeName === "json" && tokens[pos] && (tokens[pos].type === "LBRACE" || tokens[pos].value === "{")) {
      const recordResult = parseJsonRecordType(tokens, pos);
      typeName = recordResult.type;
      pos = recordResult.nextPos;
    }
    if (tokens[pos] && (tokens[pos].type === "LBRACKET" || tokens[pos].value === "[")) {
      if (typeName !== "text") {
        throw new ParseError(
          `Length limits are only allowed on "text" type, but got "${typeName}" at token ${pos}`
        );
      }
      pos++;
      if (!tokens[pos] || tokens[pos].value === "]") {
        throw new ParseError(`Missing "max" in length limit at token ${pos}`);
      }
      if (tokens[pos].value !== "max") {
        throw new ParseError(
          `Expected "max" in length limit at token ${pos}, but got "${tokens[pos].value}"`
        );
      }
      pos++;
      if (!tokens[pos] || tokens[pos].value === "]") {
        throw new ParseError(`Missing length limit number after "max" at token ${pos}`);
      }
      const numToken = tokens[pos];
      const rawVal = numToken.value;
      if (!/^-?\d+$/.test(rawVal)) {
        throw new ParseError(
          `Expected numeric length limit after "max", but got non-numeric "${rawVal}" at token ${pos}`
        );
      }
      const num = Number(rawVal);
      if (num === 0) {
        throw new ParseError(`Length limit must be greater than zero, but got 0 at token ${pos}`);
      }
      if (num < 0) {
        throw new ParseError(
          `Length limit must be greater than zero, but got negative number ${num} at token ${pos}`
        );
      }
      pos++;
      if (!tokens[pos] || tokens[pos].type !== "RBRACKET" && tokens[pos].value !== "]") {
        const got = tokens[pos] ? `${tokens[pos].type} ("${tokens[pos].value}")` : "end of input";
        throw new ParseError(`Missing closing "]" after length limit at token ${pos}, but got ${got}`);
      }
      pos++;
      return { type: typeName, max: num, nextPos: pos };
    }
    return { type: typeName, nextPos: pos };
  }
  function createStep(name, inType = "", outType = "", inMax, outMax) {
    const step = { name, inType, outType };
    if (inMax !== void 0) step.inMax = inMax;
    if (outMax !== void 0) step.outMax = outMax;
    const inputsFrom = [];
    const outputsTo = [];
    Object.defineProperty(step, "inputsFrom", {
      value: inputsFrom,
      enumerable: false,
      writable: true,
      configurable: true
    });
    Object.defineProperty(step, "outputsTo", {
      value: outputsTo,
      enumerable: false,
      writable: true,
      configurable: true
    });
    return step;
  }
  function parseSingleStep(tokens, pos, allowBareIdentifier, stepMap, steps) {
    if (!tokens[pos]) {
      throw new ParseError(`Expected step at token ${pos}, but got end of input`);
    }
    if (tokens[pos].type === "KEYWORD" && tokens[pos].value === "step") {
      pos++;
      expect(tokens, pos, "IDENTIFIER");
      const name = tokens[pos].value;
      pos++;
      if (tokens[pos] && tokens[pos].type === "COLON") {
        pos++;
        expect(tokens, pos, "PARAM");
        if (tokens[pos].value !== "in") {
          throw new ParseError(`Expected "in" but got "${tokens[pos].value}" at token ${pos}`);
        }
        pos++;
        expect(tokens, pos, "EQUALS");
        pos++;
        const inParsed = parseTypeWithLimit(tokens, pos);
        const inType = inParsed.type;
        const inMax = inParsed.max;
        pos = inParsed.nextPos;
        expect(tokens, pos, "COMMA");
        pos++;
        expect(tokens, pos, "PARAM");
        if (tokens[pos].value !== "out") {
          throw new ParseError(`Expected "out" but got "${tokens[pos].value}" at token ${pos}`);
        }
        pos++;
        expect(tokens, pos, "EQUALS");
        pos++;
        const outParsed = parseTypeWithLimit(tokens, pos);
        const outType = outParsed.type;
        const outMax = outParsed.max;
        pos = outParsed.nextPos;
        const explicitFrom = [];
        if (tokens[pos] && tokens[pos].type === "COMMA" && tokens[pos + 1]?.value === "from") {
          pos += 2;
          expect(tokens, pos, "EQUALS");
          pos++;
          if (tokens[pos] && tokens[pos].type === "LPAREN") {
            pos++;
            while (pos < tokens.length && tokens[pos].type !== "RPAREN") {
              if (tokens[pos].type === "KEYWORD" && tokens[pos].value === "step") pos++;
              expect(tokens, pos, "IDENTIFIER");
              explicitFrom.push(tokens[pos].value);
              pos++;
              if (tokens[pos] && tokens[pos].type === "COMMA") pos++;
            }
            expect(tokens, pos, "RPAREN");
            pos++;
          } else {
            while (pos < tokens.length && (tokens[pos].type === "IDENTIFIER" || tokens[pos].type === "KEYWORD" && tokens[pos].value === "step")) {
              if (tokens[pos].type === "KEYWORD" && tokens[pos].value === "step") pos++;
              explicitFrom.push(tokens[pos].value);
              pos++;
              if (tokens[pos] && tokens[pos].type === "COMMA" && tokens[pos + 1]?.type === "IDENTIFIER") {
                pos++;
              } else {
                break;
              }
            }
          }
        }
        const step = createStep(name, inType, outType, inMax, outMax);
        steps.push(step);
        stepMap.set(name, step);
        if (explicitFrom.length > 0) {
          for (const fromName of explicitFrom) {
            if (!step.inputsFrom.includes(fromName)) step.inputsFrom.push(fromName);
            let fromStep = stepMap.get(fromName);
            if (!fromStep) {
              fromStep = createStep(fromName);
              stepMap.set(fromName, fromStep);
              steps.push(fromStep);
            }
            if (!fromStep.outputsTo.includes(name)) fromStep.outputsTo.push(name);
          }
        }
        return { name, nextPos: pos };
      } else {
        if (tokens[pos] && tokens[pos].type === "PARAM" && tokens[pos].value === "in") {
          throw new ParseError(
            `Expected COLON at token ${pos}, but got ${tokens[pos].type} ("${tokens[pos].value}")`
          );
        }
        let step = stepMap.get(name);
        if (!step) {
          step = createStep(name);
          stepMap.set(name, step);
          steps.push(step);
        }
        return { name, nextPos: pos };
      }
    } else {
      if (!allowBareIdentifier) {
        expect(tokens, pos, "KEYWORD");
        if (tokens[pos].value !== "step") {
          throw new ParseError(`Expected "step" but got "${tokens[pos].value}" at token ${pos}`);
        }
      }
      expect(tokens, pos, "IDENTIFIER");
      const name = tokens[pos].value;
      pos++;
      if (tokens[pos] && tokens[pos].type === "COLON") {
        pos++;
        expect(tokens, pos, "PARAM");
        if (tokens[pos].value !== "in") {
          throw new ParseError(`Expected "in" but got "${tokens[pos].value}" at token ${pos}`);
        }
        pos++;
        expect(tokens, pos, "EQUALS");
        pos++;
        const inParsed = parseTypeWithLimit(tokens, pos);
        const inType = inParsed.type;
        const inMax = inParsed.max;
        pos = inParsed.nextPos;
        expect(tokens, pos, "COMMA");
        pos++;
        expect(tokens, pos, "PARAM");
        if (tokens[pos].value !== "out") {
          throw new ParseError(`Expected "out" but got "${tokens[pos].value}" at token ${pos}`);
        }
        pos++;
        expect(tokens, pos, "EQUALS");
        pos++;
        const outParsed = parseTypeWithLimit(tokens, pos);
        const outType = outParsed.type;
        const outMax = outParsed.max;
        pos = outParsed.nextPos;
        const step = createStep(name, inType, outType, inMax, outMax);
        steps.push(step);
        stepMap.set(name, step);
        return { name, nextPos: pos };
      } else {
        let step = stepMap.get(name);
        if (!step) {
          step = createStep(name);
          stepMap.set(name, step);
          steps.push(step);
        }
        return { name, nextPos: pos };
      }
    }
  }
  function parseGroup(tokens, pos, stepMap, steps) {
    if (tokens[pos] && tokens[pos].type === "LPAREN") {
      pos++;
      const names = [];
      while (pos < tokens.length && tokens[pos].type !== "RPAREN") {
        const parsed = parseSingleStep(tokens, pos, true, stepMap, steps);
        names.push(parsed.name);
        pos = parsed.nextPos;
        if (tokens[pos] && tokens[pos].type === "COMMA") {
          pos++;
        } else if (tokens[pos] && tokens[pos].type === "RPAREN") {
          break;
        } else {
          const got = tokens[pos] ? `${tokens[pos].type} ("${tokens[pos].value}")` : "end of input";
          throw new ParseError(`Expected "," or ")" in step group at token ${pos}, but got ${got}`);
        }
      }
      if (!tokens[pos] || tokens[pos].type !== "RPAREN") {
        throw new ParseError(`Missing closing ")" for step group at token ${pos}`);
      }
      pos++;
      return { names, nextPos: pos };
    } else {
      const parsed = parseSingleStep(tokens, pos, false, stepMap, steps);
      return { names: [parsed.name], nextPos: parsed.nextPos };
    }
  }
  function parse(tokens) {
    const steps = [];
    const stepMap = /* @__PURE__ */ new Map();
    let pos = 0;
    while (pos < tokens.length) {
      if (tokens[pos].type === "SEMICOLON") {
        pos++;
        continue;
      }
      let currentGroup = parseGroup(tokens, pos, stepMap, steps);
      pos = currentGroup.nextPos;
      while (pos < tokens.length && tokens[pos].type === "ARROW") {
        pos++;
        if (pos >= tokens.length) {
          throw new ParseError(
            `Unexpected end of input after "->" at token ${pos} \u2014 a step was expected after the arrow`
          );
        }
        const nextGroup = parseGroup(tokens, pos, stepMap, steps);
        pos = nextGroup.nextPos;
        for (const sourceName of currentGroup.names) {
          const sourceStep = stepMap.get(sourceName);
          for (const targetName of nextGroup.names) {
            const targetStep = stepMap.get(targetName);
            if (sourceStep && !sourceStep.outputsTo.includes(targetName)) {
              sourceStep.outputsTo.push(targetName);
            }
            if (targetStep && !targetStep.inputsFrom.includes(sourceName)) {
              targetStep.inputsFrom.push(sourceName);
            }
          }
        }
        currentGroup = nextGroup;
      }
      if (pos < tokens.length && tokens[pos].type !== "SEMICOLON") {
        throw new ParseError(`Expected -> or end of input at token ${pos}`);
      }
    }
    Object.defineProperty(steps, "graph", {
      value: {
        steps,
        dependencies: new Map(steps.map((s) => [s.name, s.inputsFrom || []])),
        dependents: new Map(steps.map((s) => [s.name, s.outputsTo || []]))
      },
      enumerable: false,
      writable: true,
      configurable: true
    });
    return steps;
  }
  var ParseError;
  var init_parser = __esm({
    "parser/parser.ts"() {
      "use strict";
      ParseError = class extends Error {
      };
    }
  });

  // parser/semantic.ts
  function checkType(step, index, type, issues) {
    if (!KNOWN_TYPES.includes(type) && !isParameterizedJson(type)) {
      issues.push({
        stepIndex: index,
        message: `step "${step.name}" uses unknown type "${type}" (expected text, list or json)`
      });
    }
  }
  function checkLimit(step, index, side, type, max, issues) {
    if (max === void 0) return;
    if (type !== "text") {
      issues.push({
        stepIndex: index,
        message: `step "${step.name}" has a length limit on its ${side} of type "${type}" (limits are only allowed on text)`
      });
    }
    if (!(max > 0)) {
      issues.push({
        stepIndex: index,
        message: `step "${step.name}" has an ${side} length limit of ${max} (limits must be greater than zero)`
      });
    }
  }
  function analyze(steps) {
    const issues = [];
    if (steps.length === 0) {
      issues.push({ stepIndex: -1, message: "the chain is empty (no steps defined)" });
      return issues;
    }
    const firstIndexByName = /* @__PURE__ */ new Map();
    let hasDuplicateNames = false;
    steps.forEach((step, index) => {
      const firstIndex = firstIndexByName.get(step.name);
      if (firstIndex === void 0) {
        firstIndexByName.set(step.name, index);
      } else {
        hasDuplicateNames = true;
        issues.push({
          stepIndex: index,
          message: `step "${step.name}" is defined twice (steps ${firstIndex + 1} and ${index + 1})`
        });
      }
      checkType(step, index, step.inType, issues);
      checkType(step, index, step.outType, issues);
      checkLimit(step, index, "input", step.inType, step.inMax, issues);
      checkLimit(step, index, "output", step.outType, step.outMax, issues);
    });
    const stepNameSet = new Set(steps.map((s) => s.name));
    steps.forEach((step, index) => {
      const seenInputs = /* @__PURE__ */ new Set();
      for (const dep of step.inputsFrom || []) {
        if (seenInputs.has(dep)) {
          issues.push({
            stepIndex: index,
            message: `Duplicate branch name "${dep}" in inputs to step "${step.name}"`
          });
        }
        seenInputs.add(dep);
        if (!stepNameSet.has(dep)) {
          issues.push({
            stepIndex: index,
            message: `Step "${step.name}" references undefined step "${dep}" (dangling reference)`
          });
        }
      }
      const seenOutputs = /* @__PURE__ */ new Set();
      for (const target of step.outputsTo || []) {
        if (seenOutputs.has(target)) {
          issues.push({
            stepIndex: index,
            message: `Duplicate branch name "${target}" in outputs from step "${step.name}"`
          });
        }
        seenOutputs.add(target);
        if (!stepNameSet.has(target)) {
          issues.push({
            stepIndex: index,
            message: `Step "${step.name}" references undefined step "${target}" (dangling reference)`
          });
        }
      }
    });
    const hasGraphAnnotations = steps.some(
      (s) => s.inputsFrom && s.inputsFrom.length > 0 || s.outputsTo && s.outputsTo.length > 0
    );
    if (!hasDuplicateNames && hasGraphAnnotations) {
      const inDegree = /* @__PURE__ */ new Map();
      const adj = /* @__PURE__ */ new Map();
      for (const step of steps) {
        inDegree.set(step.name, (step.inputsFrom || []).length);
        adj.set(step.name, [...step.outputsTo || []]);
      }
      const queue = [];
      for (const [name, deg] of inDegree.entries()) {
        if (deg === 0) queue.push(name);
      }
      let visitedCount = 0;
      while (queue.length > 0) {
        const curr = queue.shift();
        visitedCount++;
        const neighbors = adj.get(curr) || [];
        for (const n of neighbors) {
          const currentDeg = inDegree.get(n);
          if (currentDeg !== void 0) {
            const newDeg = currentDeg - 1;
            inDegree.set(n, newDeg);
            if (newDeg === 0) queue.push(n);
          }
        }
      }
      if (visitedCount < steps.length) {
        const cyclicStepNames = steps.filter((s) => (inDegree.get(s.name) ?? 0) > 0).map((s) => s.name);
        const firstCyclicIndex = steps.findIndex((s) => cyclicStepNames.includes(s.name));
        issues.push({
          stepIndex: firstCyclicIndex >= 0 ? firstCyclicIndex : 0,
          message: `Cycle detected: chain contains circular dependency involving step "${steps[firstCyclicIndex]?.name ?? cyclicStepNames[0]}"`
        });
      }
      if (steps.length > 1) {
        const rootSteps = steps.filter(
          (s) => (s.inputsFrom || []).length === 0 && (s.outputsTo || []).length > 0
        );
        const reachable = /* @__PURE__ */ new Set();
        const reachQueue = [...rootSteps.map((s) => s.name)];
        for (const r of reachQueue) reachable.add(r);
        while (reachQueue.length > 0) {
          const curr = reachQueue.shift();
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
              message: `Step "${step.name}" is unreachable (disconnected from chain)`
            });
          } else if (inCount > 0 && !reachable.has(step.name)) {
            issues.push({
              stepIndex: index,
              message: `Step "${step.name}" is unreachable from pipeline entry roots`
            });
          }
        });
      }
    }
    return issues;
  }
  var KNOWN_TYPES;
  var init_semantic = __esm({
    "parser/semantic.ts"() {
      "use strict";
      init_parser();
      KNOWN_TYPES = ["text", "list", "json"];
    }
  });

  // semantic/typeChecker.ts
  function checkTypeSubtype(fromType, toType, options) {
    if (fromType === toType) {
      return { ok: true };
    }
    const fromIsJson = fromType === "json" || isParameterizedJson(fromType);
    const toIsJson = toType === "json" || isParameterizedJson(toType);
    if (!fromIsJson || !toIsJson) {
      return {
        ok: false,
        reason: `Type mismatch: expected "${toType}", but got "${fromType}"`
      };
    }
    if (fromType === "json" && isParameterizedJson(toType)) {
      if (options?.allowGenericJson) {
        return { ok: true };
      }
      return {
        ok: false,
        reason: `Generic "json" cannot satisfy typed schema "${toType}"`
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
          reason: `Missing required field "${key}"`
        };
      }
      const sourceField = fromSchema[key];
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
          reason: `Field "${fullField}" type mismatch: expected "${expectedType}", but got "${actualType}"`
        };
      }
    }
    return { ok: true };
  }
  function checkFieldTypeCompatibility(source, target, options) {
    if (source.rawType === target.rawType) return { ok: true };
    const scalarTypes = ["text", "string", "number", "int", "float", "boolean", "bool", "scalar"];
    if (target.rawType === "scalar" && scalarTypes.includes(source.rawType)) {
      return { ok: true };
    }
    if (source.rawType === "text" && target.rawType === "string" || source.rawType === "string" && target.rawType === "text") {
      return { ok: true };
    }
    if (source.rawType === "boolean" && target.rawType === "bool" || source.rawType === "bool" && target.rawType === "boolean") {
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
      actual: source.rawType
    };
  }
  var init_typeChecker = __esm({
    "semantic/typeChecker.ts"() {
      "use strict";
      init_parser();
    }
  });

  // semantic/checkChain.ts
  function checkChain(steps, options) {
    const results = [];
    if (steps.length === 0) return results;
    const stepMap = /* @__PURE__ */ new Map();
    const stepIndexMap = /* @__PURE__ */ new Map();
    steps.forEach((s, idx) => {
      stepMap.set(s.name, s);
      stepIndexMap.set(s.name, idx);
    });
    const isDag = steps.some(
      (s) => s.inputsFrom && s.inputsFrom.length > 1 || s.outputsTo && s.outputsTo.length > 1
    );
    if (!isDag) {
      for (let i = 0; i < steps.length - 1; i++) {
        const current = steps[i];
        const next = steps[i + 1];
        checkPair(current, next, i, results, options);
      }
      return results;
    }
    const handledJoins = /* @__PURE__ */ new Set();
    for (const step of steps) {
      const depNames = step.inputsFrom || [];
      if (depNames.length > 1) {
        handledJoins.add(step.name);
        const targetIndex = stepIndexMap.get(step.name) ?? -1;
        const depSteps = depNames.map((name) => stepMap.get(name)).filter(Boolean);
        if (isParameterizedJson(step.inType)) {
          const schema = parseJsonSchema(step.inType);
          if (schema) {
            for (const dep of depSteps) {
              const depIndex = stepIndexMap.get(dep.name) ?? -1;
              const fieldKey = dep.name in schema ? dep.name : dep.name.toLowerCase() in schema ? dep.name.toLowerCase() : null;
              if (!fieldKey) {
                results.push({
                  fromIndex: depIndex,
                  ok: false,
                  message: `Fan-in contract mismatch: step "${step.name}" does not declare an input field for step "${dep.name}".`
                });
              } else {
                const expectedField = schema[fieldKey];
                const sub = checkTypeSubtype(dep.outType, expectedField.rawType, options);
                if (!sub.ok) {
                  results.push({
                    fromIndex: depIndex,
                    ok: false,
                    message: `Fan-in contract mismatch: step "${dep.name}" outputs "${dep.outType}", but step "${step.name}" expects "${expectedField.rawType}" for input "${fieldKey}". Field "${fieldKey}" type mismatch: expected "${expectedField.rawType}", but got "${dep.outType}".`
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
                  message: `Fan-in contract mismatch: step "${step.name}" requires input "${requiredKey}", but no matching incoming step was provided.`
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
                message: `Fan-in type mismatch: step "${dep.name}" outputs "${dep.outType}", but step "${step.name}" expects "${step.inType}".`
              });
            } else {
              results.push({ fromIndex: depIndex, ok: true });
            }
          }
        }
      }
    }
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
          if (sub.reason && (isParameterizedJson(step.outType) || isParameterizedJson(target.inType) || step.outType === "json" && isParameterizedJson(target.inType))) {
            detail = ` ${sub.reason}.`;
          }
          const prefix = isFanOut ? "Fan-out type mismatch: " : "Type mismatch: ";
          results.push({
            fromIndex,
            ok: false,
            message: `${prefix}step "${step.name}" outputs "${step.outType}", but step "${target.name}" expects "${target.inType}".${detail}`
          });
        } else {
          if (step.outType !== "text" && (step.outMax !== void 0 || target.inMax !== void 0)) {
            results.push({
              fromIndex,
              ok: false,
              message: `Length limits are only allowed on text. Check steps "${step.name}" and "${target.name}".`
            });
          } else if (step.outType === "text") {
            const outputLimit = step.outMax;
            const inputLimit = target.inMax;
            if (outputLimit === void 0 && inputLimit !== void 0) {
              results.push({
                fromIndex,
                ok: false,
                message: `Step "${step.name}" has unlimited text output, but step "${target.name}" accepts at most ${inputLimit} characters.`
              });
            } else if (outputLimit !== void 0 && inputLimit !== void 0 && inputLimit < outputLimit) {
              results.push({
                fromIndex,
                ok: false,
                message: `Step "${step.name}" may output ${outputLimit} characters, but step "${target.name}" accepts only ${inputLimit}.`
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
  function checkPair(current, next, i, results, options) {
    const fromType = current.outType;
    const toType = next.inType;
    if (fromType === "list" && toType === "text") {
      results.push({
        fromIndex: i,
        ok: false,
        message: `Step "${current.name}" outputs list, but step "${next.name}" expects text.`,
        fix: "list-to-text"
      });
      return;
    }
    const sub = checkTypeSubtype(fromType, toType, options);
    if (!sub.ok) {
      let detail = "";
      if (sub.reason && (isParameterizedJson(fromType) || isParameterizedJson(toType) || fromType === "json" && isParameterizedJson(toType))) {
        detail = ` ${sub.reason}.`;
      }
      results.push({
        fromIndex: i,
        ok: false,
        message: `Type mismatch: step "${current.name}" outputs "${fromType}", but step "${next.name}" expects "${toType}".${detail}`
      });
      return;
    }
    if (fromType !== "text" && (current.outMax !== void 0 || next.inMax !== void 0)) {
      results.push({
        fromIndex: i,
        ok: false,
        message: `Length limits are only allowed on text. Check steps "${current.name}" and "${next.name}".`
      });
      return;
    }
    if (fromType === "text") {
      const outputLimit = current.outMax;
      const inputLimit = next.inMax;
      if (outputLimit === void 0 && inputLimit !== void 0) {
        results.push({
          fromIndex: i,
          ok: false,
          message: `Step "${current.name}" has unlimited text output, but step "${next.name}" accepts at most ${inputLimit} characters.`
        });
        return;
      }
      if (outputLimit !== void 0 && inputLimit !== void 0 && inputLimit < outputLimit) {
        results.push({
          fromIndex: i,
          ok: false,
          message: `Step "${current.name}" may output ${outputLimit} characters, but step "${next.name}" accepts only ${inputLimit}.`
        });
        return;
      }
    }
    results.push({ fromIndex: i, ok: true });
  }
  var init_checkChain = __esm({
    "semantic/checkChain.ts"() {
      "use strict";
      init_parser();
      init_typeChecker();
    }
  });

  // web/check.ts
  var init_check = __esm({
    "web/check.ts"() {
      "use strict";
      init_checkChain();
    }
  });

  // web/app.ts
  var require_app = __commonJS({
    "web/app.ts"() {
      init_parser();
      init_semantic();
      init_check();
      function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
      }
      function initApp() {
        const sourceInput = document.getElementById("source-input");
        const checkBtn = document.getElementById("check-btn");
        const errorContainer = document.getElementById("error-container");
        const errorMessage = document.getElementById("error-message");
        const errorTitle = errorContainer?.querySelector(".error-title");
        const visualizationSection = document.getElementById("visualization-section");
        const chainSummary = document.getElementById("chain-summary");
        const chainFlow = document.getElementById("chain-flow");
        const chainStatus = document.getElementById("chain-status");
        const loadValidBtn = document.getElementById("load-valid-btn");
        const loadBrokenBtn = document.getElementById("load-broken-btn");
        const loadLimitsBtn = document.getElementById("load-limits-btn");
        if (!sourceInput || !checkBtn || !errorContainer || !errorMessage || !chainFlow) {
          console.error("Missing required DOM elements");
          return;
        }
        const VALID_EXAMPLE = "step summarize: in=text, out=text -> step translate: in=text, out=text -> step format: in=text, out=list";
        const BROKEN_EXAMPLE = "step summarize: in=text, out=text -> step format: in=text, out=list -> step email: in=text, out=text";
        const LIMITS_EXAMPLE = "step shorten: in=text, out=text[max 280] -> step translate: in=text[max 1000], out=text";
        function showErrorTitle(title) {
          if (errorTitle) errorTitle.innerHTML = `<span>\u274C</span> ${escapeHtml(title)}`;
        }
        function render() {
          const source = sourceInput.value.trim();
          if (!source) {
            errorContainer.style.display = "none";
            if (visualizationSection) visualizationSection.style.display = "block";
            if (chainSummary) chainSummary.style.display = "none";
            chainFlow.style.display = "block";
            chainFlow.innerHTML = `
        <div class="empty-state">
          Enter PromptLang code above and click <strong>Check</strong> to visualize the chain.
        </div>
      `;
            if (chainStatus) {
              chainStatus.className = "chain-status-badge";
              chainStatus.textContent = "Waiting for input";
              chainStatus.style.display = "inline-flex";
            }
            return;
          }
          try {
            const tokens = tokenize(source);
            const t0 = performance.now();
            const steps = parse(tokens);
            const issues = analyze(steps);
            if (issues.length > 0) {
              if (chainSummary) chainSummary.style.display = "none";
              showErrorTitle(issues.length === 1 ? "Semantic Error" : `${issues.length} Semantic Errors`);
              errorContainer.style.display = "block";
              errorMessage.innerHTML = issues.map((issue) => `<div>${escapeHtml(issue.message)}</div>`).join("");
              if (visualizationSection) visualizationSection.style.display = "none";
              chainFlow.innerHTML = "";
              return;
            }
            const checkResults = checkChain(steps);
            const t1 = performance.now();
            const elapsedMs = (t1 - t0).toFixed(1);
            errorContainer.style.display = "none";
            if (visualizationSection) visualizationSection.style.display = "block";
            chainFlow.style.display = "flex";
            chainFlow.innerHTML = "";
            if (steps.length === 0) {
              if (chainSummary) chainSummary.style.display = "none";
              chainFlow.innerHTML = `
          <div class="empty-state">No steps found in input.</div>
        `;
              if (chainStatus) chainStatus.style.display = "none";
              return;
            }
            const errorCount = checkResults.filter((r) => !r.ok).length;
            if (chainSummary) {
              chainSummary.style.display = "flex";
              if (errorCount === 0) {
                chainSummary.innerHTML = `
            <span class="summary-status status-ok">No errors found</span>
            <span class="summary-time">checked in ${elapsedMs} ms</span>
          `;
              } else {
                chainSummary.innerHTML = `
            <span class="summary-status status-error">${errorCount} error(s) found</span>
            <span class="summary-time">checked in ${elapsedMs} ms</span>
          `;
              }
            }
            steps.forEach((step, index) => {
              const incomingCheck = index > 0 ? checkResults.find((r) => r.fromIndex === index - 1) : void 0;
              const hasInputMismatch = Boolean(incomingCheck && !incomingCheck.ok);
              const stepCard = document.createElement("div");
              stepCard.className = `step-card${hasInputMismatch ? " step-card-error" : ""}`;
              const inLimitHtml = step.inMax !== void 0 ? `<span class="limit-badge">[max ${step.inMax}]</span>` : "";
              const outLimitHtml = step.outMax !== void 0 ? `<span class="limit-badge">[max ${step.outMax}]</span>` : "";
              const prevStep = index > 0 ? steps[index - 1] : void 0;
              const inErrorHtml = hasInputMismatch && prevStep ? `<div class="port-in-error">expects ${escapeHtml(step.inType)}, got ${escapeHtml(prevStep.outType)}</div>` : "";
              stepCard.innerHTML = `
          <div class="step-header">
            <span class="step-tag">Step ${index + 1}</span>
            <div class="step-name">${escapeHtml(step.name)}</div>
          </div>
          <div class="step-ports">
            <div class="port-row port-in">
              <span class="port-label">in</span>
              <span class="type-pill">${escapeHtml(step.inType)}${inLimitHtml}</span>
            </div>
            ${inErrorHtml}
            <div class="port-row port-out">
              <span class="port-label">out</span>
              <span class="type-pill">${escapeHtml(step.outType)}${outLimitHtml}</span>
            </div>
          </div>
        `;
              chainFlow.appendChild(stepCard);
              if (index < steps.length - 1) {
                const check = checkResults.find((r) => r.fromIndex === index);
                const isOk = check ? check.ok : true;
                const connector = document.createElement("div");
                connector.className = `chain-connector ${isOk ? "connector-ok" : "connector-error"}`;
                const errorHtml = !isOk && check?.message ? `<div class="connector-error-message">${escapeHtml(check.message)}</div>` : "";
                connector.innerHTML = `
            <div class="arrow-line-container">
              <svg class="arrow-svg" width="90" height="26" viewBox="0 0 90 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 13 H74" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                <path d="M68 6 L84 13 L68 20 Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
              </svg>
            </div>
            ${errorHtml}
          `;
                chainFlow.appendChild(connector);
              }
            });
            if (chainStatus) {
              chainStatus.style.display = "inline-flex";
              if (errorCount > 0) {
                chainStatus.className = "chain-status-badge status-mismatch";
                chainStatus.textContent = "Type Mismatch";
              } else {
                chainStatus.className = "chain-status-badge status-ok";
                chainStatus.textContent = `Valid Chain (${steps.length} steps)`;
              }
            }
          } catch (err) {
            if (chainSummary) chainSummary.style.display = "none";
            showErrorTitle("Parse Error");
            if (err instanceof ParseError) {
              errorContainer.style.display = "block";
              errorMessage.textContent = err.message;
              if (visualizationSection) visualizationSection.style.display = "none";
              chainFlow.innerHTML = "";
            } else {
              errorContainer.style.display = "block";
              errorMessage.textContent = err.message || String(err);
              if (visualizationSection) visualizationSection.style.display = "none";
              chainFlow.innerHTML = "";
            }
          }
        }
        checkBtn.addEventListener("click", render);
        sourceInput.addEventListener("keydown", (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            render();
          }
        });
        if (loadValidBtn) {
          loadValidBtn.addEventListener("click", () => {
            sourceInput.value = VALID_EXAMPLE;
            render();
          });
        }
        if (loadBrokenBtn) {
          loadBrokenBtn.addEventListener("click", () => {
            sourceInput.value = BROKEN_EXAMPLE;
            render();
          });
        }
        if (loadLimitsBtn) {
          loadLimitsBtn.addEventListener("click", () => {
            sourceInput.value = LIMITS_EXAMPLE;
            render();
          });
        }
        sourceInput.value = VALID_EXAMPLE;
        render();
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initApp);
      } else {
        initApp();
      }
    }
  });
  require_app();
})();
