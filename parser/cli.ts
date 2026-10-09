import * as fs from "fs";
import { tokenize, parse, ParseError } from "./parser";

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
