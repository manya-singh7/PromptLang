# PromptLang runtime demo

This folder has the runtime, run page, rough cost estimate, and Akash's report drafts. It uses the project parser in `../parser/parser.ts` and the project's current checker in `../web/check.ts`. When PR #13 is merged, the checker import can move to `../semantic/checkChain.ts`.

## Run the tests and demo

From the repository root:

```powershell
npm install
npm test
npm run runtime:demo
npm run runtime
```

The demo runs three cases using `examples/demo-input.txt`: a valid chain that runs, a broken chain blocked before a model call, and a chain stopped by a runtime text limit. The app opens at `http://127.0.0.1:4174`.

The web page starts with blank boxes. It shows an estimate before every run and checks the chain before calling the model. There is no unchecked run button.

## Mock mode and estimates

Mock mode is the default and needs no API key. It returns sample outputs and makes no LLM call. The sample prices of `$0.25` per million input tokens and `$1.50` per million output tokens are illustrative values for showing the estimate calculation. They are not quoted as prices for any provider. The token count and time range are rough estimates, not actual usage or a bill.

To run one chain from files, use:

```powershell
npx tsx runtime/cli.ts run examples/fixed_summary_chain.promptlang examples/demo-input.txt
```

The estimate is printed before the chain is checked and run. A broken chain is stopped without a model call. Runtime type and length checks still apply to each output.

## Optional API mode

No API key is needed for the class demo. To use an OpenAI-compatible API later, copy `runtime/.env.example` to `.env` at the repository root, set `PROMPTLANG_MODE=api`, and provide your own key, model name, endpoint if needed, and current input/output prices. The runtime reads `.env`; the root `.gitignore` excludes it. Do not commit or share the key. A ChatGPT subscription is not itself an API key.

API prices can change. The estimate uses the prices entered in `.env` and approximate token counts. Real usage reported by the provider can differ.