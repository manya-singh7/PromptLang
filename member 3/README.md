# Member 3 work (Akash)

This folder has my part of PromptLang. It is kept separate so I can share this folder with the team.

## What is here

- `codegen.ts` makes runnable TypeScript from parsed steps.
- `runtime.ts` calls an OpenAI-compatible chat API and checks each real result.
- `autofix.ts` adds a small safe adapter when a checker result asks for one.
- `estimate.ts` gives a rough cost and time range before a run.
- `pipeline.ts` joins parsing, checking, fixing, and code generation.
- `metrics.ts` reports the evaluation numbers from files supplied to it. It does not make up results.
- `deliverables/` has my novelty statement and my draft paper section.

The shared input shape is in `types.ts` (`name`, `inType`, `outType`, and optional `inMax` / `outMax`). Give the parsed steps and B's checker results to `compileChain` in `pipeline.ts`. B can map its results to the small format in `types.ts` when the checker is ready. This folder does not edit member 1's project.

## Run the demo

Mock mode is the default. No API key is needed to start it. It uses illustrative prices of $0.25 per million input tokens and $1.50 per million output tokens to make the estimate visible. These sample rates are based on a current low-cost API tier and do not mean the mock made a paid call. Run `npm test`, `npm run build`, and then `npm start`; open `http://127.0.0.1:4174`. The mock returns sample outputs that go through the same runtime type and limit checks. It does not call an LLM and does not create API charges.

For a real API later, copy `.env.example` to `.env`, set `PROMPTLANG_MODE=api`, and fill in the provider key, model and current input/output prices. Replace the illustrative prices with rates for the model you choose. `.env` is ignored by Git. Keep the actual key only in `.env` or an environment variable, never in source code. The default API base is `https://api.openai.com/v1`; set `OPENAI_BASE_URL` if you use another OpenAI-compatible provider.

The generator produces a TypeScript file that runs each step through the API. Each call checks that a text result is a string, that `json` output parses as JSON, and that declared text length limits are respected. API model outputs can still be wrong; the generated checks stop the chain and show which step failed. Set `OPENAI_API_KEY` and `OPENAI_MODEL` before running generated API code.

## Estimator note

The estimate is only an estimate. Set the provider's current input/output price per million tokens and the expected output size before using it. Token counting is approximate (one token per four characters). Record the provider, model, prices and date with any real comparison.

## Integration

`project-adapter.ts` reads the same step syntax as the project parser and provides exact type checks plus the list-to-text fix. It keeps this folder runnable by itself. When B's subtype checker is ready, replace `checkPromptLang` with an adapter to it. This small demo uses only Node built-ins, so no package install is needed. The server serves the demo page and script at its root URL.

The server provides `/api/estimate`, `/api/check-and-run`, and `/api/run`. The panel estimates first, then sends the run request. API usage and wall time are returned even when a run stops on a runtime check. The page can show a possible saved-cost figure using the measured cost of a failed run multiplied by the retry count entered on the page; it labels the repeated cost as an assumption. Record actual run values and provider prices in the report. Do not put a provider key in browser code.
