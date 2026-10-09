import { tokenize, parse, ParseError, type Step } from "../parser/parser";
import { checkChain, type ChainCheckResult } from "./check";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function initApp(): void {
  const sourceInput = document.getElementById("source-input") as HTMLTextAreaElement | null;
  const checkBtn = document.getElementById("check-btn") as HTMLButtonElement | null;
  const errorContainer = document.getElementById("error-container") as HTMLElement | null;
  const errorMessage = document.getElementById("error-message") as HTMLElement | null;
  const visualizationSection = document.getElementById("visualization-section") as HTMLElement | null;
  const chainFlow = document.getElementById("chain-flow") as HTMLElement | null;
  const chainStatus = document.getElementById("chain-status") as HTMLElement | null;

  const loadValidBtn = document.getElementById("load-valid-btn") as HTMLButtonElement | null;
  const loadBrokenBtn = document.getElementById("load-broken-btn") as HTMLButtonElement | null;
  const loadLimitsBtn = document.getElementById("load-limits-btn") as HTMLButtonElement | null;

  if (!sourceInput || !checkBtn || !errorContainer || !errorMessage || !chainFlow) {
    console.error("Missing required DOM elements");
    return;
  }

  const VALID_EXAMPLE =
    "step summarize: in=text, out=text -> step translate: in=text, out=text -> step format: in=text, out=list";

  const BROKEN_EXAMPLE =
    "step summarize: in=text, out=text -> step format: in=text, out=list -> step email: in=text, out=text";

  const LIMITS_EXAMPLE =
    "step shorten: in=text, out=text[max 280] -> step translate: in=text[max 1000], out=text";

  function render(): void {
    const source = sourceInput!.value.trim();

    if (!source) {
      errorContainer!.style.display = "none";
      if (visualizationSection) visualizationSection.style.display = "block";
      chainFlow!.style.display = "block";
      chainFlow!.innerHTML = `
        <div class="empty-state">
          Enter PromptLang code above and click <strong>Check</strong> to visualize the chain.
        </div>
      `;
      if (chainStatus) {
        chainStatus.className = "chain-status-badge";
        chainStatus.textContent = "Waiting for input";
        chainStatus.style.display = "inline-flex";
      }
      return;
    }

    try {
      const tokens = tokenize(source);
      const steps = parse(tokens);

      // Hide error alert when parse succeeds
      errorContainer!.style.display = "none";
      if (visualizationSection) visualizationSection.style.display = "block";
      chainFlow!.style.display = "flex";
      chainFlow!.innerHTML = "";

      if (steps.length === 0) {
        chainFlow!.innerHTML = `
          <div class="empty-state">No steps found in input.</div>
        `;
        if (chainStatus) chainStatus.style.display = "none";
        return;
      }

      // Check consecutive type matching using checkChain
      const checkResults = checkChain(steps);
      const hasMismatch = checkResults.some((r) => !r.ok);

      // Render step cards and connecting arrows
      steps.forEach((step, index) => {
        // Step box
        const stepCard = document.createElement("div");
        stepCard.className = "step-card";

        const inLimitHtml =
          step.inMax !== undefined
            ? `<span class="limit-badge">[max ${step.inMax}]</span>`
            : "";
        const outLimitHtml =
          step.outMax !== undefined
            ? `<span class="limit-badge">[max ${step.outMax}]</span>`
            : "";

        stepCard.innerHTML = `
          <div class="step-header">
            <span class="step-tag">Step ${index + 1}</span>
            <div class="step-name">${escapeHtml(step.name)}</div>
          </div>
          <div class="step-ports">
            <div class="port-row port-in">
              <span class="port-label">in</span>
              <span class="type-pill">${escapeHtml(step.inType)}${inLimitHtml}</span>
            </div>
            <div class="port-row port-out">
              <span class="port-label">out</span>
              <span class="type-pill">${escapeHtml(step.outType)}${outLimitHtml}</span>
            </div>
          </div>
        `;
        chainFlow!.appendChild(stepCard);

        // Arrow between consecutive steps
        if (index < steps.length - 1) {
          const check = checkResults.find((r) => r.fromIndex === index);
          const isOk = check ? check.ok : true;

          const connector = document.createElement("div");
          connector.className = `chain-connector ${isOk ? "connector-ok" : "connector-error"}`;

          const errorHtml = !isOk && check?.message
            ? `<div class="connector-error-message">${escapeHtml(check.message)}</div>`
            : "";

          connector.innerHTML = `
            <div class="arrow-line-container">
              <svg class="arrow-svg" width="70" height="20" viewBox="0 0 70 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 10 H56" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <path d="M52 4 L64 10 L52 16 Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
              </svg>
            </div>
            ${errorHtml}
          `;
          chainFlow!.appendChild(connector);
        }
      });

      // Update chain status badge
      if (chainStatus) {
        chainStatus.style.display = "inline-flex";
        if (hasMismatch) {
          chainStatus.className = "chain-status-badge status-mismatch";
          chainStatus.textContent = "Type Mismatch";
        } else {
          chainStatus.className = "chain-status-badge status-ok";
          chainStatus.textContent = `Valid Chain (${steps.length} steps)`;
        }
      }
    } catch (err) {
      // If parse throws ParseError, show the message in a red box instead of the chain
      if (err instanceof ParseError) {
        errorContainer!.style.display = "block";
        errorMessage!.textContent = err.message;
        if (visualizationSection) visualizationSection.style.display = "none";
        chainFlow!.innerHTML = "";
      } else {
        errorContainer!.style.display = "block";
        errorMessage!.textContent = (err as Error).message || String(err);
        if (visualizationSection) visualizationSection.style.display = "none";
        chainFlow!.innerHTML = "";
      }
    }
  }

  checkBtn.addEventListener("click", render);

  sourceInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      render();
    }
  });

  if (loadValidBtn) {
    loadValidBtn.addEventListener("click", () => {
      sourceInput.value = VALID_EXAMPLE;
      render();
    });
  }

  if (loadBrokenBtn) {
    loadBrokenBtn.addEventListener("click", () => {
      sourceInput.value = BROKEN_EXAMPLE;
      render();
    });
  }

  if (loadLimitsBtn) {
    loadLimitsBtn.addEventListener("click", () => {
      sourceInput.value = LIMITS_EXAMPLE;
      render();
    });
  }

  // Pre-populate with valid example and render initially
  sourceInput.value = VALID_EXAMPLE;
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
