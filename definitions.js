export function getProblemDefinition(problemId) {
  if (problemId === "anbn") {
    return {
      id: "anbn",
      name: "aⁿbⁿ",
      example: "aaabbb",
      examples: [
        { input: "", label: "ε (empty)", expected: "accept" },
        { input: "ab", expected: "accept" },
        { input: "aabb", expected: "accept" },
        { input: "aaabbb", expected: "accept" },
        { input: "aabbb", expected: "reject" },
        { input: "aba", expected: "reject" },
        { input: "abb", expected: "reject" },
        { input: "ba", expected: "reject" },
      ],
      description:
        "Language: { aⁿbⁿ | n ≥ 0 }. Push A for each a in q0, then pop A for each b in q1. Accept iff input is consumed and only the bottom marker remains.",
      rootId: "q0",
      diagram: {
        nodes: [
          { data: { id: "q0", label: "q0\n(push a's)" }, classes: "start" },
          { data: { id: "q1", label: "q1\n(pop b's)" } },
          { data: { id: "qa", label: "q_accept" }, classes: "accept" },
          { data: { id: "qr", label: "q_reject" }, classes: "reject" },
        ],
        edges: [
          { data: { id: "init_push_$", source: "q0", target: "q0", label: "ε / push $" }, classes: "loop" },
          { data: { id: "q0_a_push_A", source: "q0", target: "q0", label: "a / push A" }, classes: "loop" },
          { data: { id: "q0_b_pop_A_to_q1", source: "q0", target: "q1", label: "b / pop A" } },
          { data: { id: "q1_b_pop_A", source: "q1", target: "q1", label: "b / pop A" }, classes: "loop" },
          { data: { id: "q0_eof_accept", source: "q0", target: "qa", label: "EOF & top=$" } },
          { data: { id: "q1_eof_accept", source: "q1", target: "qa", label: "EOF & top=$" } },
          { data: { id: "reject_any", source: "q0", target: "qr", label: "else" }, classes: "fallback" },
          { data: { id: "reject_any2", source: "q1", target: "qr", label: "else" }, classes: "fallback" },
        ],
      },
    };
  }

  if (problemId === "paren") {
    return {
      id: "paren",
      name: "Balanced Parentheses",
      example: "(()())",
      examples: [
        { input: "", label: "ε (empty)", expected: "accept" },
        { input: "()", expected: "accept" },
        { input: "(())", expected: "accept" },
        { input: "(()())", expected: "accept" },
        { input: "(", expected: "reject" },
        { input: "())", expected: "reject" },
        { input: ")(", expected: "reject" },
        { input: "(()", expected: "reject" },
      ],
      description:
        "Validate balanced parentheses. Push '(' on open, pop on close. Reject on underflow. Accept iff input is consumed and the stack is empty.",
      rootId: "q0",
      diagram: {
        nodes: [
          { data: { id: "q0", label: "q0\n(scan input)" }, classes: "start" },
          { data: { id: "qa", label: "q_accept" }, classes: "accept" },
          { data: { id: "qr", label: "q_reject" }, classes: "reject" },
        ],
        edges: [
          { data: { id: "q0_open_push", source: "q0", target: "q0", label: "( / push (" }, classes: "loop" },
          { data: { id: "q0_close_pop", source: "q0", target: "q0", label: ") / pop (" }, classes: "loop" },
          { data: { id: "q0_eof_accept", source: "q0", target: "qa", label: "EOF & empty" } },
          { data: { id: "reject_any", source: "q0", target: "qr", label: "else" }, classes: "fallback" },
        ],
      },
    };
  }

  if (problemId === "custom") {
    return {
      id: "custom",
      name: "Custom (DPDA)",
      example: "(()())",
      examples: [
        { input: "(()())", label: "Default: accept" },
        { input: "(()", label: "Default: reject" },
      ],
      description:
        "Custom deterministic PDA (DPDA). Click Customize to define states and transitions. The simulator always takes the first matching transition.",
      diagram: { nodes: [], edges: [] },
      custom: { templateText: getDefaultCustomDpdaText() },
    };
  }

  throw new Error(`Unknown problemId: ${problemId}`);
}

export function getDefaultCustomDpdaText() {
  const template = {
    name: "Balanced Parentheses (DPDA)",
    states: ["q0", "qa", "qr"],
    start: "q0",
    accept: ["qa"],
    reject: ["qr"],
    stack: {
      initial: [],
    },
    transitions: [
      { id: "t_open", from: "q0", to: "q0", read: "(", pop: null, push: "(", label: "(, push (" },
      { id: "t_close", from: "q0", to: "q0", read: ")", pop: "(", push: null, label: "), pop (" },
      { id: "t_eof_accept", from: "q0", to: "qa", read: "EOF", pop: null, push: null, guard: { stackEmpty: true }, label: "EOF, stack empty" },
      { id: "t_bad_eof", from: "q0", to: "qr", read: "EOF", pop: null, push: null, label: "EOF, stack not empty" },
    ],
    limits: { maxSteps: 5000 },
  };

  return JSON.stringify(template, null, 2);
}
