"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // parser/parser.ts
  function tokenize(source) {
    const tokens = [];
    const words = source.replace(/->/g, " -> ").replace(/:/g, " : ").replace(/,/g, " , ").replace(/=/g, " = ").replace(/\[/g, " [ ").replace(/\]/g, " ] ").split(/\s+/).filter((w) => w.length > 0);
    const types = ["text", "list", "json"];
    for (const word of words) {
      if (word === "step") tokens.push({ type: "KEYWORD", value: word });
      else if (word === "max") tokens.push({ type: "KEYWORD", value: word });
      else if (word === "->") tokens.push({ type: "ARROW", value: word });
      else if (word === ":") tokens.push({ type: "COLON", value: word });
      else if (word === ",") tokens.push({ type: "COMMA", value: word });
      else if (word === "=") tokens.push({ type: "EQUALS", value: word });
      else if (word === "[") tokens.push({ type: "LBRACKET", value: word });
      else if (word === "]") tokens.push({ type: "RBRACKET", value: word });
      else if (types.includes(word)) tokens.push({ type: "TYPE", value: word });
      else if (word === "in" || word === "out") tokens.push({ type: "PARAM", value: word });
      else if (/^-?\d+$/.test(word)) tokens.push({ type: "NUMBER", value: word });
      else tokens.push({ type: "IDENTIFIER", value: word });
    }
    return tokens;
  }
  function expect(tokens, pos, type) {
    if (!tokens[pos] || tokens[pos].type !== type) {
      const got = tokens[pos] ? `${tokens[pos].type} ("${tokens[pos].value}")` : "end of input";
      throw new ParseError(`Expected ${type} at token ${pos}, but got ${got}`);
    }
  }
  function parseTypeWithLimit(tokens, pos) {
    expect(tokens, pos, "TYPE");
    const typeName = tokens[pos].value;
    pos++;
    if (tokens[pos] && (tokens[pos].type === "LBRACKET" || tokens[pos].value === "[")) {
      if (typeName !== "text") {
        throw new ParseError(
          `Length limits are only allowed on "text" type, but got "${typeName}" at token ${pos}`
        );
      }
      pos++;
      if (!tokens[pos] || tokens[pos].value === "]") {
        throw new ParseError(`Missing "max" in length limit at token ${pos}`);
      }
      if (tokens[pos].value !== "max") {
        throw new ParseError(
          `Expected "max" in length limit at token ${pos}, but got "${tokens[pos].value}"`
        );
      }
      pos++;
      if (!tokens[pos] || tokens[pos].value === "]") {
        throw new ParseError(`Missing length limit number after "max" at token ${pos}`);
      }
      const numToken = tokens[pos];
      const rawVal = numToken.value;
      if (!/^-?\d+$/.test(rawVal)) {
        throw new ParseError(
          `Expected numeric length limit after "max", but got non-numeric "${rawVal}" at token ${pos}`
        );
      }
      const num = Number(rawVal);
      if (num === 0) {
        throw new ParseError(`Length limit must be greater than zero, but got 0 at token ${pos}`);
      }
      if (num < 0) {
        throw new ParseError(
          `Length limit must be greater than zero, but got negative number ${num} at token ${pos}`
        );
      }
      pos++;
      if (!tokens[pos] || tokens[pos].type !== "RBRACKET" && tokens[pos].value !== "]") {
        const got = tokens[pos] ? `${tokens[pos].type} ("${tokens[pos].value}")` : "end of input";
        throw new ParseError(`Missing closing "]" after length limit at token ${pos}, but got ${got}`);
      }
      pos++;
      return { type: typeName, max: num, nextPos: pos };
    }
    return { type: typeName, nextPos: pos };
  }
  function parse(tokens) {
    const steps = [];
    let pos = 0;
    while (pos < tokens.length) {
      expect(tokens, pos, "KEYWORD");
      if (tokens[pos].value !== "step") {
        throw new ParseError(`Expected "step" but got "${tokens[pos].value}" at token ${pos}`);
      }
      pos++;
      expect(tokens, pos, "IDENTIFIER");
      const name = tokens[pos].value;
      pos++;
      expect(tokens, pos, "COLON");
      pos++;
      expect(tokens, pos, "PARAM");
      if (tokens[pos].value !== "in") {
        throw new ParseError(`Expected "in" but got "${tokens[pos].value}" at token ${pos}`);
      }
      pos++;
      expect(tokens, pos, "EQUALS");
      pos++;
      const inParsed = parseTypeWithLimit(tokens, pos);
      const inType = inParsed.type;
      const inMax = inParsed.max;
      pos = inParsed.nextPos;
      expect(tokens, pos, "COMMA");
      pos++;
      expect(tokens, pos, "PARAM");
      if (tokens[pos].value !== "out") {
        throw new ParseError(`Expected "out" but got "${tokens[pos].value}" at token ${pos}`);
      }
      pos++;
      expect(tokens, pos, "EQUALS");
      pos++;
      const outParsed = parseTypeWithLimit(tokens, pos);
      const outType = outParsed.type;
      const outMax = outParsed.max;
      pos = outParsed.nextPos;
      const step = { name, inType, outType };
      if (inMax !== void 0) {
        step.inMax = inMax;
      }
      if (outMax !== void 0) {
        step.outMax = outMax;
      }
      steps.push(step);
      if (tokens[pos] && tokens[pos].type === "ARROW") {
        pos++;
        if (pos >= tokens.length) {
          throw new ParseError(`Unexpected end of input after "->" at token ${pos} \u2014 a step was expected after the arrow`);
        }
      } else if (pos < tokens.length) {
        throw new ParseError(`Expected -> or end of input at token ${pos}`);
      }
    }
    return steps;
  }
  var ParseError;
  var init_parser = __esm({
    "parser/parser.ts"() {
      "use strict";
      ParseError = class extends Error {
      };
    }
  });

  // web/check.ts
  function checkChain(steps) {
    const results = [];
    for (let i = 0; i < steps.length - 1; i++) {
      const current = steps[i];
      const next = steps[i + 1];
      if (!current || !next) continue;
      const ok = current.outType === next.inType;
      if (ok) {
        results.push({
          fromIndex: i,
          ok: true
        });
      } else {
        results.push({
          fromIndex: i,
          ok: false,
          message: `step "${current.name}" outputs ${current.outType} but step "${next.name}" expects ${next.inType}`
        });
      }
    }
    return results;
  }
  var init_check = __esm({
    "web/check.ts"() {
      "use strict";
    }
  });

  // web/app.ts
  var require_app = __commonJS({
    "web/app.ts"() {
      init_parser();
      init_check();
      function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
      }
      function initApp() {
        const sourceInput = document.getElementById("source-input");
        const checkBtn = document.getElementById("check-btn");
        const errorContainer = document.getElementById("error-container");
        const errorMessage = document.getElementById("error-message");
        const visualizationSection = document.getElementById("visualization-section");
        const chainFlow = document.getElementById("chain-flow");
        const chainStatus = document.getElementById("chain-status");
        const loadValidBtn = document.getElementById("load-valid-btn");
        const loadBrokenBtn = document.getElementById("load-broken-btn");
        const loadLimitsBtn = document.getElementById("load-limits-btn");
        if (!sourceInput || !checkBtn || !errorContainer || !errorMessage || !chainFlow) {
          console.error("Missing required DOM elements");
          return;
        }
        const VALID_EXAMPLE = "step summarize: in=text, out=text -> step translate: in=text, out=text -> step format: in=text, out=list";
        const BROKEN_EXAMPLE = "step summarize: in=text, out=text -> step format: in=text, out=list -> step email: in=text, out=text";
        const LIMITS_EXAMPLE = "step shorten: in=text, out=text[max 280] -> step translate: in=text[max 1000], out=text";
        function render() {
          const source = sourceInput.value.trim();
          if (!source) {
            errorContainer.style.display = "none";
            if (visualizationSection) visualizationSection.style.display = "block";
            chainFlow.style.display = "block";
            chainFlow.innerHTML = `
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
            errorContainer.style.display = "none";
            if (visualizationSection) visualizationSection.style.display = "block";
            chainFlow.style.display = "flex";
            chainFlow.innerHTML = "";
            if (steps.length === 0) {
              chainFlow.innerHTML = `
          <div class="empty-state">No steps found in input.</div>
        `;
              if (chainStatus) chainStatus.style.display = "none";
              return;
            }
            const checkResults = checkChain(steps);
            const hasMismatch = checkResults.some((r) => !r.ok);
            steps.forEach((step, index) => {
              const stepCard = document.createElement("div");
              stepCard.className = "step-card";
              const inLimitHtml = step.inMax !== void 0 ? `<span class="limit-badge">[max ${step.inMax}]</span>` : "";
              const outLimitHtml = step.outMax !== void 0 ? `<span class="limit-badge">[max ${step.outMax}]</span>` : "";
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
              chainFlow.appendChild(stepCard);
              if (index < steps.length - 1) {
                const check = checkResults.find((r) => r.fromIndex === index);
                const isOk = check ? check.ok : true;
                const connector = document.createElement("div");
                connector.className = `chain-connector ${isOk ? "connector-ok" : "connector-error"}`;
                const errorHtml = !isOk && check?.message ? `<div class="connector-error-message">${escapeHtml(check.message)}</div>` : "";
                connector.innerHTML = `
            <div class="arrow-line-container">
              <svg class="arrow-svg" width="70" height="20" viewBox="0 0 70 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 10 H56" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <path d="M52 4 L64 10 L52 16 Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
              </svg>
            </div>
            ${errorHtml}
          `;
                chainFlow.appendChild(connector);
              }
            });
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
            if (err instanceof ParseError) {
              errorContainer.style.display = "block";
              errorMessage.textContent = err.message;
              if (visualizationSection) visualizationSection.style.display = "none";
              chainFlow.innerHTML = "";
            } else {
              errorContainer.style.display = "block";
              errorMessage.textContent = err.message || String(err);
              if (visualizationSection) visualizationSection.style.display = "none";
              chainFlow.innerHTML = "";
            }
          }
        }
        checkBtn.addEventListener("click", render);
        sourceInput.addEventListener("keydown", (e) => {
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
        sourceInput.value = VALID_EXAMPLE;
        render();
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initApp);
      } else {
        initApp();
      }
    }
  });
  require_app();
})();
