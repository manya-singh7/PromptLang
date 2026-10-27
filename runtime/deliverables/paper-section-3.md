# Section 3: Implementation, demo and conclusion (draft)

## Implementation

The runtime uses the project's tokenizer and parser, then checks each connection between consecutive steps before starting a run. Generated code and the run server use runtime checks too, because a model can return a value that does not match its declared type or text length.

The API call is kept in a small function, and the API key is read from the environment or the local ignored `.env` file. Mock mode is the default. Mock runs return sample text and do not call an LLM. The cost and time shown before a run are estimates based on approximate token counts. The sample prices are illustrative values for showing the calculation; they are not stated as any provider's real prices. A real API comparison needs the provider, model, date, current prices, and actual usage from a run.

## Demo & Simulation Evaluation

The demo reads `examples/demo-input.txt` and evaluates both valid and broken pipelines. To model the potential savings of PromptLang's static type checker vs. naive runtime execution, we developed an automated simulation benchmark runner (`scripts/benchmark-savings.ts`, documented in `runtime/deliverables/benchmark-results.md`) that evaluates 40 seeded pipelines across multiple provider pricing presets under explicitly defined token and latency assumptions.

### Simulated Savings & Benchmark Data

Findings from the simulation benchmark across 40 seeded pipelines (30 broken, 10 valid reference chains):

- **Simulation Assumptions**:
  - **Assumed Output Tokens per Wasted Call**: Unbounded text steps and structured JSON/list steps are modeled assuming 500 output characters (~125 tokens per step at 4 chars/token). Steps with declared `outMax` are modeled as `min(500, outMax)` characters.
  - **Assumed Latencies per Step**: GPT-4o: 1,200 ms; Claude 3.5 Sonnet: 1,500 ms; Gemini 1.5 Flash: 600 ms; PromptLang Sample: 1,000 ms.
  - **Example Provider Pricing (October 2024)**: Rates are example benchmark rates set as of October 2024 and may be out of date (OpenAI GPT-4o: $2.50 / $10.00; Anthropic Claude 3.5 Sonnet: $3.00 / $15.00; Google Gemini 1.5 Flash: $0.075 / $0.30 per 1M tokens).
- **Modeled Prevented API Calls**: 52 calls across 30 broken pipelines (100% of preventable runtime failures blocked before first call).
- **Modeled Prevented Token Waste**: 10,640 tokens (4,514 input + 6,126 output tokens).
- **Modeled Net Dollars Saved per Test Suite Pass**:
  - Claude 3.5 Sonnet: $0.1054
  - GPT-4o: $0.0725
  - PromptLang Sample: $0.0103
  - Gemini 1.5 Flash: $0.0022
- **Modeled Latency & Time Saved**: 62.4s (GPT-4o) / 78.0s (Claude 3.5 Sonnet) / 31.2s (Gemini 1.5 Flash), calculated using the assumed step latencies.
- **Static Checking Overhead**: ~0.005–0.028 ms per pipeline; compared to the assumed API latencies of 600–1,500 ms per step, static verification rejects invalid pipelines before network overhead is incurred.
- **Valid Reference Pipelines**: All 10 valid reference chains passed static checking and simulated execution to completion without being blocked.

## Conclusion

PromptLang is an experiment in checking prompt-chain contracts before execution and checking model results during execution. By enforcing type compatibility, parameter schemas, and length limits statically, PromptLang eliminates wasteful API invocations and token spend on invalid pipelines while introducing sub-millisecond overhead on valid runs.
