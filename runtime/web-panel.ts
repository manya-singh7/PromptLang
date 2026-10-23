export interface WebPanelOptions {
  runEndpoint: string;
  estimateEndpoint: string;
}

// The browser only calls the local server. The server checks the chain before any model call.
export function connectRunPanel(options: WebPanelOptions): void {
  const source = document.querySelector<HTMLTextAreaElement>("#source-input");
  const prompt = document.querySelector<HTMLTextAreaElement>("#run-input");
  const runButton = document.querySelector<HTMLButtonElement>("#check-and-run");
  const output = document.querySelector<HTMLElement>("#run-output");
  const estimate = document.querySelector<HTMLElement>("#run-estimate");
  if (!source || !prompt || !runButton || !output || !estimate) return;

  runButton.addEventListener("click", () => void run());

  async function run(): Promise<void> {
    output.textContent = "";
    estimate.textContent = "Getting estimate...";
    const request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: source.value, input: prompt.value }),
    };
    try {
      const estimateResponse = await fetch(options.estimateEndpoint, request);
      const estimateResult = await estimateResponse.json() as { estimate?: string; error?: string };
      if (!estimateResponse.ok) throw new Error(estimateResult.error ?? "Could not estimate this chain");
      estimate.textContent = estimateResult.estimate ?? "";
      const response = await fetch(options.runEndpoint, request);
      const result = await response.json() as {
        answer?: unknown;
        error?: string;
        estimate?: string;
        measurement?: { actualTimeSeconds: number; actualCostUsd: number | null; note: string };
      };
      if (result.estimate) estimate.textContent = result.estimate;
      if (!response.ok) {
        output.textContent = result.error ?? "The chain was stopped before running";
        return;
      }
      output.textContent = result.error ?? (typeof result.answer === "string" ? result.answer : JSON.stringify(result.answer, null, 2));
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
}

if (typeof document !== "undefined") {
  connectRunPanel({ runEndpoint: "/api/run", estimateEndpoint: "/api/estimate" });
}