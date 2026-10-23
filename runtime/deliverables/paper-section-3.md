# Section 3: Implementation, demo and conclusion (draft)

## Implementation

The runtime uses the project's tokenizer and parser, then checks each connection between consecutive steps before starting a run. Generated code and the run server use runtime checks too, because a model can return a value that does not match its declared type or text length.

The API call is kept in a small function, and the API key is read from the environment or the local ignored `.env` file. Mock mode is the default. Mock runs return sample text and do not call an LLM. The cost and time shown before a run are estimates based on approximate token counts. The sample prices are illustrative values for showing the calculation; they are not stated as any provider's real prices. A real API comparison needs the provider, model, date, current prices, and actual usage from a run.

## Demo

The demo reads `examples/demo-input.txt` and tries three cases. A valid chain runs with sample mock output. A broken chain is rejected before any model call. A third chain returns sample text over its declared runtime limit and is stopped by the runtime check. These examples show the program flow; they are not measurements of an LLM's quality, latency, or cost.

Any evaluation results in this section must be filled in from the team's recorded runs. The code does not provide benchmark numbers by itself.

## Conclusion

PromptLang is a small experiment in checking prompt-chain contracts before execution and checking model results during execution. The current evaluation is limited to the test chains and provider runs collected by the team. Future work could use better token counting, more output schemas, retries, and checks over branching chains.

## Fill in after real runs

- Provider, model, date, and input/output prices: [record here]
- Estimated cost and time: [record output from the demo]
- Actual cost and time: [record API usage and stopwatch result]
- Difference between estimate and actual: [calculate from the recorded values]
- Cost of one failed run and number of prevented retries: [use measured usage]
- Limitations or API errors seen: [record honestly]