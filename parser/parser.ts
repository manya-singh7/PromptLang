import * as fs from "fs";

interface Token {
  type: string;
  value: string;
}

interface Step {
  name: string;
  inType: string;
  outType: string;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const words = source
    .replace(/->/g, " -> ")
    .replace(/:/g, " : ")
    .replace(/,/g, " , ")
    .replace(/=/g, " = ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const types = ["text", "list", "json"];

  for (const word of words) {
    if (word === "step") tokens.push({ type: "KEYWORD", value: word });
    else if (word === "->") tokens.push({ type: "ARROW", value: word });
    else if (word === ":") tokens.push({ type: "COLON", value: word });
    else if (word === ",") tokens.push({ type: "COMMA", value: word });
    else if (word === "=") tokens.push({ type: "EQUALS", value: word });
    else if (types.includes(word)) tokens.push({ type: "TYPE", value: word });
    else if (word === "in" || word === "out") tokens.push({ type: "PARAM", value: word });
    else tokens.push({ type: "IDENTIFIER", value: word });
  }

  return tokens;
}

class ParseError extends Error {}

function expect(tokens: Token[], pos: number, type: string): void {
  if (!tokens[pos] || tokens[pos].type !== type) {
    const got = tokens[pos] ? `${tokens[pos].type} ("${tokens[pos].value}")` : "end of input";
    throw new ParseError(`Expected ${type} at token ${pos}, but got ${got}`);
  }
}

function parse(tokens: Token[]): Step[] {
  const steps: Step[] = [];
  let pos = 0;

  while (pos < tokens.length) {
    expect(tokens, pos, "KEYWORD");
    pos++;

    expect(tokens, pos, "IDENTIFIER");
    const name = tokens[pos].value;
    pos++;

    expect(tokens, pos, "COLON");
    pos++;

    expect(tokens, pos, "PARAM");
    if (tokens[pos].value !== "in") {
      throw new ParseError(`Expected "in" but got "${tokens[pos].value}" at token ${pos}`);
    }
    pos++;

    expect(tokens, pos, "EQUALS");
    pos++;

    expect(tokens, pos, "TYPE");
    const inType = tokens[pos].value;
    pos++;

    expect(tokens, pos, "COMMA");
    pos++;

    expect(tokens, pos, "PARAM");
    if (tokens[pos].value !== "out") {
      throw new ParseError(`Expected "out" but got "${tokens[pos].value}" at token ${pos}`);
    }
    pos++;

    expect(tokens, pos, "EQUALS");
    pos++;

    expect(tokens, pos, "TYPE");
    const outType = tokens[pos].value;
    pos++;

    steps.push({ name, inType, outType });

    if (tokens[pos] && tokens[pos].type === "ARROW") {
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