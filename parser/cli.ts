
import * as fs from "fs";
import { tokenize, parse, ParseError } from "./parser";
import { analyze } from "./semantic";
import { checkChain } from "../semantic/checkChain";

const filename = process.argv[2] || "examples/valid_chain.promptlang";
const source = fs.readFileSync(filename, "utf-8");
const tokens = tokenize(source);

try {
  const steps = parse(tokens);

  // Run the existing semantic checks.
  const issues = analyze(steps);

  // Run the chain compatibility checks.
  const chainResults = checkChain(steps);
  const chainIssues = chainResults.filter((result) => !result.ok);

  if (issues.length > 0 || chainIssues.length > 0) {
    console.error(
      `\n❌ ${issues.length + chainIssues.length} semantic error(s) in ${filename}:`
    );

    for (const issue of issues) {
      console.error(`  - ${issue.message}`);
    }

    for (const result of chainIssues) {
      console.error(`  - ${result.message ?? "Chain type or limit mismatch"}`);

      if (result.fix) {
        console.error(`    Suggested fix: ${result.fix}`);
      }
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
