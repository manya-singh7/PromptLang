export interface Token {
  type: string;
  value: string;
}

export interface Step {
  name: string;
  inType: string;
  outType: string;
  inMax?: number;
  outMax?: number;
  inputsFrom?: string[];
  outputsTo?: string[];
}

export interface StepGraph {
  steps: Step[];
  dependencies: Map<string, string[]>;
  dependents: Map<string, string[]>;
}

export interface JsonFieldDef {
  rawType: string;
  schema?: Record<string, JsonFieldDef>;
}

export function isParameterizedJson(type: string): boolean {
  return typeof type === "string" && type.startsWith("json{") && type.endsWith("}");
}

export function parseJsonSchema(typeStr: string): Record<string, JsonFieldDef> | null {
  if (!isParameterizedJson(typeStr)) return null;
  const inner = typeStr.slice(5, -1).trim();
  if (inner.length === 0) return {};

  const fields: Record<string, JsonFieldDef> = {};
  const fieldStrings: string[] = [];
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

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const words = source
    .replace(/->/g, " -> ")
    .replace(/:/g, " : ")
    .replace(/,/g, " , ")
    .replace(/=/g, " = ")
    .replace(/\[/g, " [ ")
    .replace(/\]/g, " ] ")
    .replace(/\{/g, " { ")
    .replace(/\}/g, " } ")
    .replace(/\(/g, " ( ")
    .replace(/\)/g, " ) ")
    .replace(/;/g, " ; ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

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

export class ParseError extends Error {}

function expect(tokens: Token[], pos: number, type: string): void {
  if (!tokens[pos] || tokens[pos].type !== type) {
    const got = tokens[pos] ? `${tokens[pos].type} ("${tokens[pos].value}")` : "end of input";
    throw new ParseError(`Expected ${type} at token ${pos}, but got ${got}`);
  }
}

function parseFieldValueType(tokens: Token[], pos: number): { type: string; nextPos: number } {
  if (!tokens[pos]) {
    throw new ParseError(`Expected field type at token ${pos}, but got end of input`);
  }

  const token = tokens[pos]!;
  if (token.value === "json") {
    pos++;
    if (tokens[pos] && (tokens[pos]!.type === "LBRACE" || tokens[pos]!.value === "{")) {
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
    "float",
  ];

  if (allowedFieldTypes.includes(token.value)) {
    pos++;
    return { type: token.value, nextPos: pos };
  }

  throw new ParseError(
    `Unknown field type "${token.value}" at token ${pos}. Expected text, list, or another scalar.`
  );
}

function parseJsonRecordType(tokens: Token[], pos: number): { type: string; nextPos: number } {
  const bracePos = pos;
  pos++; // consume "{"

  const fields: { key: string; type: string }[] = [];

  if (tokens[pos] && (tokens[pos]!.type === "RBRACE" || tokens[pos]!.value === "}")) {
    pos++; // empty record: json{}
    return { type: "json{}", nextPos: pos };
  }

  while (pos < tokens.length) {
    if (!tokens[pos]) {
      throw new ParseError(`Unclosed "{" in json schema at token ${bracePos}: unexpected end of input`);
    }

    if (
      tokens[pos]!.type === "PARAM" &&
      (tokens[pos]!.value === "in" || tokens[pos]!.value === "out") &&
      tokens[pos + 1]?.type === "EQUALS"
    ) {
      throw new ParseError(`Missing closing "}" for json schema at token ${pos}`);
    }
    if (tokens[pos]!.type === "ARROW") {
      throw new ParseError(`Missing closing "}" for json schema at token ${pos}`);
    }

    const keyToken = tokens[pos]!;
    if (
      keyToken.type !== "IDENTIFIER" &&
      keyToken.type !== "PARAM" &&
      keyToken.type !== "KEYWORD" &&
      keyToken.type !== "TYPE"
    ) {
      throw new ParseError(
        `Expected field key in json schema at token ${pos}, but got ${keyToken.type} ("${keyToken.value}")`
      );
    }
    const key = keyToken.value;
    pos++;

    if (!tokens[pos] || tokens[pos]!.type !== "COLON") {
      const got = tokens[pos] ? `${tokens[pos]!.type} ("${tokens[pos]!.value}")` : "end of input";
      throw new ParseError(`Expected ":" after field "${key}" in json schema at token ${pos}, but got ${got}`);
    }
    pos++; // consume COLON

    const fieldTypeResult = parseFieldValueType(tokens, pos);
    fields.push({ key, type: fieldTypeResult.type });
    pos = fieldTypeResult.nextPos;

    if (!tokens[pos]) {
      throw new ParseError(`Unclosed "{" in json schema: expected "," or "}" at token ${pos}, but got end of input`);
    }

    if (tokens[pos]!.type === "COMMA" || tokens[pos]!.value === ",") {
      pos++; // consume comma
      if (tokens[pos] && (tokens[pos]!.type === "RBRACE" || tokens[pos]!.value === "}")) {
        pos++; // consume RBRACE
        break;
      }
    } else if (tokens[pos]!.type === "RBRACE" || tokens[pos]!.value === "}") {
      pos++; // consume RBRACE
      break;
    } else {
      const got = `${tokens[pos]!.type} ("${tokens[pos]!.value}")`;
      throw new ParseError(`Expected "," or "}" in json schema at token ${pos}, but got ${got}`);
    }
  }

  const typeStr = `json{${fields.map((f) => `${f.key}:${f.type}`).join(",")}}`;
  return { type: typeStr, nextPos: pos };
}

function parseTypeWithLimit(
  tokens: Token[],
  pos: number
): { type: string; max?: number; nextPos: number } {
  if (tokens[pos] && tokens[pos]!.type === "IDENTIFIER") {
    throw new ParseError(`Unknown type "${tokens[pos]!.value}". Expected text, list or json.`);
  }
  expect(tokens, pos, "TYPE");
  let typeName = tokens[pos]!.value;
  pos++;

  if (typeName === "json" && tokens[pos] && (tokens[pos]!.type === "LBRACE" || tokens[pos]!.value === "{")) {
    const recordResult = parseJsonRecordType(tokens, pos);
    typeName = recordResult.type;
    pos = recordResult.nextPos;
  }

  if (tokens[pos] && (tokens[pos]!.type === "LBRACKET" || tokens[pos]!.value === "[")) {
    if (typeName !== "text") {
      throw new ParseError(
        `Length limits are only allowed on "text" type, but got "${typeName}" at token ${pos}`
      );
    }

    pos++; // consume '['

    if (!tokens[pos] || tokens[pos]!.value === "]") {
      throw new ParseError(`Missing "max" in length limit at token ${pos}`);
    }

    if (tokens[pos]!.value !== "max") {
      throw new ParseError(
        `Expected "max" in length limit at token ${pos}, but got "${tokens[pos]!.value}"`
      );
    }

    pos++; // consume 'max'

    if (!tokens[pos] || tokens[pos]!.value === "]") {
      throw new ParseError(`Missing length limit number after "max" at token ${pos}`);
    }

    const numToken = tokens[pos]!;
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

    pos++; // consume number

    if (!tokens[pos] || (tokens[pos]!.type !== "RBRACKET" && tokens[pos]!.value !== "]")) {
      const got = tokens[pos] ? `${tokens[pos]!.type} ("${tokens[pos]!.value}")` : "end of input";
      throw new ParseError(`Missing closing "]" after length limit at token ${pos}, but got ${got}`);
    }

    pos++; // consume ']'

    return { type: typeName, max: num, nextPos: pos };
  }

  return { type: typeName, nextPos: pos };
}

function createStep(
  name: string,
  inType = "",
  outType = "",
  inMax?: number,
  outMax?: number
): Step {
  const step: Step = { name, inType, outType };
  if (inMax !== undefined) step.inMax = inMax;
  if (outMax !== undefined) step.outMax = outMax;
  const inputsFrom: string[] = [];
  const outputsTo: string[] = [];
  Object.defineProperty(step, "inputsFrom", {
    value: inputsFrom,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(step, "outputsTo", {
    value: outputsTo,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return step;
}

function parseSingleStep(
  tokens: Token[],
  pos: number,
  allowBareIdentifier: boolean,
  stepMap: Map<string, Step>,
  steps: Step[]
): { name: string; nextPos: number } {
  if (!tokens[pos]) {
    throw new ParseError(`Expected step at token ${pos}, but got end of input`);
  }

  if (tokens[pos]!.type === "KEYWORD" && tokens[pos]!.value === "step") {
    pos++; // consume "step"
    expect(tokens, pos, "IDENTIFIER");
    const name = tokens[pos]!.value;
    pos++;

    if (tokens[pos] && tokens[pos]!.type === "COLON") {
      pos++; // consume COLON

      expect(tokens, pos, "PARAM");
      if (tokens[pos]!.value !== "in") {
        throw new ParseError(`Expected "in" but got "${tokens[pos]!.value}" at token ${pos}`);
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
      if (tokens[pos]!.value !== "out") {
        throw new ParseError(`Expected "out" but got "${tokens[pos]!.value}" at token ${pos}`);
      }
      pos++;

      expect(tokens, pos, "EQUALS");
      pos++;

      const outParsed = parseTypeWithLimit(tokens, pos);
      const outType = outParsed.type;
      const outMax = outParsed.max;
      pos = outParsed.nextPos;

      const explicitFrom: string[] = [];
      if (tokens[pos] && tokens[pos]!.type === "COMMA" && tokens[pos + 1]?.value === "from") {
        pos += 2; // consume "," and "from"
        expect(tokens, pos, "EQUALS");
        pos++;
        if (tokens[pos] && tokens[pos]!.type === "LPAREN") {
          pos++; // consume "("
          while (pos < tokens.length && tokens[pos]!.type !== "RPAREN") {
            if (tokens[pos]!.type === "KEYWORD" && tokens[pos]!.value === "step") pos++;
            expect(tokens, pos, "IDENTIFIER");
            explicitFrom.push(tokens[pos]!.value);
            pos++;
            if (tokens[pos] && tokens[pos]!.type === "COMMA") pos++;
          }
          expect(tokens, pos, "RPAREN");
          pos++;
        } else {
          while (
            pos < tokens.length &&
            (tokens[pos]!.type === "IDENTIFIER" ||
              (tokens[pos]!.type === "KEYWORD" && tokens[pos]!.value === "step"))
          ) {
            if (tokens[pos]!.type === "KEYWORD" && tokens[pos]!.value === "step") pos++;
            explicitFrom.push(tokens[pos]!.value);
            pos++;
            if (tokens[pos] && tokens[pos]!.type === "COMMA" && tokens[pos + 1]?.type === "IDENTIFIER") {
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
          if (!step.inputsFrom!.includes(fromName)) step.inputsFrom!.push(fromName);
          let fromStep = stepMap.get(fromName);
          if (!fromStep) {
            fromStep = createStep(fromName);
            stepMap.set(fromName, fromStep);
            steps.push(fromStep);
          }
          if (!fromStep.outputsTo!.includes(name)) fromStep.outputsTo!.push(name);
        }
      }

      return { name, nextPos: pos };
    } else {
      if (tokens[pos] && tokens[pos]!.type === "PARAM" && tokens[pos]!.value === "in") {
        throw new ParseError(
          `Expected COLON at token ${pos}, but got ${tokens[pos]!.type} ("${tokens[pos]!.value}")`
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
      if (tokens[pos]!.value !== "step") {
        throw new ParseError(`Expected "step" but got "${tokens[pos]!.value}" at token ${pos}`);
      }
    }
    expect(tokens, pos, "IDENTIFIER");
    const name = tokens[pos]!.value;
    pos++;

    if (tokens[pos] && tokens[pos]!.type === "COLON") {
      pos++; // consume COLON
      expect(tokens, pos, "PARAM");
      if (tokens[pos]!.value !== "in") {
        throw new ParseError(`Expected "in" but got "${tokens[pos]!.value}" at token ${pos}`);
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
      if (tokens[pos]!.value !== "out") {
        throw new ParseError(`Expected "out" but got "${tokens[pos]!.value}" at token ${pos}`);
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

function parseGroup(
  tokens: Token[],
  pos: number,
  stepMap: Map<string, Step>,
  steps: Step[]
): { names: string[]; nextPos: number } {
  if (tokens[pos] && tokens[pos]!.type === "LPAREN") {
    pos++; // consume "("
    const names: string[] = [];
    while (pos < tokens.length && tokens[pos]!.type !== "RPAREN") {
      const parsed = parseSingleStep(tokens, pos, true, stepMap, steps);
      names.push(parsed.name);
      pos = parsed.nextPos;
      if (tokens[pos] && tokens[pos]!.type === "COMMA") {
        pos++; // consume ","
      } else if (tokens[pos] && tokens[pos]!.type === "RPAREN") {
        break;
      } else {
        const got = tokens[pos] ? `${tokens[pos]!.type} ("${tokens[pos]!.value}")` : "end of input";
        throw new ParseError(`Expected "," or ")" in step group at token ${pos}, but got ${got}`);
      }
    }
    if (!tokens[pos] || tokens[pos]!.type !== "RPAREN") {
      throw new ParseError(`Missing closing ")" for step group at token ${pos}`);
    }
    pos++; // consume ")"
    return { names, nextPos: pos };
  } else {
    const parsed = parseSingleStep(tokens, pos, false, stepMap, steps);
    return { names: [parsed.name], nextPos: parsed.nextPos };
  }
}

export function parse(tokens: Token[]): Step[] {
  const steps: Step[] = [];
  const stepMap = new Map<string, Step>();
  let pos = 0;

  while (pos < tokens.length) {
    if (tokens[pos]!.type === "SEMICOLON") {
      pos++;
      continue;
    }

    let currentGroup = parseGroup(tokens, pos, stepMap, steps);
    pos = currentGroup.nextPos;

    while (pos < tokens.length && tokens[pos]!.type === "ARROW") {
      pos++; // consume "->"
      if (pos >= tokens.length) {
        throw new ParseError(
          `Unexpected end of input after "->" at token ${pos} — a step was expected after the arrow`
        );
      }

      const nextGroup = parseGroup(tokens, pos, stepMap, steps);
      pos = nextGroup.nextPos;

      for (const sourceName of currentGroup.names) {
        const sourceStep = stepMap.get(sourceName);
        for (const targetName of nextGroup.names) {
          const targetStep = stepMap.get(targetName);
          if (sourceStep && !sourceStep.outputsTo!.includes(targetName)) {
            sourceStep.outputsTo!.push(targetName);
          }
          if (targetStep && !targetStep.inputsFrom!.includes(sourceName)) {
            targetStep.inputsFrom!.push(sourceName);
          }
        }
      }

      currentGroup = nextGroup;
    }

    if (pos < tokens.length && tokens[pos]!.type !== "SEMICOLON") {
      throw new ParseError(`Expected -> or end of input at token ${pos}`);
    }
  }

  Object.defineProperty(steps, "graph", {
    value: {
      steps,
      dependencies: new Map(steps.map((s) => [s.name, s.inputsFrom || []])),
      dependents: new Map(steps.map((s) => [s.name, s.outputsTo || []])),
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  return steps;
}
