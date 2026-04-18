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

function toPushList(push) {
  if (push === null || push === undefined || push === "ε" || push === "") return [];
  if (Array.isArray(push)) return push.map(String);
  return [String(push)];
}

function matchesStack(pop, stack) {
  if (pop === null || pop === undefined || pop === "" || pop === "ε") return { ok: true, doPop: false, popped: null };
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

  let bestPath = [];
  let accepted = false;
  const depthLimit = Math.min(maxSteps, 2000);

  // DFS Backtracking allows Non-Deterministic evaluation (NPDA)
  function dfs(currentState, currentIdx, currentStack, currentSteps) {
    if (accepted) return;
    if (currentSteps.length >= depthLimit) {
      if (bestPath.length === 0) bestPath = [...currentSteps];
      return;
    }

    const isEof = currentIdx === input.length;

    // Accept condition
    if (isEof && accept.includes(currentState)) {
      accepted = true;
      bestPath = [...currentSteps];
      bestPath.push(
        makeStep({
          stepIndex: currentSteps.length,
          state: currentState,
          inputIndex: currentIdx,
          headIndex: null,
          read: null,
          action: { type: "noop" },
          stack: currentStack,
          note: "Accepting configuration reached",
          edgeId: null,
          status: "accept",
        })
      );
      return;
    }

    const possible = transitions.filter((t) => String(t.from) === currentState);
    let moved = false;

    for (const t of possible) {
      if (accepted) return;

      const readMatch = matchesRead(t.read, input, currentIdx);
      if (!readMatch.ok) continue;
      if (!matchesGuard(t.guard, currentStack)) continue;

      const stackMatch = matchesStack(t.pop, currentStack);
      if (!stackMatch.ok) continue;

      moved = true;
      const nextStack = [...currentStack];
      let action = { type: "noop" };

      if (stackMatch.popped !== null) {
        nextStack.pop();
        action = { type: "pop", symbol: stackMatch.popped };
      }

      const pushList = toPushList(t.push);
      if (pushList.length) {
        for (const sym of pushList) nextStack.push(sym);
        if (action.type === "pop") {
          action = { type: "pop_push", pop: action.symbol, push: pushList.slice() };
        } else {
          action = pushList.length === 1 ? { type: "push", symbol: pushList[0] } : { type: "pushMany", symbols: pushList.slice() };
        }
      }

      const nextIdx = currentIdx + readMatch.consumed;
      const nextState = String(t.to);

      currentSteps.push(
        makeStep({
          stepIndex: currentSteps.length,
          state: nextState,
          inputIndex: nextIdx,
          headIndex: readMatch.consumed === 1 ? currentIdx : null,
          read: readMatch.value,
          action: action, // Store actual complex action types
          stack: nextStack,
          note: t.label ?? `${currentState} → ${nextState}`,
          edgeId: t.id ?? null,
        })
      );

      dfs(nextState, nextIdx, nextStack, currentSteps);
      currentSteps.pop(); // Backtrack
    }

    // Dead end recording
    if (!moved && !accepted && bestPath.length === 0) {
      bestPath = [...currentSteps];
      bestPath.push(
        makeStep({
          stepIndex: currentSteps.length,
          state: reject[0] ?? "qr",
          inputIndex: currentIdx,
          headIndex: currentIdx < input.length ? currentIdx : null,
          read: currentIdx < input.length ? input[currentIdx] : null,
          action: { type: "noop" },
          stack: currentStack,
          note: "No valid transition (or not in accept at EOF)",
          edgeId: null,
          status: "reject",
        })
      );
    }
  }

  const initialStack = Array.isArray(def?.stack?.initial) ? def.stack.initial.map(String) : [];
  const initialStep = makeStep({
    stepIndex: 0,
    state: String(start),
    inputIndex: 0,
    headIndex: null,
    read: null,
    action: { type: "noop" },
    stack: initialStack,
    note: "Initialize custom DPDA",
    edgeId: null,
  });

  dfs(String(start), 0, initialStack, [initialStep]);

  if (!accepted && bestPath.length > 0 && bestPath[bestPath.length - 1].status !== "reject") {
    bestPath[bestPath.length - 1].status = "reject";
    bestPath[bestPath.length - 1].note = "Step limit exceeded. Possible ε-loop.";
  }

  // Final index alignment
  bestPath.forEach((s, i) => (s.stepIndex = i));

  return { steps: bestPath, accepted };
}