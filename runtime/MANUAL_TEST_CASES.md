# Runtime demo test cases

Run `npm run runtime:demo` from the repository root. The CLI uses mock mode and reads `examples/demo-input.txt` for all three cases.

1. **Valid chain**: the CLI prints an estimate, checks the chain, and runs two mock steps. Expected: `Run finished`; the output is sample data, not an LLM answer.
2. **Broken chain**: one step returns `list` and the next expects `text`. Expected: the estimate is shown, then the checker blocks the chain before any model call.
3. **Runtime text limit**: one step promises `text[max 10]`. The sample mock output is longer. Expected: one mock call happens and the runtime stops the chain with a length-limit error.

The Vitest suite also covers project parsing, the project's current checker, estimate changes, server endpoints, and mock behavior. CI runs the root `npm test` command with Node 20.