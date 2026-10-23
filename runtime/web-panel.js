"use strict";

const source = document.querySelector("#source-input");
const prompt = document.querySelector("#run-input");
const runButton = document.querySelector("#check-and-run");
const output = document.querySelector("#run-output");
const estimate = document.querySelector("#run-estimate");

async function run() {
  output.textContent = "";
  estimate.textContent = "Getting estimate...";
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

    const response = await fetch("/api/run", request);
    const result = await response.json();
    if (result.estimate) estimate.textContent = result.estimate;
    if (!response.ok) {
      output.textContent = result.error || "The chain was stopped before running";
      return;
    }
    output.textContent = result.error || (typeof result.answer === "string" ? result.answer : JSON.stringify(result.answer, null, 2));
    if (result.measurement) {
      const measured = result.measurement.actualCostUsd === null
        ? "actual cost unavailable"
        : "actual cost $" + result.measurement.actualCostUsd.toFixed(6);
      estimate.textContent += " Actual run: " + result.measurement.actualTimeSeconds.toFixed(2) + " seconds; " + measured + ". " + result.measurement.note;
    }
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : String(error);
  }
}

runButton.addEventListener("click", () => void run());