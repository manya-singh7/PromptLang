# Section 3: Implementation, demo and conclusion (draft)

## Implementation

The implementation is split into a parser, a checker, and a code generation part. The parser reads each step's name and declared input and output types. After the chain has been checked, the generator writes a TypeScript program that calls the steps in order. The generated runtime checks each answer against the declared output type and text length limit. This is needed because an LLM response is not guaranteed to follow its requested format.

The API call is kept behind a small function so a provider can be changed without changing the chain runner. The API key is read from the environment. The cost estimate uses an approximate character-to-token rule and prices entered for the selected model. It should be shown as a rough estimate, then compared with usage and timing from an actual run.

## Demo

The demo uses a short chain with a type mismatch. The checker reports the mismatch before the API is called. A corrected chain can then be run, and each generated step checks its returned value. Any evaluation results in this section must be filled in from the team's recorded runs; the code does not provide benchmark numbers by itself.

## Conclusion

PromptLang is a small experiment in checking prompt-chain contracts before execution and checking model results during execution. The current evaluation is limited to the test chains and provider runs collected by the team. Future work could use better token counting, more output schemas, retries, and checks over branching chains.

## Fill in after real runs

- Provider, model, date, and input/output prices: [record here]
- Estimated cost and time: [record output from the demo]
- Actual cost and time: [record API usage and stopwatch result]
- Difference between estimate and actual: [calculate from the recorded values]
- Cost of one failed run and number of prevented retries: [use measured usage]
- Limitations or API errors seen: [record honestly]
