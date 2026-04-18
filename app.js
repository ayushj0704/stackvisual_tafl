import { getDefaultCustomDpdaText, getProblemDefinition } from "./definitions.js";
import { runCustomDpda, runProblem } from "./engine.js";

import { recogniseLanguage, LANGUAGE_LIBRARY } from "./languagebuilder.js";

const els = {
  problemSelect: document.getElementById("problemSelect"),
  inputString: document.getElementById("inputString"),
  loadBtn: document.getElementById("loadBtn"),
  backBtn: document.getElementById("backBtn"),
  playBtn: document.getElementById("playBtn"),
  nextBtn: document.getElementById("nextBtn"),
  resetBtn: document.getElementById("resetBtn"),
  speedRange: document.getElementById("speedRange"),
  tape: document.getElementById("tape"),
  stack: document.getElementById("stack"),
  logBody: document.getElementById("logBody"),
  stepMeta: document.getElementById("stepMeta"),
  ruleMeta: document.getElementById("ruleMeta"),
  statusPill: document.getElementById("statusPill"),
  problemBlurb: document.getElementById("problemBlurb"),
  editPdaBtn: document.getElementById("editPdaBtn"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  loadFromModalBtn: document.getElementById("loadFromModalBtn"),
  pdaJson: document.getElementById("pdaJson"),
  resetCustomBtn: document.getElementById("resetCustomBtn"),
  customName: document.getElementById("customName"),
  customStates: document.getElementById("customStates"),
  customStart: document.getElementById("customStart"),
  customAccept: document.getElementById("customAccept"),
  customReject: document.getElementById("customReject"),
  customStackInitial: document.getElementById("customStackInitial"),
  // New textarea-based transition input (replaces table builder)
  customTransitionsText: document.getElementById("customTransitionsText"),
  customError: document.getElementById("customError"),
  theoryBtn: document.getElementById("theoryNavBtn"),
  theoryBackdrop: document.getElementById("theoryBackdrop"),
  closeTheoryBtn: document.getElementById("closeTheoryBtn"),
  timelineRange: document.getElementById("timelineRange"),
  timelineLabel: document.getElementById("timelineLabel"),
  bookmarkBtn: document.getElementById("bookmarkBtn"),
  depthSpark: document.getElementById("depthSpark"),
  metrics: document.getElementById("metrics"),
  shareBtn: document.getElementById("shareBtn"),
  exportBtn: document.getElementById("exportBtn"),
  toast: document.getElementById("toast"),
  examplesList: document.getElementById("examplesList"),
};

let cy = null;
let currentInput = "";
let steps = [];
let currentStep = 0;
let playing = false;
let timer = null;
let lastRenderedStep = null;
let customPdaText = "";
let customPdaDef = null;
const CUSTOM_STORAGE_KEY = "pda.custom.json.v1";
let bookmarks = new Set();
let lastToastTimer = null;

function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = String(message ?? "");
  els.toast.classList.remove("hidden");
  if (lastToastTimer) clearTimeout(lastToastTimer);
  lastToastTimer = setTimeout(() => els.toast.classList.add("hidden"), 1800);
}

function normalizeForProblem(problemId, raw) {
  if (problemId === "custom") return String(raw ?? "").replace(/\s+/g, "");
  const lower = String(raw ?? "").toLowerCase();
  if (problemId === "paren") return lower.replace(/\s+/g, "");
  if (problemId === "anbn") return lower.replace(/\s+/g, "");
  return lower.trim();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatRead(read) {
  if (read === null || read === undefined) return "ε";
  if (read === "") return "ε";
  return read;
}

function formatAction(action) {
  if (!action || action.type === "noop") return "—";
  if (action.type === "push") return `push ${action.symbol}`;
  if (action.type === "pop") return `pop ${action.symbol}`;
  if (action.type === "pop_push") return `pop ${action.pop}, push ${action.push.join(',')}`;
  if (action.type === "pushMany") return `push ${action.symbols.join(',')}`;
  return action.type;
}
function setStatus(step) {
  const status = step?.status ?? "running";
  els.statusPill.classList.remove("pill-running", "pill-accept", "pill-reject");
  if (status === "accept") {
    els.statusPill.classList.add("pill-accept");
    els.statusPill.textContent = "ACCEPT";
    return;
  }
  if (status === "reject") {
    els.statusPill.classList.add("pill-reject");
    els.statusPill.textContent = "REJECT";
    return;
  }
  els.statusPill.classList.add("pill-running");
  els.statusPill.textContent = playing ? "Running" : "Ready";
}

function buildTape(input, headIndex, justReadIndex) {
  const frag = document.createDocumentFragment();

  for (let i = 0; i < input.length; i += 1) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.textContent = input[i];
    if (i < headIndex) cell.classList.add("consumed");
    if (justReadIndex === i) cell.classList.add("just-read");
    frag.appendChild(cell);
  }

  if (headIndex < input.length) {
    const head = document.createElement("div");
    head.className = "head";
    frag.insertBefore(head, frag.childNodes[headIndex] ?? null);
  } else {
    const caret = document.createElement("div");
    caret.className = "caret";
    caret.innerHTML = "<span>EOF</span><span>▮</span>";
    frag.appendChild(caret);
  }

  els.tape.replaceChildren(frag);
}

function fullRenderStack(stackSnapshot) {
  const frag = document.createDocumentFragment();
  const reversed = stackSnapshot.slice().reverse();
  for (let i = 0; i < reversed.length; i += 1) {
    const symbol = reversed[i];
    const item = document.createElement("div");
    item.className = "stack-item";
    if (stackSnapshot.length > 0 && symbol === stackSnapshot[0]) item.classList.add("bottom");
    item.innerHTML = `<span>${escapeHtml(symbol)}</span><span class="tag">${i === 0 ? "TOP" : ""}</span>`;
    frag.appendChild(item);
  }
  els.stack.replaceChildren(frag);
}

function animateStackTransition(prevStep, nextStep) {
  const prev = prevStep?.stack ?? [];
  const next = nextStep?.stack ?? [];
  const action = nextStep?.action ?? { type: "noop" };

  const adjacent = prevStep && nextStep && nextStep.stepIndex === prevStep.stepIndex + 1;
  if (!adjacent) {
    fullRenderStack(next);
    return;
  }

  const delta = next.length - prev.length;
  const inferred = () => {
    if (delta === 1) return { type: "push", symbol: next[next.length - 1] };
    if (delta === -1) return { type: "pop", symbol: prev[prev.length - 1] };
    return { type: "noop" };
  };
  const effective = action.type === "push" || action.type === "pop" ? action : inferred();

  if (effective.type === "push" && delta === 1) {
    const symbol = effective.symbol;
    const item = document.createElement("div");
    item.className = "stack-item entering";
    item.innerHTML = `<span>${escapeHtml(symbol)}</span><span class="tag">TOP</span>`;

    const previousTop = els.stack.firstElementChild;
    if (previousTop) {
      const prevTag = previousTop.querySelector(".tag");
      if (prevTag) prevTag.textContent = "";
    }

    els.stack.insertBefore(item, previousTop);
    requestAnimationFrame(() => item.classList.remove("entering"));
    return;
  }

  if (effective.type === "pop" && delta === -1) {
    const topNode = els.stack.firstElementChild;
    if (!topNode) {
      fullRenderStack(next);
      return;
    }
    topNode.classList.add("exiting");
    const remove = () => {
      topNode.removeEventListener("transitionend", remove);
      topNode.remove();
      const newTop = els.stack.firstElementChild;
      if (newTop) {
        const tag = newTop.querySelector(".tag");
        if (tag) tag.textContent = "TOP";
      }
    };
    topNode.addEventListener("transitionend", remove);
    setTimeout(remove, 240);
    return;
  }

  fullRenderStack(next);
}

function updateLogActiveRow() {
  const rows = Array.from(els.logBody.querySelectorAll("tr"));
  for (const tr of rows) tr.classList.toggle("active", Number(tr.dataset.step) === currentStep);
}

function isBookmarked(stepIndex) {
  return bookmarks.has(Number(stepIndex));
}

function toggleBookmark(stepIndex) {
  const idx = Number(stepIndex);
  if (bookmarks.has(idx)) bookmarks.delete(idx);
  else bookmarks.add(idx);
  syncBookmarkUi();
  renderLog();
}

function syncBookmarkUi() {
  const active = isBookmarked(currentStep);
  els.bookmarkBtn.textContent = active ? "★" : "☆";
  els.bookmarkBtn.title = active ? "Remove bookmark" : "Bookmark this step";
}

function renderLog() {
  const frag = document.createDocumentFragment();
  for (const s of steps) {
    const tr = document.createElement("tr");
    tr.dataset.step = String(s.stepIndex);
    if (s.status === "accept") tr.classList.add("final-accept");
    if (s.status === "reject") tr.classList.add("final-reject");

    const star = isBookmarked(s.stepIndex) ? "★" : "☆";
    tr.innerHTML = `
      <td><button class="star" type="button" title="Bookmark">${star}</button></td>
      <td>${s.stepIndex}</td>
      <td><code>${escapeHtml(s.state)}</code></td>
      <td><code>${escapeHtml(formatRead(s.read))}</code></td>
      <td><code>${escapeHtml(formatAction(s.action))}</code></td>
      <td><code>${escapeHtml((s.stack?.[s.stack.length - 1] ?? "∅"))}</code></td>
      <td>${escapeHtml(s.note ?? "")}</td>
    `;
    tr.addEventListener("click", () => gotoStep(s.stepIndex));
    const starBtn = tr.querySelector("button.star");
    if (starBtn) {
      starBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleBookmark(s.stepIndex);
      });
    }
    frag.appendChild(tr);
  }
  els.logBody.replaceChildren(frag);
  updateLogActiveRow();
}

function applyDiagramHighlight(step) {
  if (!cy) return;
  cy.nodes().removeClass("active-current active-node active-source active-target");
  cy.edges().removeClass("active-edge");

  cy.$id(step.state).addClass("active-current active-node");

  if (step.edgeId) {
    const edge = cy.$id(step.edgeId);
    edge.addClass("active-edge");
    edge.source().addClass("active-source active-node");
    edge.target().addClass("active-target active-node");
  }
}

function renderStepMeta(step) {
  const readAt = step.headIndex === null ? "—" : String(step.headIndex);
  els.stepMeta.textContent = `Step ${step.stepIndex}/${Math.max(steps.length - 1, 0)}  |  State=${step.state}  |  Head→${step.inputIndex}  |  Read@${readAt}=${formatRead(
    step.read,
  )}`;
  els.ruleMeta.textContent = `Action: ${formatAction(step.action)}  |  Stack size: ${step.stack.length}`;
}

function renderStep(stepIndex) {
  const step = steps[stepIndex];
  if (!step) return;

  buildTape(currentInput, step.inputIndex, step.read === null ? null : step.headIndex);
  animateStackTransition(lastRenderedStep, step);
  applyDiagramHighlight(step);

  currentStep = stepIndex;
  updateLogActiveRow();
  renderStepMeta(step);
  setStatus(step);
  renderTimelineUi();
  renderInsights();
  syncBookmarkUi();

  lastRenderedStep = step;
}

function gotoStep(stepIndex) {
  if (!steps.length) return;
  const bounded = Math.max(0, Math.min(stepIndex, steps.length - 1));
  if (bounded === currentStep) return;
  renderStep(bounded);
}

function stepForward() {
  gotoStep(currentStep + 1);
  if (currentStep >= steps.length - 1) stop();
}

function stepBack() {
  gotoStep(currentStep - 1);
}

function speedMs() {
  const speed = Number(els.speedRange.value || "1");
  return Math.round(650 / Math.max(0.1, speed));
}

function play() {
  if (playing) return;
  playing = true;
  els.playBtn.textContent = "Pause";
  setStatus(steps[currentStep]);
  timer = setInterval(stepForward, speedMs());
}

function stop() {
  playing = false;
  els.playBtn.textContent = "Play";
  if (timer) clearInterval(timer);
  timer = null;
  setStatus(steps[currentStep]);
}

function togglePlay() {
  if (!steps.length) return;
  if (playing) stop();
  else play();
}

function initCytoscape(problem) {
  if (!window.cytoscape) {
    throw new Error("Cytoscape.js not loaded. Check your internet connection.");
  }

  if (cy) cy.destroy();

  const hasPresetPositions =
    Array.isArray(problem.diagram?.nodes) &&
    problem.diagram.nodes.length > 0 &&
    problem.diagram.nodes.every((n) => n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y));

  const rootId = problem.rootId ?? null;
  const rootsSelector =
    rootId && typeof CSS !== "undefined" && typeof CSS.escape === "function" ? `#${CSS.escape(rootId)}` : rootId ? `#${rootId}` : undefined;

  cy = window.cytoscape({
    container: document.getElementById("cy"),
    elements: [...problem.diagram.nodes, ...problem.diagram.edges],
    layout: hasPresetPositions
      ? { name: "preset" }
      : {
        name: "breadthfirst",
        directed: true,
        roots: rootsSelector,
        spacingFactor: 1.6,
        animate: true,
        animationDuration: 260,
      },
    style: [
      {
        selector: "node",
        style: {
          "background-color": "rgba(255, 255, 255, 0.7)",
          "border-width": 2,
          "border-color": "rgba(51, 65, 85, 0.3)",
          label: "data(label)",
          color: "#334155",
          "font-family": "'DM Mono', ui-monospace, Menlo, monospace",
          "font-size": 13,
          "font-weight": 500,
          "text-wrap": "wrap",
          "text-valign": "center",
          "text-halign": "center",
          "text-outline-width": 0,
          width: 110,
          height: 70,
          "text-max-width": 100,
          "transition-property": "background-color, border-color, border-width",
          "transition-duration": "180ms",
          shape: "round-rectangle",
          padding: 8,
        },
      },
      {
        selector: "node#qa, node.accept",
        style: {
          "border-color": "#a4ce72",
          "border-width": 2.5,
          "background-color": "rgba(164, 206, 114, 0.5)",
          color: "#3f621d",
        },
      },
      {
        selector: "node#qr, node.reject",
        style: {
          "border-color": "#f43f5e",
          "border-width": 2.5,
          "background-color": "rgba(244, 63, 94, 0.3)",
          color: "#9f1239",
        },
      },
      {
        selector: "node.start",
        style: {
          "border-color": "#0ea5e9",
          "border-width": 2.5,
          "background-color": "rgba(14, 165, 233, 0.3)",
          color: "#0369a1",
        },
      },
      {
        selector: ".active-source",
        style: {
          "border-color": "#a1c4fd",
          "border-width": 3,
          "background-color": "rgba(161, 196, 253, 0.5)",
          color: "#1e3a8a",
        },
      },
      {
        selector: ".active-target",
        style: {
          "border-color": "#c2e9fb",
          "border-width": 3,
          "background-color": "rgba(194, 233, 251, 0.5)",
          color: "#0c4a6e",
        },
      },
      {
        selector: "node.active-current",
        style: {
          "background-color": "rgba(161, 196, 253, 0.8)",
          "border-color": "#8ec5fc",
          "border-width": 3.5,
          color: "#1e293b",
          "box-shadow": "0 0 0 4px rgba(161, 196, 253, 0.3)",
        },
      },
      {
        selector: "edge",
        style: {
          width: 2,
          "line-color": "rgba(51, 65, 85, 0.3)",
          "target-arrow-color": "rgba(51, 65, 85, 0.3)",
          "target-arrow-shape": "triangle",
          "arrow-scale": 1.4,
          "curve-style": "bezier",
          label: "data(label)",
          color: "#475569",
          "font-family": "'DM Mono', ui-monospace, Menlo, monospace",
          "font-size": 11,
          "font-weight": 500,
          "text-background-opacity": 1,
          "text-background-color": "rgba(255, 255, 255, 0.8)",
          "text-background-padding": "5px",
          "text-background-shape": "roundrectangle",
          "text-border-width": 1,
          "text-border-color": "rgba(51, 65, 85, 0.2)",
          "text-border-opacity": 1,
          "text-margin-y": -6,
          "transition-property": "line-color, target-arrow-color, width",
          "transition-duration": "180ms",
        },
      },
      {
        selector: "edge.loop, edge[source = target]",
        style: {
          "loop-direction": "50deg",
          "loop-sweep": "80deg",
          "text-margin-y": -14,
          "text-margin-x": 0,
        },
      },
      {
        selector: "edge.fallback",
        style: {
          "line-style": "dashed",
          "line-dash-pattern": [6, 4],
          "line-color": "rgba(51, 65, 85, 0.2)",
          "target-arrow-color": "rgba(51, 65, 85, 0.2)",
          color: "rgba(51, 65, 85, 0.4)",
          width: 1.5,
        },
      },
      {
        selector: "edge.active-edge",
        style: {
          width: 3.5,
          "line-color": "#0ea5e9",
          "target-arrow-color": "#0ea5e9",
          "arrow-scale": 1.8,
          color: "#0369a1",
          "text-background-color": "#e0f2fe",
          "text-border-color": "#7dd3fc",
          "z-index": 10,
        },
      },
    ],
    userZoomingEnabled: true,
    wheelSensitivity: 0.12,
  });

  cy.fit(undefined, 48);
}

function getCustomTemplateText() {
  return getDefaultCustomDpdaText();
}

function parseCsv(str) {
  return String(str ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toCsv(list) {
  return Array.isArray(list) ? list.join(", ") : "";
}

function normalizeEpsilonToken(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  const lower = v.toLowerCase();
  if (v === "ε" || lower === "eps" || lower === "epsilon") return "ε";
  return v;
}

function parseMaybeArray(value) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const parts = v
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? null;
  return parts;
}

function showCustomError(message) {
  els.customError.textContent = String(message ?? "");
  els.customError.classList.remove("hidden");
}

function clearCustomError() {
  els.customError.textContent = "";
  els.customError.classList.add("hidden");
}

function ensureCustomPdaLoaded() {
  if (customPdaText && customPdaDef) return;
  const saved = localStorage.getItem(CUSTOM_STORAGE_KEY);
  customPdaText = saved && saved.trim() ? saved : getCustomTemplateText();
  try {
    customPdaDef = JSON.parse(customPdaText);
  } catch {
    customPdaText = getCustomTemplateText();
    customPdaDef = JSON.parse(customPdaText);
  }

  customPdaDef = normalizeCustomDef(customPdaDef);
  customPdaText = JSON.stringify(customPdaDef, null, 2);
}

function uniqueTransitionId(existing, base) {
  let id = base;
  let n = 1;
  while (existing.has(id)) {
    n += 1;
    id = `${base}_${n}`;
  }
  existing.add(id);
  return id;
}

function normalizeCustomDef(def) {
  const d = def && typeof def === "object" ? def : {};
  if (!Array.isArray(d.transitions)) d.transitions = [];
  if (!Array.isArray(d.states)) d.states = [];
  if (!Array.isArray(d.accept)) d.accept = ["qa"];
  if (!Array.isArray(d.reject)) d.reject = ["qr"];
  if (!d.stack || typeof d.stack !== "object") d.stack = { initial: [] };
  if (!Array.isArray(d.stack.initial)) d.stack.initial = [];
  if (!d.limits || typeof d.limits !== "object") d.limits = { maxSteps: 5000 };
  if (!Number.isFinite(Number(d.limits.maxSteps))) d.limits.maxSteps = 5000;
  if (!d.start) d.start = "q0";
  if (!d.name) d.name = "Custom DPDA";

  const used = new Set();
  for (let i = 0; i < d.transitions.length; i += 1) {
    const t = d.transitions[i];
    if (!t || typeof t !== "object") continue;
    const base = String(t.id ?? "").trim() || `t_${i}`;
    t.id = uniqueTransitionId(used, base);
    if (t.read === null || t.read === undefined || t.read === "") t.read = "ε";
    if (t.read !== "EOF" && t.read !== "*" && t.read !== "ε") t.read = String(t.read);
    if (t.pop === "" || t.pop === "ε") t.pop = null;
    if (t.push === "" || t.push === "ε") t.push = null;
  }
  return d;
}

function renderCustomBuilder(def) {
  clearCustomError();
  const safe = def ?? {};
  els.customName.value = String(safe.name ?? "Custom DPDA");
  els.customStates.value = toCsv(safe.states ?? []);
  els.customStart.value = String(safe.start ?? "q0");
  els.customAccept.value = toCsv(safe.accept ?? ["qa"]);
  els.customReject.value = toCsv(safe.reject ?? ["qr"]);
  els.customStackInitial.value = toCsv(safe.stack?.initial ?? []);

  // Render transitions as readable text lines in the textarea
  if (els.customTransitionsText) {
    const transitions = Array.isArray(safe.transitions) ? safe.transitions : [];
    els.customTransitionsText.value = transitions.map(t => {
      const read = t.read ?? "ε";
      const pop = t.pop ?? "ε";
      const push = Array.isArray(t.push)
        ? t.push.join(",")
        : (t.push ?? "ε");
      return `${t.from}, ${read}, ${pop} -> ${t.to}, ${push}`;
    }).join("\n");
  }

  if (els.pdaJson) els.pdaJson.value = JSON.stringify(safe, null, 2);
}

function openModal() {
  ensureCustomPdaLoaded();
  renderCustomBuilder(customPdaDef);
  els.modalBackdrop.classList.remove("hidden");
}

function closeModal() {
  els.modalBackdrop.classList.add("hidden");
}

function openTheory() {
  els.theoryBackdrop.classList.remove("hidden");
}

function closeTheory() {
  els.theoryBackdrop.classList.add("hidden");
}

/**
 * Parse textarea lines of the form:
 *   from, read, pop -> to, push
 *   q0, a, ε -> q0, A
 */
function parseTransitionLine(line, index) {
  const clean = line.replace(/#.*$/, "").trim();
  if (!clean) return null;

  const parts = clean.split("->").map(s => s.trim());
  if (parts.length !== 2) throw new Error(`Line ${index + 1}: expected "from, read, pop -> to, push"`);

  const left = parts[0].split(",").map(s => s.trim());
  const right = parts[1].split(",").map(s => s.trim());

  if (left.length < 3) throw new Error(`Line ${index + 1}: left side needs 3 parts: from, read, pop`);
  if (right.length < 2) throw new Error(`Line ${index + 1}: right side needs 2 parts: to, push`);

  const from = left[0];
  const to = right[0];
  if (!from || !to) throw new Error(`Line ${index + 1}: from/to state cannot be empty`);

  const readRaw = normalizeEpsilonToken(left[1]);
  const popRaw = normalizeEpsilonToken(left[2]);
  const pushParts = right.slice(1).map(s => normalizeEpsilonToken(s)).filter(Boolean);
  const pushRaw = pushParts.join(",");

  const read = !readRaw || readRaw === "ε" ? "ε"
    : readRaw.toUpperCase() === "EOF" ? "EOF"
      : readRaw;

  const pop = !popRaw || popRaw === "ε" ? null : popRaw;
  const push = !pushRaw || pushRaw === "ε" ? null : parseMaybeArray(pushRaw);

  return { id: `t_${index}`, from, to, read, pop, push, label: `${from} → ${to}: ${read}` };
}

function buildCustomDefFromBuilder() {
  const name = String(els.customName?.value ?? "").trim() || "Custom DPDA";
  const states = parseCsv(els.customStates?.value);
  const start = String(els.customStart?.value ?? "").trim() || "q0";
  const accept = parseCsv(els.customAccept?.value);
  const reject = parseCsv(els.customReject?.value);
  const stackInitial = parseCsv(els.customStackInitial?.value);

  const transitions = [];
  const usedIds = new Set();

  if (els.customTransitionsText) {
    const lines = els.customTransitionsText.value.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const parsed = parseTransitionLine(lines[i], i);
      if (!parsed) continue;
      parsed.id = uniqueTransitionId(usedIds, parsed.id);
      transitions.push(parsed);
    }
  }

  const allStates = states.length
    ? states
    : Array.from(new Set([start, ...transitions.flatMap(t => [t.from, t.to]), ...accept, ...reject]));

  return {
    name,
    states: allStates,
    start,
    accept: accept.length ? accept : ["qa"],
    reject: reject.length ? reject : ["qr"],
    stack: { initial: stackInitial },
    transitions,
    limits: { maxSteps: 5000 },
  };
}

function diagramFromCustom(def) {
  const states =
    Array.isArray(def?.states) && def.states.length
      ? def.states.map(String)
      : Array.from(
        new Set(
          (Array.isArray(def?.transitions) ? def.transitions : [])
            .flatMap((t) => [t.from, t.to])
            .filter((x) => x !== undefined && x !== null)
            .map(String),
        ),
      );

  const acceptSet = new Set((Array.isArray(def?.accept) ? def.accept : []).map(String));
  const rejectSet = new Set((Array.isArray(def?.reject) ? def.reject : []).map(String));

  const start = String(def?.start ?? "q0");
  const nodes = states.map((id) => ({
    data: { id, label: id },
    classes: `${id === start ? "start" : ""} ${acceptSet.has(id) ? "accept" : ""} ${rejectSet.has(id) ? "reject" : ""}`.trim(),
  }));

  const edges = (Array.isArray(def?.transitions) ? def.transitions : []).map((t, i) => ({
    data: {
      id: t.id ? String(t.id) : `t_${i}`,
      source: String(t.from),
      target: String(t.to),
      label: String(t.label ?? `${t.from}→${t.to}`),
    },
  }));

  return { nodes, edges };
}

function load() {
  stop();
  const problem = getProblemDefinition(els.problemSelect.value);
  const normalized = normalizeForProblem(problem.id, els.inputString.value ?? "");
  els.inputString.value = normalized;
  currentInput = normalized;

  els.problemBlurb.textContent = problem.description;
  renderExamples(problem);

  if (problem.id === "custom") {
    try {
      ensureCustomPdaLoaded();
      const def = customPdaDef;
      const diagram = diagramFromCustom(def);
      initCytoscape({ diagram, rootId: String(def?.start ?? "q0") });
      const result = runCustomDpda(def, currentInput);
      steps = result.steps;
    } catch (e) {
      initCytoscape({ diagram: { nodes: [], edges: [] } });
      steps = [
        {
          stepIndex: 0,
          state: "qr",
          inputIndex: 0,
          headIndex: null,
          read: null,
          action: { type: "noop" },
          stack: [],
          note: `Invalid JSON: ${e?.message ?? e}`,
          edgeId: null,
          status: "reject",
        },
      ];
    }
  } else {
    initCytoscape(problem);
    const result = runProblem(problem.id, currentInput);
    steps = result.steps;
  }

  bookmarks = new Set();
  currentStep = 0;
  lastRenderedStep = null;

  renderLog();
  if (steps.length) renderStep(0);
  else {
    els.stepMeta.textContent = "No steps produced.";
    els.ruleMeta.textContent = "";
    els.tape.replaceChildren();
    els.stack.replaceChildren();
    setStatus(null);
    renderTimelineUi();
    renderInsights();
    syncBookmarkUi();
  }
}

function renderTimelineUi() {
  if (!els.timelineRange) return;
  els.timelineRange.max = String(Math.max(0, steps.length - 1));
  els.timelineRange.value = String(currentStep);
  els.timelineLabel.textContent = `Step ${currentStep}/${Math.max(steps.length - 1, 0)}`;
}

function computeDepthSeries() {
  const depths = steps.map((s) => Number(s.stack?.length ?? 0));
  const maxDepth = Math.max(0, ...depths);
  return { depths, maxDepth };
}

function renderDepthSpark() {
  if (!els.depthSpark) return;
  const svg = els.depthSpark;
  const { depths, maxDepth } = computeDepthSeries();
  const w = 220;
  const h = 56;
  const pad = 6;

  svg.replaceChildren();

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", String(w));
  bg.setAttribute("height", String(h));
  bg.setAttribute("rx", "12");
  svg.appendChild(bg);

  if (!depths.length) return;

  const scaleY = (d) => {
    if (maxDepth === 0) return h - pad;
    const t = d / maxDepth;
    return pad + (1 - t) * (h - pad * 2);
  };
  const scaleX = (i) => {
    if (depths.length === 1) return w / 2;
    return pad + (i / (depths.length - 1)) * (w - pad * 2);
  };

  const d0 = `M ${scaleX(0).toFixed(2)} ${scaleY(depths[0]).toFixed(2)}`;
  let pathD = d0;
  for (let i = 1; i < depths.length; i += 1) {
    pathD += ` L ${scaleX(i).toFixed(2)} ${scaleY(depths[i]).toFixed(2)}`;
  }

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-width", "2.8");
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);

  const x = scaleX(currentStep);
  const y = scaleY(depths[currentStep] ?? 0);
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("cx", String(x));
  dot.setAttribute("cy", String(y));
  dot.setAttribute("r", "4.5");
  svg.appendChild(dot);

  svg.onclick = (evt) => {
    const rect = svg.getBoundingClientRect();
    const px = (evt.clientX - rect.left) / rect.width;
    const i = Math.round(px * Math.max(0, depths.length - 1));
    gotoStep(i);
  };
}

function renderMetrics() {
  if (!els.metrics) return;
  const step = steps[currentStep];
  if (!step) {
    els.metrics.textContent = "";
    return;
  }
  const { depths, maxDepth } = computeDepthSeries();
  const depth = depths[currentStep] ?? 0;
  const head = step.inputIndex ?? 0;
  const len = currentInput.length;

  let pushes = 0;
  let pops = 0;
  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1]?.stack?.length ?? 0;
    const next = steps[i]?.stack?.length ?? 0;
    if (next === prev + 1) pushes += 1;
    else if (next === prev - 1) pops += 1;
  }

  const lines = [
    { k: "Head", v: `${head}/${len}` },
    { k: "Depth", v: `${depth} (max ${maxDepth})` },
    { k: "Pushes", v: String(pushes) },
    { k: "Pops", v: String(pops) },
    { k: "Bookmarks", v: String(bookmarks.size) },
  ];
  els.metrics.innerHTML = lines
    .map((x) => `<div class="metric"><span class="k">${escapeHtml(x.k)}</span><span class="v">${escapeHtml(x.v)}</span></div>`)
    .join("");
}

function renderInsights() {
  renderDepthSpark();
  renderMetrics();
}

function encodeBase64Url(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(str) {
  const padded = str.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((str.length + 3) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

function buildShareHash() {
  const problemId = els.problemSelect.value;
  const input = els.inputString.value ?? "";
  const speed = els.speedRange.value ?? "1.0";
  const step = String(currentStep);

  const params = new URLSearchParams();
  params.set("p", problemId);
  params.set("i", input);
  params.set("s", String(speed));
  params.set("t", step);
  if (problemId === "custom") {
    ensureCustomPdaLoaded();
    params.set("c", encodeBase64Url(JSON.stringify(customPdaDef)));
  }
  return `#${params.toString()}`;
}

function applyShareHash() {
  const raw = String(location.hash ?? "");
  if (!raw.startsWith("#") || raw.length < 2) return false;
  const params = new URLSearchParams(raw.slice(1));
  const p = params.get("p");
  const i = params.get("i");
  const s = params.get("s");
  const t = params.get("t");
  const c = params.get("c");

  if (p && ["anbn", "paren", "custom"].includes(p)) els.problemSelect.value = p;
  if (typeof i === "string") els.inputString.value = i;
  if (s) els.speedRange.value = s;
  if (c) {
    try {
      const json = decodeBase64Url(c);
      customPdaDef = JSON.parse(json);
      customPdaText = JSON.stringify(customPdaDef, null, 2);
      localStorage.setItem(CUSTOM_STORAGE_KEY, customPdaText);
    } catch {
      // ignore
    }
  }

  load();
  if (t) {
    const ti = Number(t);
    if (Number.isFinite(ti)) gotoStep(ti);
  }
  return true;
}

function exportSteps() {
  const payload = {
    problemId: els.problemSelect.value,
    input: currentInput,
    accepted: steps.some((s) => s.status === "accept"),
    steps,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pda-steps-${payload.problemId}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  showToast("Downloaded step log");
}

function setExampleForProblem(problemId) {
  const def = getProblemDefinition(problemId);
  els.inputString.placeholder = `e.g. ${def.example}`;
  const cur = String(els.inputString.value ?? "");
  if (problemId === "custom") {
    if (!cur.trim()) els.inputString.value = def.example;
    return;
  }
  const disallowed = problemId === "paren" ? /[^()\s]/ : /[^ab\s]/;
  if (!cur.trim() || disallowed.test(cur)) els.inputString.value = def.example;
}

function renderExamples(problem) {
  if (!els.examplesList) return;
  const list = els.examplesList;
  list.innerHTML = "";

  const examples = Array.isArray(problem?.examples) ? problem.examples : [];
  if (!examples.length) {
    const empty = document.createElement("div");
    empty.className = "examples-empty";
    empty.textContent = "No examples available.";
    list.appendChild(empty);
    return;
  }

  const toDisplay = (input) => {
    const raw = String(input ?? "");
    return raw.length ? raw : "ε";
  };

  for (const ex of examples) {
    const input = String(ex?.input ?? "");
    const expected = String(ex?.expected ?? "");
    const label = String(ex?.label ?? toDisplay(input));

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `example-chip ${expected === "accept" ? "example-accept" : ""} ${expected === "reject" ? "example-reject" : ""}`.trim();
    btn.textContent = `${expected === "accept" ? "✓ " : expected === "reject" ? "✕ " : ""}${label}`;
    btn.title = `Load: ${toDisplay(input)}`;
    btn.addEventListener("click", () => {
      els.inputString.value = input;
      load();
      if (expected === "accept" || expected === "reject") showToast(`Expected: ${expected.toUpperCase()}`);
      else showToast("Loaded example");
    });
    list.appendChild(btn);
  }
}

function wireEvents() {
  els.loadBtn.addEventListener("click", load);
  els.backBtn.addEventListener("click", stepBack);
  els.nextBtn.addEventListener("click", stepForward);
  els.resetBtn.addEventListener("click", () => gotoStep(0));
  els.playBtn.addEventListener("click", togglePlay);

  els.problemSelect.addEventListener("change", () => {
    const def = getProblemDefinition(els.problemSelect.value);
    els.inputString.value = def.example;
    setExampleForProblem(els.problemSelect.value);
    const isCustom = els.problemSelect.value === "custom";
    els.editPdaBtn.hidden = !isCustom;
    load();
  });

  els.speedRange.addEventListener("input", () => {
    if (!playing) return;
    clearInterval(timer);
    timer = setInterval(stepForward, speedMs());
  });

  els.timelineRange.addEventListener("input", () => {
    stop();
    gotoStep(Number(els.timelineRange.value));
  });
  els.bookmarkBtn.addEventListener("click", () => toggleBookmark(currentStep));
  els.shareBtn.addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}${buildShareHash()}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else window.prompt("Copy this link:", url);
      showToast("Share link copied");
    } catch {
      window.prompt("Copy this link:", url);
    }
  });
  els.exportBtn.addEventListener("click", () => exportSteps());

  els.inputString.addEventListener("keydown", (e) => {
    if (e.key === "Enter") load();
  });

  window.addEventListener("keydown", (e) => {
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
    if (e.key === " ") {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (e.key === "ArrowRight") stepForward();
    if (e.key === "ArrowLeft") stepBack();
    if (e.key === "Home") gotoStep(0);
    if (e.key === "End") gotoStep(steps.length - 1);
  });

  els.editPdaBtn.addEventListener("click", () => openModal());
  els.closeModalBtn.addEventListener("click", () => closeModal());
  els.modalBackdrop.addEventListener("click", (e) => {
    if (e.target === els.modalBackdrop) closeModal();
  });
  els.loadFromModalBtn.addEventListener("click", () => {
    clearCustomError();
    const advancedDetails = els.modalBackdrop.querySelector("details.advanced");
    const useJson = Boolean(advancedDetails && advancedDetails.open);

    try {
      let nextDef = null;
      if (useJson) {
        const raw = String(els.pdaJson?.value ?? "").trim();
        nextDef = normalizeCustomDef(JSON.parse(raw));
      } else {
        nextDef = normalizeCustomDef(buildCustomDefFromBuilder());
      }

      customPdaDef = nextDef;
      customPdaText = JSON.stringify(nextDef, null, 2);
      localStorage.setItem(CUSTOM_STORAGE_KEY, customPdaText);

      renderCustomBuilder(customPdaDef);
      closeModal();
      load();
      showToast(`Loaded: ${customPdaDef.name || "Custom DPDA"}`);
    } catch (err) {
      showCustomError(`Could not save: ${err?.message ?? err}`);
    }
  });

  els.resetCustomBtn.addEventListener("click", () => {
    try {
      customPdaText = getCustomTemplateText();
      customPdaDef = JSON.parse(customPdaText);
      localStorage.setItem(CUSTOM_STORAGE_KEY, customPdaText);
      renderCustomBuilder(customPdaDef);
    } catch (e) {
      showCustomError(`Reset failed: ${e?.message ?? e}`);
    }
  });

  els.theoryBtn.addEventListener("click", () => openTheory());
  els.closeTheoryBtn.addEventListener("click", () => closeTheory());
  els.theoryBackdrop.addEventListener("click", (e) => {
    if (e.target === els.theoryBackdrop) closeTheory();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!els.modalBackdrop.classList.contains("hidden")) closeModal();
    if (!els.theoryBackdrop.classList.contains("hidden")) closeTheory();
    const strGenBd = document.getElementById("strGenBackdrop");
    if (strGenBd && !strGenBd.classList.contains("hidden")) closeStrGen();
    const compareBd = document.getElementById("compareBackdrop");
    if (compareBd && !compareBd.classList.contains("hidden")) closeCompare();
    const langBd = document.getElementById("langBuilderBackdrop");
    if (langBd && !langBd.classList.contains("hidden")) langBd.classList.add("hidden");
  });
}

// ── String Generator ─────────────────────────────────────────────────────────

const strGenBackdrop = document.getElementById("strGenBackdrop");
const strGenContainer = document.getElementById("strGenContainer");
const closeStrGenBtn = document.getElementById("closeStrGenBtn");
const strGenBtn = document.getElementById("strGenBtn");

function openStrGen() {
  const problemId = els.problemSelect.value;
  const customDef = problemId === "custom" ? customPdaDef : null;
  if (typeof renderStringGenerator === "function") {
    renderStringGenerator(
      strGenContainer,
      problemId,
      customDef,
      (input) => {
        closeStrGen();
        els.inputString.value = input;
        load();
      }
    );
  }
  strGenBackdrop.classList.remove("hidden");
}

function closeStrGen() {
  strGenBackdrop.classList.add("hidden");
}

if (strGenBtn) strGenBtn.addEventListener("click", openStrGen);
if (closeStrGenBtn) closeStrGenBtn.addEventListener("click", closeStrGen);
if (strGenBackdrop) strGenBackdrop.addEventListener("click", (e) => {
  if (e.target === strGenBackdrop) closeStrGen();
});

// ── Comparator ───────────────────────────────────────────────────────────────

const compareBackdrop = document.getElementById("compareBackdrop");
const compareContainer = document.getElementById("compareContainer");
const closeCompareBtn = document.getElementById("closeCompareBtn");
const compareBtn = document.getElementById("compareBtn");

let comparatorApi = null;
if (compareContainer && typeof initComparator === "function") {
  comparatorApi = initComparator(
    compareContainer,
    () => els.problemSelect.value,
    () => (els.problemSelect.value === "custom" ? customPdaDef : null),
    showToast
  );
}

function openCompare() {
  if (compareBackdrop) compareBackdrop.classList.remove("hidden");
}

function closeCompare() {
  if (compareBackdrop) compareBackdrop.classList.add("hidden");
}

if (compareBtn) compareBtn.addEventListener("click", openCompare);
if (closeCompareBtn) closeCompareBtn.addEventListener("click", closeCompare);
if (compareBackdrop) compareBackdrop.addEventListener("click", (e) => {
  if (e.target === compareBackdrop) closeCompare();
});

els.problemSelect.addEventListener("change", () => {
  if (comparatorApi) comparatorApi.reset();
}, true);

setExampleForProblem(els.problemSelect.value);
wireEvents();
els.editPdaBtn.hidden = els.problemSelect.value !== "custom";
renderExamples(getProblemDefinition(els.problemSelect.value));

// ── Language Builder Modal ────────────────────────────────────────────────────

(function initLanguageBuilder() {
  const backdrop = document.createElement("div");
  backdrop.id = "langBuilderBackdrop";
  backdrop.className = "modal-backdrop hidden";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.innerHTML = `
    <div class="modal modal-lb">
      <div class="modal-hd">
        <div>
          <div class="modal-title">Smart Language Builder</div>
          <div class="modal-title-sub">Type a language — the PDA builds itself</div>
        </div>
        <button id="closeLangBuilderBtn" class="mbtn">✕ Close</button>
      </div>
      <div class="modal-body lb-body">
        <div class="lb-search-wrap">
          <input id="lbInput" class="lb-input" type="text"
            placeholder="e.g.  wwR  ·  wcwR  ·  anbn  ·  anb2n  ·  a^nb^3n  ·  paren"
            spellcheck="false" autocomplete="off" />
          <button id="lbGenerateBtn" class="mbtn mbtn-primary lb-gen-btn">Generate PDA →</button>
        </div>
        <div class="lb-library">
          <div class="lb-lib-label">Or pick a language:</div>
          <div id="lbLibGrid" class="lb-lib-grid"></div>
        </div>
        <div id="lbResult" class="lb-result hidden">
          <div class="lb-result-header">
            <div class="lb-result-name" id="lbResultName"></div>
            <div class="lb-result-badges" id="lbResultBadges"></div>
          </div>
          <div class="lb-section-title">Generated Transitions</div>
          <div class="lb-transitions" id="lbTransitions"></div>
          <div class="lb-section-title">Quick Test — click any string to run it</div>
          <div class="lb-examples" id="lbExamples"></div>
        </div>
        <div id="lbError" class="builder-error hidden"></div>
      </div>
      <div class="modal-ft">
        <button id="lbLoadBtn" class="mbtn mbtn-primary" disabled>Load into Simulator →</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  // Populate library grid
  const libGrid = backdrop.querySelector("#lbLibGrid");
  if (typeof LANGUAGE_LIBRARY !== "undefined") {
    for (const group of LANGUAGE_LIBRARY) {
      const groupEl = document.createElement("div");
      groupEl.className = "lb-lib-group";
      groupEl.innerHTML = `<div class="lb-lib-group-title">${group.group}</div>`;
      for (const item of group.items) {
        const btn = document.createElement("button");
        btn.className = "lb-lib-item";
        btn.innerHTML = `<span class="lb-lib-key">${item.label}</span><span class="lb-lib-hint">${item.hint}</span>`;
        btn.addEventListener("click", () => {
          backdrop.querySelector("#lbInput").value = item.key;
          runGenerate(item.key);
        });
        groupEl.appendChild(btn);
      }
      libGrid.appendChild(groupEl);
    }
  }

  let pendingDef = null;

  function runGenerate(raw) {
    const result = backdrop.querySelector("#lbResult");
    const errEl = backdrop.querySelector("#lbError");
    const loadBtn = backdrop.querySelector("#lbLoadBtn");

    errEl.classList.add("hidden");
    result.classList.add("hidden");
    loadBtn.disabled = true;
    pendingDef = null;

    if (typeof recogniseLanguage !== "function") {
      errEl.textContent = "Language builder not available.";
      errEl.classList.remove("hidden");
      return;
    }

    const res = recogniseLanguage(raw);
    if (!res.ok) {
      errEl.textContent = res.error;
      errEl.classList.remove("hidden");
      return;
    }

    pendingDef = res.def;

    backdrop.querySelector("#lbResultName").textContent = res.def.name;

    const badges = backdrop.querySelector("#lbResultBadges");
    badges.innerHTML = res.alphabet.map(a =>
      `<span class="lb-badge">Σ: ${a}</span>`
    ).join("") +
      `<span class="lb-badge olive">${res.def.states.length} states</span>` +
      `<span class="lb-badge olive">${res.def.transitions.length} transitions</span>`;

    const trans = backdrop.querySelector("#lbTransitions");
    trans.innerHTML = res.def.transitions.map(t => {
      const read = t.read ?? "ε";
      const pop = t.pop ?? "ε";
      const push = Array.isArray(t.push) ? t.push.join(",") : (t.push ?? "ε");
      const guard = t.guard?.stackEmpty === true ? " [stack empty]"
        : t.guard?.stackEmpty === false ? " [stack non-empty]" : "";
      return `<div class="lb-trans-row">
        <code class="lb-state from">${t.from}</code>
        <span class="lb-arrow">→</span>
        <code class="lb-state to">${t.to}</code>
        <span class="lb-trans-detail">read <code>${read}</code> pop <code>${pop}</code> push <code>${push}</code>${guard}</span>
      </div>`;
    }).join("");

    const examplesEl = backdrop.querySelector("#lbExamples");
    examplesEl.innerHTML = "";
    if (Array.isArray(res.examples)) {
      for (const ex of res.examples) {
        const chip = document.createElement("button");
        let accepted = false;
        try {
          const r = runCustomDpda(pendingDef, ex);
          accepted = r.accepted;
        } catch { }
        chip.className = `lb-ex-chip ${accepted ? "accept" : "reject"}`;
        chip.textContent = ex === "" ? "ε" : ex;
        chip.title = `${accepted ? "ACCEPT" : "REJECT"} — click to test in simulator`;
        chip.addEventListener("click", () => {
          loadDefIntoSimulator(pendingDef, ex);
          closeLangBuilder();
        });
        examplesEl.appendChild(chip);
      }
    }

    result.classList.remove("hidden");
    loadBtn.disabled = false;
  }

  function loadDefIntoSimulator(d, testInput = "") {
    if (!d) return;

    customPdaDef = normalizeCustomDef(JSON.parse(JSON.stringify(d)));
    customPdaText = JSON.stringify(customPdaDef, null, 2);
    try { localStorage.setItem(CUSTOM_STORAGE_KEY, customPdaText); } catch { }

    const sel = els.problemSelect;
    if (sel.value !== "custom") {
      sel.value = "custom";
      sel.dispatchEvent(new Event("change"));
    }

    if (testInput !== undefined) {
      els.inputString.value = testInput;
    }

    setTimeout(() => {
      els.loadBtn.click();
      showToast(`Loaded: ${d.name}`);
    }, 80);
  }

  backdrop.querySelector("#closeLangBuilderBtn").addEventListener("click", closeLangBuilder);
  backdrop.addEventListener("click", e => { if (e.target === backdrop) closeLangBuilder(); });

  backdrop.querySelector("#lbGenerateBtn").addEventListener("click", () => {
    runGenerate(backdrop.querySelector("#lbInput").value.trim());
  });
  backdrop.querySelector("#lbInput").addEventListener("keydown", e => {
    if (e.key === "Enter") runGenerate(backdrop.querySelector("#lbInput").value.trim());
  });
  backdrop.querySelector("#lbLoadBtn").addEventListener("click", () => {
    if (pendingDef) {
      loadDefIntoSimulator(pendingDef, "");
      closeLangBuilder();
    }
  });

  function closeLangBuilder() {
    backdrop.classList.add("hidden");
  }

  window.__openLangBuilder = function () {
    backdrop.classList.remove("hidden");
    backdrop.querySelector("#lbInput").focus();
  };
})();

// ── Input dropdown ───────────────────────────────────────────────────────────
(function initInputDropdown() {
  const wrap = els.inputString?.parentElement;
  if (!wrap) return;

  const ddBtn = document.createElement("button");
  ddBtn.id = "inputDropdownBtn";
  ddBtn.className = "sb-dd-btn";
  ddBtn.title = "Recent inputs & quick examples";
  ddBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const runBtn = wrap.querySelector("#loadBtn");
  wrap.insertBefore(ddBtn, runBtn);

  const panel = document.createElement("div");
  panel.id = "inputDropdownPanel";
  panel.className = "sb-dd-panel hidden";
  wrap.style.position = "relative";
  wrap.appendChild(panel);

  const RECENT_KEY = "pda.recent.inputs.v1";
  const MAX_RECENT = 8;

  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
  }

  function saveRecent(input) {
    if (!input) return;
    let arr = getRecent().filter(x => x !== input);
    arr.unshift(input);
    arr = arr.slice(0, MAX_RECENT);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch { }
  }

  function buildPanel() {
    const problemId = els.problemSelect.value;
    const recent = getRecent();
    const def = (() => { try { return getProblemDefinition(problemId); } catch { return null; } })();
    const examples = def?.examples ?? [];

    let html = "";

    if (recent.length) {
      html += `<div class="sb-dd-group-title">Recent</div>`;
      for (const r of recent) {
        html += `<button class="sb-dd-item sb-dd-recent" data-val="${r.replace(/"/g, "&quot;")}">
          <span class="sb-dd-clock">↺</span>
          <span class="sb-dd-val">${r || "ε"}</span>
        </button>`;
      }
    }

    if (examples.length) {
      html += `<div class="sb-dd-group-title">Examples</div>`;
      for (const ex of examples) {
        const inp = ex.input ?? "";
        const lbl = ex.label ?? (inp || "ε");
        const cls = ex.expected === "accept" ? "sb-dd-accept"
          : ex.expected === "reject" ? "sb-dd-reject" : "";
        html += `<button class="sb-dd-item ${cls}" data-val="${inp.replace(/"/g, "&quot;")}">
          <span class="sb-dd-badge">${ex.expected === "accept" ? "✓" : ex.expected === "reject" ? "✕" : "·"}</span>
          <span class="sb-dd-val">${lbl}</span>
        </button>`;
      }
    }

    if (!html) html = `<div class="sb-dd-empty">No examples yet</div>`;

    if (recent.length) {
      html += `<button class="sb-dd-clear" id="sbDdClear">Clear recent</button>`;
    }

    panel.innerHTML = html;

    panel.querySelectorAll(".sb-dd-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.val ?? "";
        els.inputString.value = val;
        closePanel();
        els.loadBtn.click();
      });
    });

    const clearBtn = panel.querySelector("#sbDdClear");
    if (clearBtn) {
      clearBtn.addEventListener("click", e => {
        e.stopPropagation();
        try { localStorage.removeItem(RECENT_KEY); } catch { }
        buildPanel();
      });
    }
  }

  function openPanel() {
    buildPanel();
    panel.classList.remove("hidden");
  }

  function closePanel() {
    panel.classList.add("hidden");
  }

  ddBtn.addEventListener("click", e => {
    e.stopPropagation();
    panel.classList.contains("hidden") ? openPanel() : closePanel();
  });

  document.addEventListener("click", e => {
    if (!wrap.contains(e.target)) closePanel();
  });

  els.loadBtn.addEventListener("click", () => {
    saveRecent(els.inputString.value.trim());
  }, true);

  els.problemSelect.addEventListener("change", () => closePanel());
})();

// ── Wire Language Builder button ──────────────────────────────────────────────
; (function wireLangBuilderBtn() {
  let btn = document.getElementById("langBuilderBtn");
  if (!btn) {
    const block = document.getElementById("editPdaBlock");
    if (block) {
      btn = document.createElement("button");
      btn.id = "langBuilderBtn";
      btn.className = "sb-customize sb-lang-btn";
      btn.type = "button";
      btn.textContent = "✦ Smart Language Builder";
      block.appendChild(btn);
    }
  }
  if (btn) {
    btn.addEventListener("click", () => window.__openLangBuilder?.());
  }
})();

if (!applyShareHash()) load();