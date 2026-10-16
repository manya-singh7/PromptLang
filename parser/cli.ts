import * as fs from "fs";
import { tokenize, parse, ParseError } from "./parser";
import { analyze } from "./semantic";

const filename = process.argv[2] || "examples/valid_chain.promptlang";
const source = fs.readFileSync(filename, "utf-8");
const tokens = tokenize(source);

try {
  const steps = parse(tokens);

  const issues = analyze(steps);
  if (issues.length > 0) {
    console.error(`\n❌ ${issues.length} semantic error(s) in ${filename}:`);
    for (const issue of issues) {
      console.error(`  - ${issue.message}`);
    }
    process.exit(1);
  }

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
