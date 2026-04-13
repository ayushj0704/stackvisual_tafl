# Automata Lab : PDA Stack Visualizer

> *See how stack memory thinks.*

A fully client-side, zero-dependency **pushdown automaton (PDA) simulator** built for Theory of Computation students. Step through any deterministic PDA frame by frame — watch the stack animate, trace every state transition on a live diagram, and replay any moment in the computation history.

---

## Live Demo

Here is the Deployed link : `[<link](https://ayushj0704.github.io/stackvisual_tafl/)`
---

## Screenshots

| Landing Page | Simulator — aⁿbⁿ | Custom DPDA Builder |
|---|---|---|
| Editorial hero with examples gallery | Live stack + state diagram + step log | GUI transition table or raw JSON |

---

## What It Does

Automata Lab lets you load a string, run it through a pushdown automaton, and watch **every single step** of the computation:

- The **input tape** highlights the symbol being read, dims consumed symbols, and shows the read head position
- The **stack panel** animates each push and pop with spring transitions — the TOP item is always visually distinct
- The **state diagram** (powered by Cytoscape.js) highlights the current state in amber and the active transition edge in real time
- The **step log** records every transition taken with state, read symbol, action, and stack top — click any row to jump directly to that moment
- The **playback controls** let you step forward, step back, play at adjustable speed, or scrub the timeline slider

---

## Built-in Languages

| Language | Type | Description |
|---|---|---|
| **aⁿbⁿ** | Context-Free | Push A for each `a`, pop A for each `b`. Classic CFL proof. |
| **Balanced Parentheses** | Context-Free | Push on `(`, pop on `)`, reject on underflow. Accept on empty stack at EOF. |
| **wwᴿ (Even Palindrome)** | Context-Free | Push first half, pop-and-match second half. Deterministic midpoint-guess. |
| **aⁿb²ⁿ** | Context-Free | Push two markers per `a`, pop one per `b`. Tests double-count recognition. |
| **aⁿbⁿcⁿ** | **Not** Context-Free | Demo machine that rejects all inputs — illustrates PDA limits via pumping lemma. |
| **Custom DPDA** | User-defined | Build any deterministic PDA via GUI table or raw JSON. |

Each built-in language comes with pre-loaded accept/reject examples you can run in one click.

---

## Features

### Simulator
- **Step-by-step playback** — forward, backward, play/pause, speed control (0.2×–2.0×)
- **Timeline scrubber** — jump to any step instantly
- **Bookmarks** — star any step in the log to mark it for review
- **Stack depth sparkline** — visualises stack height over the full run at a glance
- **Metrics panel** — total steps, max stack depth, current position
- **Share** — generates a URL-encoded link encoding the problem, input, custom DPDA definition, and current step. Anyone with the link lands on the exact same frame
- **Export** — downloads the full step log as JSON for offline analysis or submission

### State Diagram
- Rendered by [Cytoscape.js](https://js.cytoscape.org/) with a `breadthfirst` directed layout
- Start state — **amber** border; Accept state — **green** border; Reject state — **rose** border
- Active state pulses with an amber glow; the firing edge turns amber and thickens; the destination state highlights in blue
- Edge labels sit on dark pill backgrounds — readable at any zoom level
- Fully pannable and zoomable

### Custom DPDA Builder
Define your own machine two ways:

**GUI table** — fill in From, Read, Pop, Push, To, Guard, and Label columns. No JSON knowledge required.

**Advanced JSON** — paste or edit a full machine definition:

```json
{
  "name": "My DPDA",
  "states": ["q0", "q1", "qa", "qr"],
  "start": "q0",
  "accept": ["qa"],
  "reject": ["qr"],
  "stack": { "initial": [] },
  "transitions": [
    { "id": "t1", "from": "q0", "to": "q0", "read": "a", "pop": null, "push": "A", "label": "a / push A" },
    { "id": "t2", "from": "q0", "to": "qa", "read": "EOF", "pop": null, "push": null, "guard": { "stackEmpty": true }, "label": "EOF / empty → accept" }
  ],
  "limits": { "maxSteps": 5000 }
}
```

**Transition fields:**

| Field | Values | Meaning |
|---|---|---|
| `read` | any char, `"ε"`, `"EOF"`, `"*"` | Symbol to consume; `ε` = no consume; `EOF` = end-of-input guard; `*` = any |
| `pop` | symbol string, `null`, `"*"` | Pop this from stack top; `null` = no pop; `*` = pop any |
| `push` | symbol string, array, `null` | Push symbol(s) after pop; array = multi-push left-to-right |
| `guard` | `{ "stackEmpty": true/false }` | Additional condition on stack state |

The simulator is **deterministic**: the first matching transition in declaration order fires. ε-loops are caught by the `maxSteps` limit (default 5 000).

---

## Project Structure

```
automata-lab/
├── index.html          # Single-page app shell — landing + simulator + modals
├── styles.css          # Full design system — cream editorial theme throughout
├── app.js              # UI controller — rendering, playback, events, Cytoscape setup
├── engine.js           # Pure computation — PDA step engines, no DOM dependency
└── definitions.js      # Built-in problem definitions — states, edges, examples
```

### Architecture

The project is intentionally vanilla — no framework, no bundler, no npm. It uses ES modules (`type="module"`) so all imports are native browser imports.

```
index.html
  └── app.js  (module)
        ├── import { getProblemDefinition, getDefaultCustomDpdaText } from "./definitions.js"
        └── import { runProblem, runCustomDpda }                      from "./engine.js"
```

**`engine.js`** — pure functions only. `runAnBn`, `runBalancedParentheses`, and `runCustomDpda` each take a raw input string (and optionally a DPDA definition) and return `{ steps, accepted }`. Steps are immutable snapshots:

```js
{
  stepIndex: number,
  state: string,
  inputIndex: number,
  headIndex: number | null,
  read: string | null,
  action: { type: "push"|"pop"|"noop", symbol?: string },
  stack: string[],        // cloned — never mutated
  note: string,
  edgeId: string | null,
  status: "running" | "accept" | "reject"
}
```

**`app.js`** — consumes the step array and drives all UI. Key responsibilities:

- `load()` — runs the engine, stores steps, renders step 0
- `renderStep(n)` — updates tape, stack, diagram highlight, log row, metrics
- `animateStackTransition()` — diffs adjacent steps to decide push/pop/full-redraw
- `initDiagram()` — creates or recreates the Cytoscape instance with the current problem's graph
- `buildShareHash()` / `applyShareHash()` — URL state serialisation via `URLSearchParams` + base64url

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `→` | Step forward |
| `←` | Step back |
| `Home` | Jump to step 0 |
| `End` | Jump to final step |
| `Escape` | Close any open modal |

---

## Theory Background

A **pushdown automaton** is a finite state machine augmented with a stack. Formally a 7-tuple:

```
M = (Q, Σ, Γ, δ, q₀, Z₀, F)
```

| Symbol | Meaning |
|---|---|
| Q | Finite set of states |
| Σ | Input alphabet |
| Γ | Stack alphabet |
| δ | Transition function: Q × (Σ ∪ {ε}) × Γ → P(Q × Γ*) |
| q₀ | Start state |
| Z₀ | Initial stack symbol |
| F | Set of accepting states |

PDAs recognise exactly the **context-free languages** — the class sitting strictly between regular languages (DFAs) and recursively enumerable languages (Turing machines).

This simulator implements **deterministic PDAs (DPDAs)** with **acceptance by final state**: the machine accepts if it reaches a state in F with no remaining input. At most one transition fires per configuration.


---

