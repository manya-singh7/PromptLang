import { tokenize, parse, ParseError, type Step } from "../parser/parser";
import { analyze } from "../parser/semantic";
import { checkChain, type ChainCheckResult } from "./check";
import { estimateRun } from "../runtime/estimate";
import type { PriceSettings, PromptStep } from "../runtime/types";

const ILLUSTRATIVE_PRICES: PriceSettings = {
  inputUsdPerMillion: 0.25,
  outputUsdPerMillion: 1.5,
  expectedOutputCharsPerStep: 500,
};

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function computeStages(steps: Step[]): Step[][] {
  const stepMap = new Map<string, Step>();
  steps.forEach((s) => stepMap.set(s.name, s));

  const levels = new Map<string, number>();

  function getLevel(step: Step, visited = new Set<string>()): number {
    if (levels.has(step.name)) return levels.get(step.name)!;
    if (visited.has(step.name)) return 0;
    visited.add(step.name);

    const deps = step.inputsFrom || [];
    if (deps.length === 0) {
      levels.set(step.name, 0);
      return 0;
    }

    let maxDepLevel = 0;
    for (const depName of deps) {
      const depStep = stepMap.get(depName);
      if (depStep) {
        maxDepLevel = Math.max(maxDepLevel, getLevel(depStep, visited) + 1);
      }
    }

    levels.set(step.name, maxDepLevel);
    return maxDepLevel;
  }

  for (const step of steps) {
    getLevel(step);
  }

  const maxLevel = Math.max(0, ...Array.from(levels.values()));
  const stages: Step[][] = [];
  for (let l = 0; l <= maxLevel; l++) {
    stages.push([]);
  }

  for (const step of steps) {
    const l = levels.get(step.name) ?? 0;
    stages[l]!.push(step);
  }

  return stages;
}

function findEdgeCheck(
  fromStep: Step,
  toStep: Step,
  fromIndex: number,
  checkResults: ChainCheckResult[]
): ChainCheckResult | undefined {
  return checkResults.find((r) => {
    if ((r as any).fromName === fromStep.name && (r as any).toName === toStep.name) {
      return true;
    }
    if (r.fromIndex === fromIndex) {
      if (!r.ok && r.message && r.message.includes(`"${toStep.name}"`)) {
        return true;
      }
      if (r.ok && !(r as any).toName) {
        return true;
      }
    }
    return false;
  });
}

function createStepCardElement(
  step: Step,
  stepNumber: number,
  isError: boolean,
  errorPortText?: string
): HTMLElement {
  const stepCard = document.createElement("div");
  stepCard.className = `step-card${isError ? " step-card-error" : ""}`;

  const inLimitHtml =
    step.inMax !== undefined
      ? `<span class="limit-badge">[max ${step.inMax}]</span>`
      : "";
  const outLimitHtml =
    step.outMax !== undefined
      ? `<span class="limit-badge">[max ${step.outMax}]</span>`
      : "";

  const inErrorHtml = errorPortText
    ? `<div class="port-in-error">${escapeHtml(errorPortText)}</div>`
    : "";

  stepCard.innerHTML = `
    <div class="step-header">
      <span class="step-tag">Step ${stepNumber}</span>
      <div class="step-name">${escapeHtml(step.name)}</div>
    </div>
    <div class="step-ports">
      <div class="port-row port-in">
        <span class="port-label">in</span>
        <span class="type-pill" title="${escapeHtml(step.inType)}">${escapeHtml(step.inType)}${inLimitHtml}</span>
      </div>
      ${inErrorHtml}
      <div class="port-row port-out">
        <span class="port-label">out</span>
        <span class="type-pill" title="${escapeHtml(step.outType)}">${escapeHtml(step.outType)}${outLimitHtml}</span>
      </div>
    </div>
  `;
  return stepCard;
}

function initApp(): void {
  const sourceInput = document.getElementById("source-input") as HTMLTextAreaElement | null;
  const checkBtn = document.getElementById("check-btn") as HTMLButtonElement | null;
  const errorContainer = document.getElementById("error-container") as HTMLElement | null;
  const errorMessage = document.getElementById("error-message") as HTMLElement | null;
  const errorTitle = errorContainer?.querySelector(".error-title") as HTMLElement | null;
  const visualizationSection = document.getElementById("visualization-section") as HTMLElement | null;
  const chainSummary = document.getElementById("chain-summary") as HTMLElement | null;
  const costEstimate = document.getElementById("cost-estimate") as HTMLElement | null;
  const chainFlow = document.getElementById("chain-flow") as HTMLElement | null;
  const chainStatus = document.getElementById("chain-status") as HTMLElement | null;

  const loadValidBtn = document.getElementById("load-valid-btn") as HTMLButtonElement | null;
  const loadBrokenBtn = document.getElementById("load-broken-btn") as HTMLButtonElement | null;
  const loadLimitsBtn = document.getElementById("load-limits-btn") as HTMLButtonElement | null;
  const loadDagBtn = document.getElementById("load-dag-btn") as HTMLButtonElement | null;
  const loadSchemaBtn = document.getElementById("load-schema-btn") as HTMLButtonElement | null;

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

  // Exact DAG syntax from README: fan-out to branchA, branchB and fan-in to finish
  const DAG_EXAMPLE =
    "step start: in=text, out=text -> (step branchA: in=text, out=text, step branchB: in=text, out=text) -> step finish: in=text, out=text";

  // JSON Schema-aware typing examples from README: valid subtyping and field mismatch
  const SCHEMA_VALID_EXAMPLE =
    "step extract: in=text, out=json{title:text,tags:list,score:number} -> step render: in=json{title:text,tags:list}, out=text";

  const SCHEMA_MISMATCH_EXAMPLE =
    "step extract: in=text, out=json{title:text,tags:list,score:number} -> step render: in=json{title:text,tags:text}, out=text";

  let lastSchemaLoaded: "valid" | "mismatch" = "mismatch";

  function showErrorTitle(title: string): void {
    if (errorTitle) errorTitle.innerHTML = `<span>❌</span> ${escapeHtml(title)}`;
  }

  function render(): void {
    const source = sourceInput!.value.trim();

    if (!source) {
      errorContainer!.style.display = "none";
      if (visualizationSection) visualizationSection.style.display = "block";
      if (chainSummary) chainSummary.style.display = "none";
      if (costEstimate) costEstimate.style.display = "none";
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

      // Measure parse plus checkChain execution time with performance.now()
      const t0 = performance.now();
      const steps = parse(tokens);

      // Semantic issues block the diagram, shown in red error box
      const issues = analyze(steps);
      if (issues.length > 0) {
        if (chainSummary) chainSummary.style.display = "none";
        if (costEstimate) costEstimate.style.display = "none";
        showErrorTitle(issues.length === 1 ? "Semantic Error" : `${issues.length} Semantic Errors`);
        errorContainer!.style.display = "block";
        errorMessage!.innerHTML = issues
          .map((issue) => `<div>${escapeHtml(issue.message)}</div>`)
          .join("");
        if (visualizationSection) visualizationSection.style.display = "none";
        chainFlow!.innerHTML = "";
        return;
      }

      const checkResults = checkChain(steps);
      const t1 = performance.now();
      const elapsedMs = (t1 - t0).toFixed(1);

      // Hide error alert when parse succeeds
      errorContainer!.style.display = "none";
      if (visualizationSection) visualizationSection.style.display = "block";
      chainFlow!.style.display = "flex";
      chainFlow!.innerHTML = "";

      if (steps.length === 0) {
        if (chainSummary) chainSummary.style.display = "none";
        if (costEstimate) costEstimate.style.display = "none";
        chainFlow!.innerHTML = `
          <div class="empty-state">No steps found in input.</div>
        `;
        if (chainStatus) chainStatus.style.display = "none";
        return;
      }

      // Calculate error count from checkChain
      const errorCount = checkResults.filter((r) => !r.ok).length;

      // Update summary line above the chain
      if (chainSummary) {
        chainSummary.style.display = "flex";
        if (errorCount === 0) {
          chainSummary.innerHTML = `
            <span class="summary-status status-ok">No errors found</span>
            <span class="summary-time">checked in ${elapsedMs} ms</span>
          `;
        } else {
          chainSummary.innerHTML = `
            <span class="summary-status status-error">${errorCount} error(s) found</span>
            <span class="summary-time">checked in ${elapsedMs} ms</span>
          `;
        }
      }

      // Update Estimated cost (illustrative) line using estimateRun from runtime/
      if (costEstimate) {
        const estimate = estimateRun(steps as PromptStep[], "Sample prompt input", ILLUSTRATIVE_PRICES);
        costEstimate.style.display = "flex";
        costEstimate.innerHTML = `
          <span class="cost-estimate-label">Estimated cost (illustrative):</span>
          <span class="cost-estimate-value">about $${estimate.costUsd.toFixed(6)}</span>
          <span class="cost-estimate-details">(${estimate.inputTokens} in / ${estimate.outputTokens} out tokens, ~${estimate.timeLowSeconds}–${estimate.timeHighSeconds}s)</span>
          <span class="cost-estimate-note">— rough estimate based on sample rates ($0.25/M in, $1.50/M out); no API call or charge</span>
        `;
      }

      const stepIndexMap = new Map<string, number>();
      steps.forEach((s, idx) => stepIndexMap.set(s.name, idx));

      const isDag = steps.some(
        (s) =>
          (s.inputsFrom && s.inputsFrom.length > 1) ||
          (s.outputsTo && s.outputsTo.length > 1)
      );

      if (!isDag) {
        // Linear chain rendering (horizontal flow)
        steps.forEach((step, index) => {
          const incomingCheck =
            index > 0 ? checkResults.find((r) => r.fromIndex === index - 1) : undefined;
          const hasInputMismatch = Boolean(incomingCheck && !incomingCheck.ok);
          const prevStep = index > 0 ? steps[index - 1] : undefined;
          const errorPortText =
            hasInputMismatch && prevStep
              ? `expects ${step.inType}, got ${prevStep.outType}`
              : undefined;

          const stepCard = createStepCardElement(step, index + 1, hasInputMismatch, errorPortText);
          chainFlow!.appendChild(stepCard);

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
                <svg class="arrow-svg" width="90" height="26" viewBox="0 0 90 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 13 H74" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                  <path d="M68 6 L84 13 L68 20 Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                </svg>
              </div>
              ${errorHtml}
            `;
            chainFlow!.appendChild(connector);
          }
        });
      } else {
        // DAG branching layout: steps in the same stage side by side
        const stages = computeStages(steps);
        const dagContainer = document.createElement("div");
        dagContainer.className = "dag-container";

        stages.forEach((stageSteps, stageIdx) => {
          // 1. Render the steps in this stage side by side
          const stageRow = document.createElement("div");
          stageRow.className = "dag-stage-row";

          stageSteps.forEach((step) => {
            const stepIndex = stepIndexMap.get(step.name) ?? 0;
            const deps = step.inputsFrom || [];
            let hasIncomingMismatch = false;
            let portErrorMsg = "";

            for (const depName of deps) {
              const depStep = steps.find((s) => s.name === depName);
              if (depStep) {
                const depIdx = stepIndexMap.get(depStep.name) ?? 0;
                const check = findEdgeCheck(depStep, step, depIdx, checkResults);
                if (check && !check.ok) {
                  hasIncomingMismatch = true;
                  portErrorMsg = `expects ${step.inType}, got ${depStep.outType}`;
                  break;
                }
              }
            }

            const stepCard = createStepCardElement(
              step,
              stepIndex + 1,
              hasIncomingMismatch,
              portErrorMsg || undefined
            );
            stageRow.appendChild(stepCard);
          });

          dagContainer.appendChild(stageRow);

          // 2. Render connecting arrows to the next stage if not the last stage
          if (stageIdx < stages.length - 1) {
            const nextStageSteps = stages[stageIdx + 1]!;
            const connectorsRow = document.createElement("div");
            connectorsRow.className = "dag-connectors-row";

            // If fan-out from 1 step to multiple steps in next stage
            if (stageSteps.length === 1 && nextStageSteps.length > 1) {
              const sourceStep = stageSteps[0]!;
              const sourceIdx = stepIndexMap.get(sourceStep.name) ?? 0;

              nextStageSteps.forEach((targetStep) => {
                const check = findEdgeCheck(sourceStep, targetStep, sourceIdx, checkResults);
                const isOk = check ? check.ok : true;

                const connector = document.createElement("div");
                connector.className = `dag-branch-connector ${isOk ? "connector-ok" : "connector-error"}`;
                const errorHtml = !isOk && check?.message
                  ? `<div class="connector-error-message">${escapeHtml(check.message)}</div>`
                  : "";

                connector.innerHTML = `
                  <span class="dag-arrow-label">${escapeHtml(sourceStep.name)} → ${escapeHtml(targetStep.name)}</span>
                  <div class="arrow-line-container">
                    <svg class="arrow-svg arrow-vertical" width="32" height="38" viewBox="0 0 32 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M16 2 V28" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                      <path d="M9 22 L16 34 L23 22 Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                    </svg>
                  </div>
                  ${errorHtml}
                `;
                connectorsRow.appendChild(connector);
              });
            } else if (stageSteps.length > 1 && nextStageSteps.length === 1) {
              // Fan-in from multiple steps into 1 join step
              const targetStep = nextStageSteps[0]!;

              stageSteps.forEach((sourceStep) => {
                const sourceIdx = stepIndexMap.get(sourceStep.name) ?? 0;
                const check = findEdgeCheck(sourceStep, targetStep, sourceIdx, checkResults);
                const isOk = check ? check.ok : true;

                const connector = document.createElement("div");
                connector.className = `dag-branch-connector ${isOk ? "connector-ok" : "connector-error"}`;
                const errorHtml = !isOk && check?.message
                  ? `<div class="connector-error-message">${escapeHtml(check.message)}</div>`
                  : "";

                connector.innerHTML = `
                  <span class="dag-arrow-label">${escapeHtml(sourceStep.name)} → ${escapeHtml(targetStep.name)}</span>
                  <div class="arrow-line-container">
                    <svg class="arrow-svg arrow-vertical" width="32" height="38" viewBox="0 0 32 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M16 2 V28" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                      <path d="M9 22 L16 34 L23 22 Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                    </svg>
                  </div>
                  ${errorHtml}
                `;
                connectorsRow.appendChild(connector);
              });
            } else {
              // General N-to-M stage connection
              stageSteps.forEach((sourceStep) => {
                const sourceIdx = stepIndexMap.get(sourceStep.name) ?? 0;
                const targets = (sourceStep.outputsTo || []).filter((tName) =>
                  nextStageSteps.some((ns) => ns.name === tName)
                );

                targets.forEach((targetName) => {
                  const targetStep = nextStageSteps.find((ns) => ns.name === targetName)!;
                  const check = findEdgeCheck(sourceStep, targetStep, sourceIdx, checkResults);
                  const isOk = check ? check.ok : true;

                  const connector = document.createElement("div");
                  connector.className = `dag-branch-connector ${isOk ? "connector-ok" : "connector-error"}`;
                  const errorHtml = !isOk && check?.message
                    ? `<div class="connector-error-message">${escapeHtml(check.message)}</div>`
                    : "";

                  connector.innerHTML = `
                    <span class="dag-arrow-label">${escapeHtml(sourceStep.name)} → ${escapeHtml(targetStep.name)}</span>
                    <div class="arrow-line-container">
                      <svg class="arrow-svg arrow-vertical" width="32" height="38" viewBox="0 0 32 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16 2 V28" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                        <path d="M9 22 L16 34 L23 22 Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                      </svg>
                    </div>
                    ${errorHtml}
                  `;
                  connectorsRow.appendChild(connector);
                });
              });
            }

            dagContainer.appendChild(connectorsRow);
          }
        });

        chainFlow!.appendChild(dagContainer);
      }

      // Update chain status badge in header
      if (chainStatus) {
        chainStatus.style.display = "inline-flex";
        if (errorCount > 0) {
          chainStatus.className = "chain-status-badge status-mismatch";
          chainStatus.textContent = "Type Mismatch";
        } else {
          chainStatus.className = "chain-status-badge status-ok";
          chainStatus.textContent = isDag
            ? `Valid DAG (${steps.length} steps)`
            : `Valid Chain (${steps.length} steps)`;
        }
      }
    } catch (err) {
      if (chainSummary) chainSummary.style.display = "none";
      if (costEstimate) costEstimate.style.display = "none";
      showErrorTitle("Parse Error");
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

  if (loadDagBtn) {
    loadDagBtn.addEventListener("click", () => {
      sourceInput.value = DAG_EXAMPLE;
      render();
    });
  }

  if (loadSchemaBtn) {
    loadSchemaBtn.addEventListener("click", () => {
      // Toggle between valid JSON schema and field mismatch schema
      if (lastSchemaLoaded === "mismatch") {
        sourceInput.value = SCHEMA_VALID_EXAMPLE;
        lastSchemaLoaded = "valid";
        loadSchemaBtn.title = "Loaded valid JSON schema. Click to load field mismatch.";
      } else {
        sourceInput.value = SCHEMA_MISMATCH_EXAMPLE;
        lastSchemaLoaded = "mismatch";
        loadSchemaBtn.title = "Loaded field mismatch JSON schema. Click to load valid schema.";
      }
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
