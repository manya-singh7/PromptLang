import * as fs from "fs";

interface Token {
  type: string;
  value: string;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const words = source
    .replace(/->/g, " -> ")
    .replace(/:/g, " : ")
    .replace(/,/g, " , ")
    .replace(/=/g, " = ")
    .replace(/\[/g, " [ ")
    .replace(/\]/g, " ] ")
    .split(/\s+/)
    .filter(w => w.length > 0);

  const types = ["text", "list", "json"];

  for (const word of words) {
    if (word === "step") {
      tokens.push({ type: "KEYWORD", value: word });
    } else if (word === "max") {
      tokens.push({ type: "KEYWORD", value: word });
    } else if (word === "->") {
      tokens.push({ type: "ARROW", value: word });
    } else if (word === ":") {
      tokens.push({ type: "COLON", value: word });
    } else if (word === ",") {
      tokens.push({ type: "COMMA", value: word });
    } else if (word === "=") {
      tokens.push({ type: "EQUALS", value: word });
    } else if (word === "[") {
      tokens.push({ type: "LBRACKET", value: word });
    } else if (word === "]") {
      tokens.push({ type: "RBRACKET", value: word });
    } else if (types.includes(word)) {
      tokens.push({ type: "TYPE", value: word });
    } else if (word === "in" || word === "out") {
      tokens.push({ type: "PARAM", value: word });
    } else if (/^-?\d+$/.test(word)) {
      tokens.push({ type: "NUMBER", value: word });
    } else {
      tokens.push({ type: "IDENTIFIER", value: word });
    }
  }

  return tokens;
}

const source = fs.readFileSync("examples/valid_chain.promptlang", "utf-8");
console.log(tokenize(source));