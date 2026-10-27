# PromptLang

A type-safe compiler and parallel runtime for structured LLM prompt chains: catches broken prompt pipelines before any API call.

## The problem

LLM pipelines are often built by chaining prompts, where each step's output becomes the next step's input.
If one step returns JSON and the next step expects plain text, nothing complains when you write the chain.
You find out only at run time, after the first steps have already called the model and you have paid for those tokens.
PromptLang lets you declare the input and output type of every step, so a mismatch like this is reported before anything runs.

## Quick example

A valid linear chain (`examples/valid_chain.promptlang`):

```promptlang
step summarize: in=text, out=text -> step translate: in=text, out=text -> step format: in=text, out=list
```

A broken chain (`examples/broken_chain.promptlang`):

```promptlang
step summarize: in=text, out=text -> step format: in=text, out=list -> step email: in=text, out=text
```

`format` outputs a `list`, but `email` expects `text`. The type check marks that arrow in red and reports:

```
step "format" outputs list but step "email" expects text
```

Before any API call is made or any token is spent, PromptLang's runtime blocks the execution and reports the mismatch.

## Screenshot

![PromptLang web demo](docs/screenshot.png)

## Syntax & Features

A chain consists of steps connected by `->` arrows or semicolon-separated statements:

```promptlang
step <name>: in=<type>, out=<type> -> step <name>: in=<type>, out=<type>
```

- **Base Types**: `text`, `list`, `json`.
- **Text Length Limits**: Only `text` may declare an optional length limit, written `text[max N]` with $N > 0$ (e.g., `in=text[max 1000], out=text[max 280]`).
- **Step Names**: Single identifiers that must be unique within a pipeline.

Syntax errors are reported with the token position, for example `Expected COLON at token 2, but got PARAM ("in")`.
An unknown type is reported as `Unknown type "txt". Expected text, list or json.`

### Schema-Aware JSON Typing

PromptLang supports structured, record-level typing for JSON payloads using the parameterized syntax `json{field:type, ...}`:

```promptlang
step extract: in=text, out=json{title:text,tags:list,score:number} -> step render: in=json{title:text,tags:list}, out=text
```

- **Supported Field Types**: `text`, `list`, `number`, `boolean`, `json`, or nested records `json{...}` (e.g., `json{meta:json{id:text}}`).
- **Width Subtyping**: If Step A outputs `json{...}` and Step B expects `json{...}`, Step A must satisfy all fields required by Step B. Step A may provide extra fields without error.
- **Order Independence**: Field order within record braces is commutative (`json{a:text,b:list}` satisfies `json{b:list,a:text}`).
- **Strict Key & Type Matching**: Missing required keys or mismatched field types (e.g., outputting `tags:list` when input requires `tags:text`) are caught statically at compile time with precise field-level error messages.
- **Runtime Enforcement**: When executing, `checkRuntimeValue` validates that parsed JSON objects contain all required keys matching their declared primitive types.

### Directed Acyclic Graphs (DAGs) & Parallel Execution

PromptLang supports non-linear pipelines with fan-out branching and fan-in joins:

- **Fan-Out Branching (`1 -> N`)**: A single step fans out to multiple concurrent branches:
  ```promptlang
  step source: in=text, out=text -> (step branchA: in=text, out=text, step branchB: in=text, out=list)
  ```
- **Fan-In Joins (`N -> 1`)**: Multiple branches converge into a single downstream step:
  ```promptlang
  (step branchA: in=text, out=text, step branchB: in=text, out=list) -> step merge: in=json{branchA:text,branchB:list}, out=text
  ```
- **Chained Branching**: Full fan-out and fan-in graphs:
  ```promptlang
  step start: in=text, out=text -> (step branchA: in=text, out=text, step branchB: in=text, out=text) -> step finish: in=text, out=text
  ```
- **Explicit Dependencies & Semicolons**: Multiple graph statements can be separated by semicolons (`;`) or declare explicit upstream sources (`from=A,B`).
- **Topological Cycle Detection**: Graph structure is checked with Kahn's topological sort algorithm in the semantic analyzer. Cycles, dangling references, duplicate branch names, and unreachable steps are caught statically.
- **Parallel Async Execution**: During runtime execution, independent branch steps are executed concurrently via `Promise.all` in topological order, forwarding outputs along resolved dependencies.

## Empirical Savings Benchmark

PromptLang includes an automated empirical benchmark script (`scripts/benchmark-savings.ts`) that measures the cost, token, and latency savings of PromptLang's static type checker vs. naive sequential runtime execution across 40 seeded pipelines (30 broken pipelines and 10 valid reference chains).

### Key Results Across Model Presets

| Model / Provider Preset | Input Rate (/1M) | Output Rate (/1M) | Prevented API Calls | Prevented Token Waste | Net Dollars Saved ($) | Latency Saved (s) | Static Check Overhead |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **GPT-4o** (OpenAI) | $2.50 | $10.00 | **52** | **10,640** | **$0.0725** | **62.4s** | 0.026 ms |
| **Claude 3.5 Sonnet** (Anthropic) | $3.00 | $15.00 | **52** | **10,640** | **$0.1054** | **78.0s** | 0.004 ms |
| **Gemini 1.5 Flash** (Google) | $0.075 | $0.30 | **52** | **10,640** | **$0.0022** | **31.2s** | 0.004 ms |
| **PromptLang Sample** (Mock) | $0.25 | $1.50 | **52** | **10,640** | **$0.0103** | **52.0s** | 0.004 ms |

- **52 Prevented API Calls**: 100% of broken pipelines are blocked upfront before any model call is dispatched.
- **Zero False Positives**: All 10 valid reference chains pass verification and run to completion (100% precision).
- **Instant Verification**: Static checking runs in **0.004–0.026 ms** per pipeline—over **40,000x faster** than waiting for an API call to fail at runtime.

Detailed results and per-pipeline breakdowns are stored in [`runtime/deliverables/benchmark-results.md`](runtime/deliverables/benchmark-results.md).

## How to run

```bash
npm install

# Run all 125 unit & integration tests
npm test

# Run the empirical benchmark suite (measures prevented calls, tokens, and dollar savings)
npm run benchmark

# Check the 40 seeded test chains against their manifest
npm run validate:seeded

# Run demo CLI cases (valid, broken blocked before call, and runtime limit)
npm run runtime:demo

# Start the interactive web panel (http://127.0.0.1:4174)
npm run runtime

# Rebuild the web bundle (web/app.ts -> web/app.js)
npm run build:web

# Parse a chain and run the standalone semantic analyzer CLI
npx tsx parser/cli.ts examples/valid_chain.promptlang
```

## Project structure

```
parser/
  parser.ts           Tokenizer and parser supporting limits, schema JSON, and DAG syntax
  semantic.ts         Semantic analyzer with topological cycle detection and graph validation
  cli.ts              Command line entry point
semantic/
  typeChecker.ts      Subtyping engine for scalars and parameterized JSON schemas
  checkChain.ts       Pipeline contract compatibility and fan-in/fan-out join checker
  symbolTable.ts      Symbol table for step declarations
runtime/
  runtime.ts          Execution engine with parallel DAG evaluation, runtime guards, and mock/API calls
  cli.ts              CLI runner for demo cases and interactive pipeline execution
  estimate.ts         Token, latency, and cost estimation engine
  settings.ts         Pricing presets and model configuration
  autofix.ts          Safe adapter insertion (e.g., list-to-text)
  codegen.ts          Code generation from verified pipelines
  deliverables/
    benchmark-results.md  Empirical benchmark results across provider presets
    paper-section-3.md    Draft section for research paper
web/
  index.html          Interactive web UI
  app.ts              Renders visual chain diagrams and live checks (bundled to app.js)
  check.ts            Web checker adapter
examples/
  seeded/             40 standardized test chains (30 broken, 10 valid) with manifest.json
scripts/
  benchmark-savings.ts Automated empirical benchmark script (`npm run benchmark`)
  validate-seeded.ts   Verifies seeded test chains against manifest.json
tests/                Vitest test suites (125 tests across 10 test files)
```

## Status

| Feature | Status | Notes |
| --- | --- | --- |
| Lexer & Tokenizer | Done | Supports keywords, parameterized schemas `json{...}`, and DAG group syntax `(`, `)`, `;` |
| Parser with length limits | Done | `text[max N]`, errors include token position and helpful messages |
| Semantic analyzer | Done | Duplicate step names, unknown types, Kahn's topological sort cycle detection, unreachable steps |
| Subtype & limit checker | Done | Static checking of type compatibility, text length limits, and list-to-text fix hints |
| Schema-aware JSON checking | Done | Parameterized `json{...}`, width subtyping, nested schemas, exact field mismatch errors |
| DAG branching & parallel runtime | Done | Fan-out `A -> (B, C)`, fan-in `(B, C) -> D`, parallel `Promise.all` execution in topological order |
| Runtime guards & API blocker | Done | Validates input/output types and limits at runtime; blocks broken chains before any model call |
| Cost & time estimate | Done | Calculates input/output token counts, dollar cost, and latency estimates before execution |
| Empirical benchmark suite | Done | `npm run benchmark` measures prevented calls, token waste, and dollar savings across model presets |
| Automatic safe fixes | Done | Safe insertion of `list-to-text` adapter steps |
| Web chain diagram | Done | Draws linear steps or side-by-side branch stages with green/red arrows, error messages, and an illustrative cost estimate |
| 40 seeded test chains with validator | Done | `npm run validate:seeded` (30 broken, 10 valid) |
| Automated test suite | Done | 125 tests across 10 test files with Vitest |
| CI | Done | GitHub Actions runs tests on every push and pull request |

## Related work

- **DSPy**: a Python framework that builds LM pipelines from typed signatures and optimizes their prompts. PromptLang is a small standalone language that only checks how steps connect, with no optimization.
- **LMQL**: a query language that constrains what the model generates during decoding. PromptLang checks the chain before any model is called.
- **TypeChat**: uses TypeScript types to validate and repair the JSON a model returns at run time. PromptLang checks the types between steps statically, before running.
- **BAML**: a language for typed LLM functions that generates client code and parses model output into schemas. PromptLang focuses on checking the wiring of a chain and has no code generator yet.
- **Imprompt**: a research language framework for prompt programming that relates type checking to constrained decoding. PromptLang applies plain static type checking to the boundaries between chain steps.

## Team

- Manya Singh (24BCE2401)
- Akash Jagannadh Bommisetty (24BCE2791)
- Kuppili Sai Prapoorn (24BCE2806)

## Runtime demo

The runtime code is in `runtime/`. It uses the shared parser and checks every chain before a model call. Mock mode is the default, so an API key is not needed. Mock results are sample text. The cost rates shown in mock mode are illustrative values, not a provider's real prices.

From the repository root:

```powershell
npm install
npm test
npm run runtime:demo
npm run runtime
```

`npm run runtime:demo` reads `examples/demo-input.txt` and tries one valid chain, one broken chain that must be blocked before a call, and one chain stopped by a runtime length limit. `npm run runtime` starts the web panel at `http://127.0.0.1:4174`; it shows the cost and latency estimate before each run. For setup notes and optional API mode, see [`runtime/README.md`](runtime/README.md).
