import * as fs from "fs";

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
    else if (types.includes(word)) tokens.push({ type: "TYPE", value: word });
    else if (word === "in" || word === "out") tokens.push({ type: "PARAM", value: word });
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

function parseTypeWithLimit(
  tokens: Token[],
  pos: number
): { type: string; max?: number; nextPos: number } {
  expect(tokens, pos, "TYPE");
  const typeName = tokens[pos]!.value;
  pos++;

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

export function parse(tokens: Token[]): Step[] {
  const steps: Step[] = [];
  let pos = 0;

  while (pos < tokens.length) {
    expect(tokens, pos, "KEYWORD");
    if (tokens[pos]!.value !== "step") {
      throw new ParseError(`Expected "step" but got "${tokens[pos]!.value}" at token ${pos}`);
    }
    pos++;

    expect(tokens, pos, "IDENTIFIER");
    const name = tokens[pos]!.value;
    pos++;

    expect(tokens, pos, "COLON");
    pos++;

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

    const step: Step = { name, inType, outType };
    if (inMax !== undefined) {
      step.inMax = inMax;
    }
    if (outMax !== undefined) {
      step.outMax = outMax;
    }
    steps.push(step);

    if (tokens[pos] && tokens[pos]!.type === "ARROW") {
      pos++;
      if (pos >= tokens.length) {
        throw new ParseError(`Unexpected end of input after "->" at token ${pos} — a step was expected after the arrow`);
      }
    } else if (pos < tokens.length) {
      throw new ParseError(`Expected -> or end of input at token ${pos}`);
    }
  }

  return steps;
}

if (require.main === module) {
  const filename = process.argv[2] || "examples/valid_chain.promptlang";
  const source = fs.readFileSync(filename, "utf-8");
  const tokens = tokenize(source);

  try {
    const steps = parse(tokens);
    console.log(`Parsed ${steps.length} step(s) from ${filename}:\n`);
    console.table(steps);
  } catch (err) {
    if (err instanceof ParseError) {
      console.error(`\n❌ Syntax error in ${filename}: ${err.message}`);
      process.exit(1);
    } else {
      throw err;
    }
  }
}