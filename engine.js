function cloneStack(stack) {
  return stack.slice();
}

function normalizeInput(str) {
  return (str ?? "").trim();
}

function makeStep({
  stepIndex,
  state,
  inputIndex,
  headIndex,
  read,
  action,
  stack,
  note,
  edgeId,
  status = "running",
}) {
  return {
    stepIndex,
    state,
    inputIndex,
    headIndex,
    read,
    action,
    stack: cloneStack(stack),
    note,
    edgeId,
    status,
  };
}

export function runAnBn(rawInput) {
  const input = normalizeInput(rawInput);

  let state = "q0";
  let idx = 0;
  let stack = [];
  const steps = [];
  let stepIndex = 0;

  const bottom = "$";
  const push = (symbol) => stack.push(symbol);
  const pop = () => stack.pop();
  const top = () => stack[stack.length - 1];

  // init: push bottom marker
  push(bottom);
  steps.push(
    makeStep({
      stepIndex: stepIndex++,
      state,
      inputIndex: idx,
      headIndex: null,
      read: null,
      action: { type: "push", symbol: bottom },
      stack,
      note: "Initialize stack with bottom marker",
      edgeId: "init_push_$",
    }),
  );

  const reject = (note, edgeId, headIndex = idx, read = input[headIndex] ?? null) => {
    state = "qr";
    steps.push(
      makeStep({
        stepIndex: stepIndex++,
        state,
        inputIndex: idx,
        headIndex,
        read,
        action: { type: "noop" },
        stack,
        note,
        edgeId,
        status: "reject",
      }),
    );
  };

  const accept = (note, edgeId) => {
    state = "qa";
    steps.push(
      makeStep({
        stepIndex: stepIndex++,
        state,
        inputIndex: idx,
        headIndex: null,
        read: null,
        action: { type: "noop" },
        stack,
        note,
        edgeId,
        status: "accept",
      }),
    );
  };

  while (idx < input.length) {
    const ch = input[idx];

    if (state === "q0") {
      if (ch === "a") {
        const headIndex = idx;
        push("A");
        idx += 1;
        steps.push(
          makeStep({
            stepIndex: stepIndex++,
            state,
            inputIndex: idx,
            headIndex,
            read: "a",
            action: { type: "push", symbol: "A" },
            stack,
            note: "Read a → push A",
            edgeId: "q0_a_push_A",
          }),
        );
        continue;
      }
      if (ch === "b") {
        if (top() !== "A") {
          reject("Read b but stack top is not A", "reject_any");
          break;
        }
        const headIndex = idx;
        pop();
        idx += 1;
        state = "q1";
        steps.push(
          makeStep({
            stepIndex: stepIndex++,
            state,
            inputIndex: idx,
            headIndex,
            read: "b",
            action: { type: "pop", symbol: "A" },
            stack,
            note: "First b → pop A and switch to q1",
            edgeId: "q0_b_pop_A_to_q1",
          }),
        );
        continue;
      }
      reject(`Invalid symbol '${ch}' (expected a or b)`, "reject_any");
      break;
    }

    if (state === "q1") {
      if (ch === "b") {
        if (top() !== "A") {
          reject("Read b but stack is empty of A's", "reject_any2");
          break;
        }
        const headIndex = idx;
        pop();
        idx += 1;
        steps.push(
          makeStep({
            stepIndex: stepIndex++,
            state,
            inputIndex: idx,
            headIndex,
            read: "b",
            action: { type: "pop", symbol: "A" },
            stack,
            note: "Read b → pop A",
            edgeId: "q1_b_pop_A",
          }),
        );
        continue;
      }
      reject(`Invalid symbol '${ch}' in q1 (expected b)`, "reject_any2");
      break;
    }

    reject("Unknown state", "reject_any");
    break;
  }

  if (steps[steps.length - 1]?.status === "reject") return { steps, accepted: false };

  // EOF decision
  const onlyBottom = stack.length === 1 && top() === bottom;
  if (onlyBottom) {
    accept("EOF with only bottom marker → accept", state === "q0" ? "q0_eof_accept" : "q1_eof_accept");
    return { steps, accepted: true };
  }

  reject("EOF but stack still has unmatched A's", state === "q0" ? "reject_any" : "reject_any2", idx, null);
  return { steps, accepted: false };
}

export function runBalancedParentheses(rawInput) {
  const input = normalizeInput(rawInput);

  let state = "q0";
  let idx = 0;
  let stack = [];
  const steps = [];
  let stepIndex = 0;

  const push = (symbol) => stack.push(symbol);
  const pop = () => stack.pop();
  const top = () => stack[stack.length - 1];

  const reject = (note, edgeId, headIndex = idx, read = input[headIndex] ?? null) => {
    state = "qr";
    steps.push(
      makeStep({
        stepIndex: stepIndex++,
        state,
        inputIndex: idx,
        headIndex,
        read,
        action: { type: "noop" },
        stack,
        note,
        edgeId,
        status: "reject",
      }),
    );
  };

  const accept = (note, edgeId) => {
    state = "qa";
    steps.push(
      makeStep({
        stepIndex: stepIndex++,
        state,
        inputIndex: idx,
        headIndex: null,
        read: null,
        action: { type: "noop" },
        stack,
        note,
        edgeId,
        status: "accept",
      }),
    );
  };

  // init step (stable first frame)
  steps.push(
    makeStep({
      stepIndex: stepIndex++,
      state,
      inputIndex: idx,
      headIndex: null,
      read: null,
      action: { type: "noop" },
      stack,
      note: "Initialize with empty stack",
      edgeId: null,
    }),
  );

  while (idx < input.length) {
    const ch = input[idx];

    if (ch === "(") {
      const headIndex = idx;
      push("(");
      idx += 1;
      steps.push(
        makeStep({
          stepIndex: stepIndex++,
          state,
          inputIndex: idx,
          headIndex,
          read: "(",
          action: { type: "push", symbol: "(" },
          stack,
          note: "Read ( → push (",
          edgeId: "q0_open_push",
        }),
      );
      continue;
    }

    if (ch === ")") {
      if (top() !== "(") {
        reject("Read ) but stack top is not ( (underflow)", "reject_any");
        break;
      }
      const headIndex = idx;
      pop();
      idx += 1;
      steps.push(
        makeStep({
          stepIndex: stepIndex++,
          state,
          inputIndex: idx,
          headIndex,
          read: ")",
          action: { type: "pop", symbol: "(" },
          stack,
          note: "Read ) → pop (",
          edgeId: "q0_close_pop",
        }),
      );
      continue;
    }

    reject(`Invalid symbol '${ch}' (expected ( or ))`, "reject_any");
    break;
  }

  if (steps[steps.length - 1]?.status === "reject") return { steps, accepted: false };

  if (stack.length === 0) {
    accept("EOF with empty stack → accept", "q0_eof_accept");
    return { steps, accepted: true };
  }

  reject("EOF but stack not empty → reject", "reject_any", idx, null);
  return { steps, accepted: false };
}

export function runProblem(problemId, input) {
  if (problemId === "anbn") return runAnBn(input);
  if (problemId === "paren") return runBalancedParentheses(input);
  throw new Error(`Unknown problemId: ${problemId}`);
}

function toPushList(push) {
  if (push === null || push === undefined) return [];
  if (Array.isArray(push)) return push.map(String);
  return [String(push)];
}

function normalizeRead(read) {
  if (read === undefined) return null;
  if (read === null) return null;
  if (read === "ε") return null;
  if (read === "") return null;
  return String(read);
}

function matchesGuard(guard, stack) {
  if (!guard) return true;
  if (guard.stackEmpty === true && stack.length !== 0) return false;
  if (guard.stackEmpty === false && stack.length === 0) return false;
  if (guard.stackTop !== undefined && guard.stackTop !== null) {
    const want = String(guard.stackTop);
    const top = stack[stack.length - 1];
    if (top !== want) return false;
  }
  return true;
}

function matchesRead(read, input, idx) {
  const r = normalizeRead(read);
  if (r === null) return { ok: true, kind: "epsilon", consumed: 0, value: null };
  if (r === "EOF") return { ok: idx === input.length, kind: "eof", consumed: 0, value: "EOF" };
  if (idx >= input.length) return { ok: false };
  if (r === "*") return { ok: true, kind: "char", consumed: 1, value: input[idx] };
  if (input[idx] === r) return { ok: true, kind: "char", consumed: 1, value: r };
  return { ok: false };
}

function matchesStack(pop, stack) {
  if (pop === null || pop === undefined || pop === "") return { ok: true, doPop: false, popped: null };
  const p = String(pop);
  if (p === "*") {
    if (stack.length === 0) return { ok: false };
    return { ok: true, doPop: true, popped: stack[stack.length - 1] };
  }
  if (stack.length === 0) return { ok: false };
  if (stack[stack.length - 1] !== p) return { ok: false };
  return { ok: true, doPop: true, popped: p };
}

export function runCustomDpda(def, rawInput) {
  const input = normalizeInput(rawInput);

  const start = def?.start ?? "q0";
  const accept = Array.isArray(def?.accept) ? def.accept.map(String) : ["qa"];
  const reject = Array.isArray(def?.reject) ? def.reject.map(String) : ["qr"];
  const transitions = Array.isArray(def?.transitions) ? def.transitions : [];
  const maxSteps = Number(def?.limits?.maxSteps ?? 5000);

  let state = String(start);
  let idx = 0;
  let stack = Array.isArray(def?.stack?.initial) ? def.stack.initial.map(String) : [];
  const steps = [];
  let stepIndex = 0;

  // stable first frame
  steps.push(
    makeStep({
      stepIndex: stepIndex++,
      state,
      inputIndex: idx,
      headIndex: null,
      read: null,
      action: { type: "noop" },
      stack,
      note: "Initialize custom DPDA",
      edgeId: null,
    }),
  );

  const pushSymbols = (symbols) => {
    for (const sym of symbols) stack.push(sym);
  };

  const rejectNow = (note) => {
    state = reject[0] ?? "qr";
    steps.push(
      makeStep({
        stepIndex: stepIndex++,
        state,
        inputIndex: idx,
        headIndex: idx < input.length ? idx : null,
        read: idx < input.length ? input[idx] : null,
        action: { type: "noop" },
        stack,
        note,
        edgeId: null,
        status: "reject",
      }),
    );
  };

  const acceptNow = (note) => {
    state = accept[0] ?? "qa";
    steps.push(
      makeStep({
        stepIndex: stepIndex++,
        state,
        inputIndex: idx,
        headIndex: null,
        read: null,
        action: { type: "noop" },
        stack,
        note,
        edgeId: null,
        status: "accept",
      }),
    );
  };

  for (let guardSteps = 0; guardSteps < maxSteps; guardSteps += 1) {
    if (steps[steps.length - 1]?.status === "reject") return { steps, accepted: false };
    if (steps[steps.length - 1]?.status === "accept") return { steps, accepted: true };

    // stop if we are in accept/reject states AND no more input; still allow explicit EOF transitions.
    const possible = transitions.filter((t) => String(t.from) === state);
    if (possible.length === 0) break;

    let chosen = null;
    let chosenRead = null;
    let chosenConsume = 0;
    let chosenPopped = null;

    for (const t of possible) {
      const readMatch = matchesRead(t.read, input, idx);
      if (!readMatch.ok) continue;

      if (!matchesGuard(t.guard, stack)) continue;

      const stackMatch = matchesStack(t.pop, stack);
      if (!stackMatch.ok) continue;

      chosen = t;
      chosenRead = readMatch.value;
      chosenConsume = readMatch.consumed;
      chosenPopped = stackMatch.popped;
      break; // deterministic: first match wins
    }

    if (!chosen) break;

    const fromState = state;
    const headIndex = chosenConsume === 1 ? idx : null;

    // apply stack pop
    let action = { type: "noop" };
    if (chosenPopped !== null) {
      stack.pop();
      action = { type: "pop", symbol: chosenPopped };
    }

    // apply stack push (after pop)
    const pushList = toPushList(chosen.push);
    if (pushList.length) {
      pushSymbols(pushList);
      if (action.type === "pop") {
        action = { type: "pop_push", pop: action.symbol, push: pushList.slice() };
      } else {
        action = pushList.length === 1 ? { type: "push", symbol: pushList[0] } : { type: "pushMany", symbols: pushList.slice() };
      }
    }

    // advance input and state
    idx += chosenConsume;
    state = String(chosen.to);

    steps.push(
      makeStep({
        stepIndex: stepIndex++,
        state,
        inputIndex: idx,
        headIndex,
        read: chosenRead,
        action:
          action.type === "pop_push" || action.type === "pushMany"
            ? { type: "noop" } // keep UI simple; stack diff animation will still show changes
            : action,
        stack,
        note: chosen.label ?? `${fromState} → ${state}`,
        edgeId: chosen.id ?? null,
      }),
    );
  }

  if (stepIndex >= maxSteps) {
    rejectNow(`Step limit exceeded (${maxSteps}). Possible ε-loop.`);
    return { steps, accepted: false };
  }

  const isAccepted = accept.includes(state) && idx === input.length;
  if (isAccepted) {
    acceptNow("Accepting configuration reached");
    return { steps, accepted: true };
  }

  rejectNow("No valid transition (or not in accept at EOF)");
  return { steps, accepted: false };
}

