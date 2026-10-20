export interface WebPanelOptions {
  runEndpoint: string;
  checkEndpoint: string;
  estimateEndpoint: string;
}

// Connects two simple buttons to a small trusted server endpoint.
// The API key stays on the server and is never sent from this page.
export function connectRunPanel(options: WebPanelOptions): void {
  const source = document.querySelector<HTMLTextAreaElement>("#source-input");
  const prompt = document.querySelector<HTMLTextAreaElement>("#run-input");
  const retryCount = document.querySelector<HTMLInputElement>("#retry-count");
  const runUnchecked = document.querySelector<HTMLButtonElement>("#run-without-checking");
  const checkFirst = document.querySelector<HTMLButtonElement>("#check-first");
  const output = document.querySelector<HTMLElement>("#run-output");
  const estimate = document.querySelector<HTMLElement>("#run-estimate");
  if (!source || !prompt || !runUnchecked || !checkFirst || !output || !estimate) return;

  const send = async (check: boolean): Promise<void> => {
    output.textContent = "Running...";
    estimate.textContent = "";
    try {
      const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: source.value, input: prompt.value }),
      };
      const estimateResponse = await fetch(options.estimateEndpoint, requestOptions);
      const estimateResult = (await estimateResponse.json()) as { estimate?: string; error?: string };
      if (!estimateResponse.ok) throw new Error(estimateResult.error ?? `Estimate failed (${estimateResponse.status})`);
      estimate.textContent = estimateResult.estimate ?? "";

      const response = await fetch(check ? options.checkEndpoint : options.runEndpoint, requestOptions);
      const result = (await response.json()) as {
        answer?: unknown;
        error?: string;
        estimate?: string;
        measurement?: { actualTimeSeconds: number; actualCostUsd: number | null; costDifferenceUsd: number | null; note: string };
      };
      if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
      output.textContent = result.error ?? (typeof result.answer === "string" ? result.answer : JSON.stringify(result.answer, null, 2));
      if (result.estimate) estimate.textContent = result.estimate;
      if (result.measurement) {
        const measuredCost = result.measurement.actualCostUsd === null
          ? "actual cost unavailable"
          : `actual cost $${result.measurement.actualCostUsd.toFixed(6)} (difference from estimate $${result.measurement.costDifferenceUsd?.toFixed(6)})`;
        const retries = Math.max(0, Number(retryCount?.value ?? 0));
        const saved = result.measurement.actualCostUsd === null
          ? ""
          : ` Potentially avoided for ${retries} repeated runs: $${(result.measurement.actualCostUsd * retries).toFixed(6)} (same cost assumed for each retry).`;
        estimate.textContent += ` Actual run: ${result.measurement.actualTimeSeconds.toFixed(2)} seconds, ${measuredCost}.${saved} ${result.measurement.note}`;
      }
    } catch (error) {
      output.textContent = error instanceof Error ? error.message : String(error);
    }
  };

  runUnchecked.addEventListener("click", () => void send(false));
  checkFirst.addEventListener("click", () => void send(true));
}

if (typeof document !== "undefined") {
  connectRunPanel({
    runEndpoint: "/api/run",
    checkEndpoint: "/api/check-and-run",
    estimateEndpoint: "/api/estimate",
  });
}
