import { getDefaultCustomDpdaText, getProblemDefinition } from "./definitions.js";
import { runCustomDpda, runProblem } from "./engine.js";

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
  addTransitionBtn: document.getElementById("addTransitionBtn"),
  transitionsBody: document.getElementById("transitionsBody"),
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
  // Keep UI + engine indices aligned by removing whitespace before running.
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
  const reversed = stackSnapshot.slice().reverse(); // top at top
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
  renderLog(); // simplest: re-render stars
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
      // ── Base node ──────────────────────────────────────────────────────
      {
        selector: "node",
        style: {
          "background-color": "#2a2520",
          "border-width": 2,
          "border-color": "rgba(244,239,230,0.25)",
          label: "data(label)",
          color: "#f4efe6",
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
          "padding": 8,
        },
      },
      // ── Accept node ────────────────────────────────────────────────────
      {
        selector: "node#qa, node.accept",
        style: {
          "border-color": "#5cb870",
          "border-width": 2.5,
          "background-color": "rgba(58,100,50,0.55)",
          color: "#a8e6b0",
        },
      },
      // ── Reject node ────────────────────────────────────────────────────
      {
        selector: "node#qr, node.reject",
        style: {
          "border-color": "#c06060",
          "border-width": 2.5,
          "background-color": "rgba(100,40,40,0.55)",
          color: "#e8a8a8",
        },
      },
      // ── Start node ─────────────────────────────────────────────────────
      {
        selector: "node.start",
        style: {
          "border-color": "#e8a050",
          "border-width": 2.5,
          "background-color": "rgba(100,64,20,0.55)",
          color: "#f4d090",
        },
      },
      // ── Active source (outgoing from) ──────────────────────────────────
      {
        selector: ".active-source",
        style: {
          "border-color": "#e8a050",
          "border-width": 3,
          "background-color": "rgba(168,96,32,0.35)",
          color: "#f4d090",
        },
      },
      // ── Active target (arriving at) ────────────────────────────────────
      {
        selector: ".active-target",
        style: {
          "border-color": "#7ab0e0",
          "border-width": 3,
          "background-color": "rgba(40,80,140,0.35)",
          color: "#b8d8f8",
        },
      },
      // ── Currently active state ─────────────────────────────────────────
      {
        selector: "node.active-current",
        style: {
          "background-color": "rgba(168,96,32,0.45)",
          "border-color": "#e8a050",
          "border-width": 3.5,
          color: "#fde090",
          "box-shadow": "0 0 0 4px rgba(168,96,32,0.25)",
        },
      },
      // ── Base edge ──────────────────────────────────────────────────────
      {
        selector: "edge",
        style: {
          width: 2,
          "line-color": "rgba(244,239,230,0.30)",
          "target-arrow-color": "rgba(244,239,230,0.30)",
          "target-arrow-shape": "triangle",
          "arrow-scale": 1.4,
          "curve-style": "bezier",
          label: "data(label)",
          color: "#f4efe6",
          "font-family": "'DM Mono', ui-monospace, Menlo, monospace",
          "font-size": 11,
          "font-weight": 400,
          "text-background-opacity": 1,
          "text-background-color": "#1a1710",
          "text-background-padding": "5px",
          "text-background-shape": "roundrectangle",
          "text-border-width": 1,
          "text-border-color": "rgba(244,239,230,0.18)",
          "text-border-opacity": 1,
          "text-margin-y": -6,
          "transition-property": "line-color, target-arrow-color, width",
          "transition-duration": "180ms",
        },
      },
      // ── Loop / self-edge ───────────────────────────────────────────────
      {
        selector: "edge.loop, edge[source = target]",
        style: {
          "loop-direction": "50deg",
          "loop-sweep": "80deg",
          "text-margin-y": -14,
          "text-margin-x": 0,
        },
      },
      // ── Fallback / else edge ───────────────────────────────────────────
      {
        selector: "edge.fallback",
        style: {
          "line-style": "dashed",
          "line-dash-pattern": [6, 4],
          "line-color": "rgba(244,239,230,0.18)",
          "target-arrow-color": "rgba(244,239,230,0.18)",
          color: "rgba(244,239,230,0.40)",
          width: 1.5,
        },
      },
      // ── Active (firing) edge ───────────────────────────────────────────
      {
        selector: "edge.active-edge",
        style: {
          width: 3.5,
          "line-color": "#e8a050",
          "target-arrow-color": "#e8a050",
          "arrow-scale": 1.8,
          color: "#fde090",
          "text-background-color": "#2a1e0a",
          "text-border-color": "rgba(232,160,80,0.45)",
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
  // local import is the source of truth; avoids relying on optional fields.
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

function addTransitionRow(t = {}) {
  const tr = document.createElement("tr");
  tr.dataset.id = String(t.id ?? "");

  const mkInput = (value, placeholder = "") => {
    const input = document.createElement("input");
    input.className = "mini-input";
    input.type = "text";
    input.autocomplete = "off";
    input.value = value ?? "";
    if (placeholder) input.placeholder = placeholder;
    return input;
  };

  const mkSelect = (value) => {
    const select = document.createElement("select");
    select.className = "mini-input mini-select";
    const opts = [
      { v: "any", t: "Any" },
      { v: "empty", t: "Stack empty" },
      { v: "nonempty", t: "Stack non-empty" },
    ];
    for (const o of opts) {
      const opt = document.createElement("option");
      opt.value = o.v;
      opt.textContent = o.t;
      select.appendChild(opt);
    }
    select.value = value ?? "any";
    return select;
  };

  const from = mkInput(t.from ?? "", "q0");
  const read = mkInput(t.read === null || t.read === undefined ? "ε" : t.read, "ε / a / EOF");
  const pop = mkInput(t.pop === null || t.pop === undefined ? "ε" : t.pop, "ε / A / *");
  const push = mkInput(
    Array.isArray(t.push) ? t.push.join(",") : t.push === null || t.push === undefined ? "ε" : t.push,
    "ε / A / A,B",
  );
  const to = mkInput(t.to ?? "", "q1");
  const guardSel = mkSelect(t.guard?.stackEmpty === true ? "empty" : t.guard?.stackEmpty === false ? "nonempty" : "any");
  const label = mkInput(t.label ?? "", "optional");

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn mini-btn";
  delBtn.textContent = "✕";
  delBtn.title = "Delete";
  delBtn.addEventListener("click", () => tr.remove());

  const td = (...children) => {
    const cell = document.createElement("td");
    for (const c of children) cell.appendChild(c);
    return cell;
  };

  tr.appendChild(td(from));
  tr.appendChild(td(read));
  tr.appendChild(td(pop));
  tr.appendChild(td(push));
  tr.appendChild(td(to));
  tr.appendChild(td(guardSel));
  tr.appendChild(td(label));
  tr.appendChild(td(delBtn));

  els.transitionsBody.appendChild(tr);
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

  els.transitionsBody.replaceChildren();
  const transitions = Array.isArray(safe.transitions) ? safe.transitions : [];
  if (!transitions.length) addTransitionRow({ from: "q0", to: "q0", read: "ε", pop: "ε", push: "ε", label: "" });
  else for (const t of transitions) addTransitionRow(t);

  els.pdaJson.value = JSON.stringify(safe, null, 2);
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

function buildCustomDefFromBuilder() {
  const name = String(els.customName.value ?? "").trim() || "Custom DPDA";
  const states = parseCsv(els.customStates.value);
  const start = String(els.customStart.value ?? "").trim() || "q0";
  const accept = parseCsv(els.customAccept.value);
  const reject = parseCsv(els.customReject.value);
  const stackInitial = parseCsv(els.customStackInitial.value);

  const rows = Array.from(els.transitionsBody.querySelectorAll("tr"));
  const transitions = [];
  const usedIds = new Set();

  for (let i = 0; i < rows.length; i += 1) {
    const tr = rows[i];
    const inputs = Array.from(tr.querySelectorAll("input,select"));
    const [fromEl, readEl, popEl, pushEl, toEl, guardEl, labelEl] = inputs;

    const from = String(fromEl?.value ?? "").trim();
    const to = String(toEl?.value ?? "").trim();

    const readRaw = normalizeEpsilonToken(readEl?.value ?? "");
    const popRaw = normalizeEpsilonToken(popEl?.value ?? "");
    const pushRaw = normalizeEpsilonToken(pushEl?.value ?? "");

    const read =
      !readRaw || readRaw === "ε"
        ? "ε"
        : readRaw.toUpperCase() === "EOF"
          ? "EOF"
          : readRaw;

    const pop = !popRaw || popRaw === "ε" ? null : popRaw;
    const push = !pushRaw || pushRaw === "ε" ? null : parseMaybeArray(pushRaw);

    const guardVal = String(guardEl?.value ?? "any");
    const guard = guardVal === "empty" ? { stackEmpty: true } : guardVal === "nonempty" ? { stackEmpty: false } : undefined;

    const label = String(labelEl?.value ?? "").trim();

    const baseId = String(tr.dataset.id ?? "").trim() || `t_${i}`;
    const id = uniqueTransitionId(usedIds, baseId);

    if (!from || !to) continue;
    transitions.push({
      id,
      from,
      to,
      read,
      pop,
      push,
      guard,
      label: label || undefined,
    });
  }

  const allStates = states.length ? states : Array.from(new Set([start, ...transitions.flatMap((t) => [t.from, t.to]), ...accept, ...reject]));
  const acceptStates = accept.length ? accept : ["qa"];
  const rejectStates = reject.length ? reject : ["qr"];

  return {
    name,
    states: allStates,
    start,
    accept: acceptStates,
    reject: rejectStates,
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

  // click-to-jump
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
    // Switching problems should feel deterministic: reset to a valid example.
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
        const raw = String(els.pdaJson.value ?? "").trim();
        nextDef = normalizeCustomDef(JSON.parse(raw));
      } else {
        nextDef = normalizeCustomDef(buildCustomDefFromBuilder());
      }

      customPdaDef = nextDef;
      customPdaText = JSON.stringify(nextDef, null, 2);
      localStorage.setItem(CUSTOM_STORAGE_KEY, customPdaText);

      // Keep both views in sync.
      renderCustomBuilder(customPdaDef);
      closeModal();
      load();
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

  els.addTransitionBtn.addEventListener("click", () => {
    addTransitionRow({ id: "", from: "q0", to: "q0", read: "ε", pop: null, push: null, label: "" });
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
  });
}

setExampleForProblem(els.problemSelect.value);
wireEvents();
els.editPdaBtn.hidden = els.problemSelect.value !== "custom";
renderExamples(getProblemDefinition(els.problemSelect.value));
if (!applyShareHash()) load();