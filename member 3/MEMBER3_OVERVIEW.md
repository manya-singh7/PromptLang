# Member 3: what this version does

This folder contains Akash's part of PromptLang. It has a small run page, a server, a mock model, an API caller, runtime checks, a cost estimate, and my report drafts.

## Try it without an API key

The app starts in mock mode unless `PROMPTLANG_MODE=api` is set. In mock mode, it does not contact an LLM and cannot charge money. It returns sample text, JSON, or list values so the chain and its runtime checks can be tried.

From this folder, run:

```powershell
npm test
npm run build
npm start
```

Open `http://127.0.0.1:4174`. The chain and input boxes start empty. Enter a chain and input, then use **Check first** or **Run without checking**. The mock estimate uses example prices so the page can show a cost calculation. That estimate is not an actual charge. More manual cases and expected results are in `MANUAL_TEST_CASES.md`.

Example:

```text
step summarize: in=text, out=text -> step format: in=text, out=list
```

## What check and run do

- **Check first** checks the chain before running any steps. A type mismatch is stopped before an API call.
- **Run without checking** skips that pre-run chain check. Runtime input/output checks still happen as the steps run. In API mode, calls made before a runtime error can cost money.
- The current checker accepts matching basic type names (`text`, `list`, `json`). It has one safe fix: it can turn a list into text by JSON stringifying it.
- Text length limits are checked at runtime. The current checker does not yet do the planned subtype comparison for limits, such as deciding statically that `text[max 100]` fits `text[max 280]`. It should be connected to Member 2's checker when that is ready.

## What the runtime checks

- A step that declares `text` must return text, and text maximum lengths are enforced.
- A step that declares `json` must return parseable JSON.
- A step that declares `list` must return a JSON array.
- Later steps check that their actual input has the type they declare.

The model gets a simple instruction based on the step name, such as “Do the summarize task.” This is a basic demo, not a full prompt-template system. The generator in `codegen.ts` can also write a TypeScript runner for a checked chain.

## Real API mode

API mode calls an OpenAI-compatible Chat Completions endpoint. The default endpoint is OpenAI's `https://api.openai.com/v1`; `OPENAI_BASE_URL` can select another compatible endpoint. It needs a real provider API key and model name. A ChatGPT subscription is not itself an API key.

1. Copy `.env.example` to `.env`.
2. Set `PROMPTLANG_MODE=api`.
3. Add your own `OPENAI_API_KEY` and `OPENAI_MODEL`.
4. Replace the example input/output prices with the chosen model's current per-million-token prices.
5. Run `npm start` and open the same page.

`.env` is ignored by Git. Do not commit it or share the key in chat. No key is included in this folder.

In API mode, the estimate uses a rough four-characters-per-token rule and assumes a default output size per step. It changes with the input length, step count and text output limits, but it is still only an estimate. After a run, the server uses token counts returned by the API to calculate actual cost when those counts are available, and measures elapsed time. The “potential savings” number multiplies one measured failed run's cost by the retry count entered on the page; the same cost for each retry is an assumption.

## Current test coverage and limits

`npm test` runs 11 local tests for parsing, checks, safe fixes, runtime guards, estimates, metrics, the mock model and server routes. `npm run build` checks TypeScript and JavaScript syntax. These tests use mock data; they do not prove that an external API key works or measure real model prices.

This version does not have retries, branching, or Member 2's limit subtyping. The novelty and paper section in `deliverables/` are drafts and should be updated with the team's real literature review and run results.
