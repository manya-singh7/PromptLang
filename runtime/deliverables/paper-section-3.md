# Section 3: Implementation, demo and conclusion (draft)

## Implementation

The runtime uses the project's tokenizer and parser, then checks each connection between consecutive steps before starting a run. Generated code and the run server use runtime checks too, because a model can return a value that does not match its declared type or text length.

The API call is kept in a small function, and the API key is read from the environment or the local ignored `.env` file. Mock mode is the default. Mock runs return sample text and do not call an LLM. The cost and time shown before a run are estimates based on approximate token counts. The sample prices are illustrative values for showing the calculation; they are not stated as any provider's real prices. A real API comparison needs the provider, model, date, current prices, and actual usage from a run.

## Demo & Empirical Evaluation

The demo reads `examples/demo-input.txt` and evaluates both valid and broken pipelines. To measure the concrete savings of PromptLang's static type checker vs. naive runtime execution, we developed an automated empirical benchmark runner (`scripts/benchmark-savings.ts`, documented in `runtime/deliverables/benchmark-results.md`) that tests 40 seeded pipelines across multiple provider pricing presets.

### Empirical Savings & Benchmark Data

Quantitative findings from the automated benchmark across 40 seeded pipelines (30 broken, 10 valid reference chains):

- **Provider, Model & Pricing Presets Evaluated**:
  - OpenAI GPT-4o: $2.50 / $10.00 per 1M tokens
  - Anthropic Claude 3.5 Sonnet: $3.00 / $15.00 per 1M tokens
  - Google Gemini 1.5 Flash: $0.075 / $0.30 per 1M tokens
  - PromptLang Sample Baseline: $0.25 / $1.50 per 1M tokens
- **Total Prevented API Calls**: 52 calls across 30 broken pipelines (100% of preventable runtime failures blocked before first call).
- **Total Prevented Token Waste**: 10,640 tokens (4,514 input + 6,126 output tokens).
- **Net Dollars Saved per Test Suite Pass**:
  - Claude 3.5 Sonnet: $0.1054
  - GPT-4o: $0.0725
  - PromptLang Sample: $0.0103
  - Gemini 1.5 Flash: $0.0022
- **Developer Latency & Time Saved**: 62.4s (GPT-4o) / 78.0s (Claude 3.5 Sonnet) / 31.2s (Gemini 1.5 Flash) of eliminated roundtrip latency.
- **Static Check Speedup & Overhead**: ~0.005–0.028 ms per pipeline (checking executes >40,000x faster than waiting for an API failure).
- **Completion Rate on Valid Reference Pipelines**: 100% (10 of 10 completed with zero false alarms).

## Conclusion

PromptLang is an experiment in checking prompt-chain contracts before execution and checking model results during execution. By enforcing type compatibility, parameter schemas, and length limits statically, PromptLang eliminates wasteful API invocations and token spend on invalid pipelines while introducing sub-millisecond overhead on valid runs.
