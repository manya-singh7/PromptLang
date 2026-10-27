# PromptLang Simulated Savings Benchmark Results

Generated: 2026-10-27T22:28:00.241Z

## 1. Simulation Methodology & Key Assumptions

This benchmark is a **simulation** (not an empirical measurement of live provider billing or live API latency). It models the quantitative savings of PromptLang's static type checker vs. naive runtime execution across 40 seeded pipelines (30 broken pipelines exhibiting type mismatches and length limit violations, and 10 valid reference pipelines).

### Explicit Simulation Assumptions:
- **Assumed Output Tokens per Wasted Call**: Unbounded text steps and structured JSON/list steps are modeled assuming 500 output characters (~125 tokens per step at 4 chars/token). Steps with declared `outMax` are modeled as `min(500, outMax)` characters.
- **Assumed Latency per Step**:
  - **GPT-4o**: assumed 1,200 ms per step
  - **Claude 3.5 Sonnet**: assumed 1,500 ms per step
  - **Gemini 1.5 Flash**: assumed 600 ms per step
  - **PromptLang Sample**: assumed 1,000 ms per step
- **Example Provider Pricing (October 2024)**: Provider token prices are example benchmark rates set as of **October 2024** and may be out of date. Actual costs will vary with provider rate updates, volume discounts, batch APIs, and prompt caching.

### Execution Models:
- **PromptLang Guarded Execution**: Statically validates prompt contract compatibility and length limits before making any model calls. When a chain contains a type mismatch or contract violation, it blocks execution immediately with **0 tokens consumed, 0 API calls made, and $0.00 spent**.
- **Naive Runtime Baseline**: Executes steps sequentially until the runtime crashes at the mismatched step. All API calls, token usage, dollar spend, and network latency incurred prior to the failure are completely wasted.

### Modeled Results Across Presets

| Model / Provider Preset | Input Rate (/1M) | Output Rate (/1M) | Prevented API Calls | Prevented Tokens | Net Dollars Saved ($) | Modeled Time Saved (s) | Avg Check Overhead |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **GPT-4o** (OpenAI) | $2.50 | $10.00 | 52 | 10,640 | **$0.0725** | 62.4s | 0.027 ms |
| **Claude 3.5 Sonnet** (Anthropic) | $3.00 | $15.00 | 52 | 10,640 | **$0.1054** | 78.0s | 0.009 ms |
| **Gemini 1.5 Flash** (Google) | $0.075 | $0.30 | 52 | 10,640 | **$0.0022** | 31.2s | 0.011 ms |
| **PromptLang Sample** (Sample Preset) | $0.25 | $1.50 | 52 | 10,640 | **$0.0103** | 52.0s | 0.007 ms |

## 2. Key Findings for Paper Section 3

- **Modeled Prevented API Calls**: **52 calls** across 30 broken pipelines (100% of preventable failed runs blocked upfront).
- **Modeled Prevented Token Waste**: **10,640 tokens** (4,514 input tokens + 6,126 output tokens).
- **Modeled Net Dollars Saved**: Up to **$0.1054** for Claude 3.5 Sonnet and **$0.0725** for GPT-4o per simulated test suite pass.
- **Modeled Time Saved**: **62.4 seconds** of avoided roundtrip latency (calculated using the assumed 1200 ms latency per step).
- **Static Check Verification**: Upfront type check executes in **0.027 ms** per pipeline; compared to the assumed network latency of 1200 ms per step, static check rejection avoids waiting for failing network roundtrips.
- **Valid Reference Chains**: All 10 valid reference pipelines in the test set passed static checking and simulated execution to completion without being blocked.

## 3. Detailed Per-Chain Breakdown (30 Broken Pipelines)

Breakdown using **GPT-4o** rates ($2.5/M in, $10/M out):

| File | Total Steps | Category | Failed At Step | Wasted Calls | Wasted Tokens (In / Out) | Net Dollars Saved | Guarded Result |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `01_text_to_list_2steps.promptlang` | 2 | type-mismatch | Step 2 | 1 | 49 / 125 | **$0.00137** | Blocked (0 calls) |
| `02_list_to_json_2steps.promptlang` | 2 | type-mismatch | Step 2 | 1 | 50 / 125 | **$0.00137** | Blocked (0 calls) |
| `03_json_to_text_2steps.promptlang` | 2 | type-mismatch | Step 2 | 1 | 51 / 125 | **$0.00138** | Blocked (0 calls) |
| `04_text_to_json_first_pair_3steps.promptlang` | 3 | type-mismatch | Step 2 | 1 | 49 / 125 | **$0.00137** | Blocked (0 calls) |
| `05_list_to_text_last_pair_3steps.promptlang` | 3 | type-mismatch | Step 3 | 2 | 201 / 250 | **$0.00300** | Blocked (0 calls) |
| `06_json_to_list_first_pair_3steps.promptlang` | 3 | type-mismatch | Step 2 | 1 | 49 / 125 | **$0.00137** | Blocked (0 calls) |
| `07_middle_mismatch_4steps.promptlang` | 4 | type-mismatch | Step 3 | 2 | 201 / 250 | **$0.00300** | Blocked (0 calls) |
| `08_first_mismatch_4steps.promptlang` | 4 | type-mismatch | Step 2 | 1 | 50 / 125 | **$0.00137** | Blocked (0 calls) |
| `09_last_mismatch_4steps.promptlang` | 4 | type-mismatch | Step 4 | 3 | 353 / 375 | **$0.00463** | Blocked (0 calls) |
| `10_two_errors_4steps.promptlang` | 4 | type-mismatch | Step 2 | 1 | 50 / 125 | **$0.00137** | Blocked (0 calls) |
| `11_middle_mismatch_5steps.promptlang` | 5 | type-mismatch | Step 4 | 3 | 353 / 375 | **$0.00463** | Blocked (0 calls) |
| `12_first_and_last_mismatch_5steps.promptlang` | 5 | type-mismatch | Step 2 | 1 | 49 / 125 | **$0.00137** | Blocked (0 calls) |
| `13_adjacent_two_errors_5steps.promptlang` | 5 | type-mismatch | Step 3 | 2 | 202 / 250 | **$0.00300** | Blocked (0 calls) |
| `14_single_mismatch_6steps.promptlang` | 6 | type-mismatch | Step 5 | 4 | 506 / 500 | **$0.00626** | Blocked (0 calls) |
| `15_two_errors_6steps.promptlang` | 6 | type-mismatch | Step 3 | 2 | 202 / 250 | **$0.00300** | Blocked (0 calls) |
| `16_unbounded_into_bounded_2steps.promptlang` | 2 | limit-violation | Step 2 | 1 | 50 / 125 | **$0.00137** | Blocked (0 calls) |
| `17_greater_limit_into_smaller_2steps.promptlang` | 2 | limit-violation | Step 2 | 1 | 50 / 125 | **$0.00137** | Blocked (0 calls) |
| `18_slight_overflow_limit_2steps.promptlang` | 2 | limit-violation | Step 2 | 1 | 51 / 71 | **$0.00084** | Blocked (0 calls) |
| `19_unbounded_to_bounded_first_pair_3steps.promptlang` | 3 | limit-violation | Step 2 | 1 | 51 / 125 | **$0.00138** | Blocked (0 calls) |
| `20_exceeded_limit_last_pair_3steps.promptlang` | 3 | limit-violation | Step 3 | 2 | 200 / 250 | **$0.00300** | Blocked (0 calls) |
| `21_unbounded_to_bounded_middle_pair_3steps.promptlang` | 3 | limit-violation | Step 3 | 2 | 152 / 200 | **$0.00238** | Blocked (0 calls) |
| `22_exceeded_limit_middle_4steps.promptlang` | 4 | limit-violation | Step 3 | 2 | 128 / 175 | **$0.00207** | Blocked (0 calls) |
| `23_unbounded_at_start_4steps.promptlang` | 4 | limit-violation | Step 2 | 1 | 50 / 125 | **$0.00137** | Blocked (0 calls) |
| `24_two_limit_violations_4steps.promptlang` | 4 | limit-violation | Step 2 | 1 | 50 / 125 | **$0.00137** | Blocked (0 calls) |
| `25_large_gap_limit_middle_5steps.promptlang` | 5 | limit-violation | Step 4 | 3 | 354 / 375 | **$0.00464** | Blocked (0 calls) |
| `26_unbounded_at_end_5steps.promptlang` | 5 | limit-violation | Step 5 | 4 | 411 / 405 | **$0.00508** | Blocked (0 calls) |
| `27_two_exceeded_limits_5steps.promptlang` | 5 | limit-violation | Step 3 | 2 | 200 / 250 | **$0.00300** | Blocked (0 calls) |
| `28_exceeded_limit_first_pair_6steps.promptlang` | 6 | limit-violation | Step 2 | 1 | 50 / 125 | **$0.00137** | Blocked (0 calls) |
| `29_unbounded_middle_6steps.promptlang` | 6 | limit-violation | Step 4 | 3 | 252 / 275 | **$0.00338** | Blocked (0 calls) |
| `30_two_violations_ends_6steps.promptlang` | 6 | type-mismatch | Step 2 | 1 | 50 / 125 | **$0.00137** | Blocked (0 calls) |

## 4. Valid Pipelines Verification (10 Reference Chains)

| File | Total Steps | Naive Result | Guarded Result | Static Check Time | Completed Calls |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `01_plain_text_2steps.promptlang` | 2 | Completed | Completed | 0.003 ms | 2 |
| `02_smaller_limit_to_larger_2steps.promptlang` | 2 | Completed | Completed | 0.008 ms | 2 |
| `03_equal_limits_2steps.promptlang` | 2 | Completed | Completed | 0.006 ms | 2 |
| `04_limit_into_unbounded_3steps.promptlang` | 3 | Completed | Completed | 0.011 ms | 3 |
| `05_plain_json_and_list_3steps.promptlang` | 3 | Completed | Completed | 0.008 ms | 3 |
| `06_tightening_and_widening_limits_4steps.promptlang` | 4 | Completed | Completed | 0.012 ms | 4 |
| `07_mixed_types_with_limits_4steps.promptlang` | 4 | Completed | Completed | 0.016 ms | 4 |
| `08_chain_of_five_steps.promptlang` | 5 | Completed | Completed | 0.018 ms | 5 |
| `09_homogeneous_list_chain_5steps.promptlang` | 5 | Completed | Completed | 0.018 ms | 5 |
| `10_six_steps_full_variety.promptlang` | 6 | Completed | Completed | 0.010 ms | 6 |

---
*Data generated automatically by `scripts/benchmark-savings.ts`.*