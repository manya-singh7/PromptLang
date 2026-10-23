# Runtime demo overview

This is Akash's runtime part of PromptLang. It adds a small runner, runtime output checks, mock and optional API calls, an estimate, and a web panel.

## What it does

- Uses the project's parser from `parser/parser.ts`.
- Uses the project's checker from `web/check.ts` while PR #13 is still open.
- Checks the chain before any model call. A broken chain is stopped.
- Checks each model result and stops if its type or text limit is wrong.
- Runs in mock mode by default, with sample output and no API call.
- Shows a rough, clearly labelled cost estimate before running in the CLI and web panel.

## Start it

From the repository root, run `npm install`, then `npm test`, `npm run runtime:demo`, or `npm run runtime`. The web app is at `http://127.0.0.1:4174`.

The CLI demo reads `examples/demo-input.txt`. It tries a valid chain, a broken chain, and a chain that exceeds a runtime text limit.

## Limits and API notes

The mock output is sample text, not an LLM answer. The sample prices in `.env.example` are illustrative only, not a provider's advertised prices. The estimate uses approximate token counts and may differ from actual API use. A real API key and account are optional and must come from the provider; this project does not create a key. Keep any key only in the ignored root `.env` file or in an environment variable.

The current `web/check.ts` is a temporary stand-in. After PR #13 merges, change `runtime/checker-adapter.ts` to export from `../semantic/checkChain.ts` and rerun the tests.