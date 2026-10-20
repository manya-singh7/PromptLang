"use strict";

const source = document.querySelector("#source-input");
const prompt = document.querySelector("#run-input");
const retryCount = document.querySelector("#retry-count");
const runButton = document.querySelector("#run-without-checking");
const checkButton = document.querySelector("#check-first");
const output = document.querySelector("#run-output");
const estimate = document.querySelector("#run-estimate");

async function run(checkFirst) {
  output.textContent = "Working...";
  estimate.textContent = "";
  const request = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: source.value, input: prompt.value }),
  };

  try {
    const estimateResponse = await fetch("/api/estimate", request);
    const estimateResult = await estimateResponse.json();
    if (!estimateResponse.ok) throw new Error(estimateResult.error || "Could not estimate this chain");
    estimate.textContent = estimateResult.estimate;

    const path = checkFirst ? "/api/check-and-run" : "/api/run";
    const response = await fetch(path, request);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The run failed");
    output.textContent = result.error || (typeof result.answer === "string" ? result.answer : JSON.stringify(result.answer, null, 2));

    const measured = result.measurement;
    if (measured) {
      const cost = measured.actualCostUsd === null
        ? "actual cost unavailable"
        : `actual cost $${measured.actualCostUsd.toFixed(6)}, difference $${measured.costDifferenceUsd.toFixed(6)}`;
      const retries = Math.max(0, Number(retryCount.value || 0));
      const saved = measured.actualCostUsd === null
        ? ""
        : ` Potentially avoided for ${retries} repeated runs: $${(measured.actualCostUsd * retries).toFixed(6)} (same cost assumed for each retry).`;
      estimate.textContent += ` Actual run: ${measured.actualTimeSeconds.toFixed(2)} seconds; ${cost}.${saved} ${measured.note}`;
    }
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : String(error);
  }
}

runButton.addEventListener("click", () => void run(false));
checkButton.addEventListener("click", () => void run(true));
