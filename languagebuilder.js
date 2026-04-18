/**
 * language-builder.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Smart DPDA generator for Automata Lab.
 *
 * Given a plain-text language description like "wwR", "wcwR", "anbn", "a^nb^2n",
 * it returns a fully-formed DPDA definition (same shape as customPdaDef) that
 * the existing engine can run directly — no manual transition entry needed.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function def(name, states, start, accept, reject, transitions, alphabet = []) {
    return {
        name,
        states,
        start,
        accept,
        reject,
        stack: { initial: [] },
        transitions,
        limits: { maxSteps: 5000 },
        _alphabet: alphabet,
    };
}

function t(id, from, to, read, pop, push, label, guard) {
    const obj = { id, from, to, read: read ?? "ε", pop: pop ?? null, push: push ?? null, label };
    if (guard !== undefined) obj.guard = guard;
    return obj;
}

// ── Language generators ───────────────────────────────────────────────────────

function buildWWR() {
    return def(
        "wwᴿ — Even Palindrome  { wwᴿ | w ∈ {a,b}* }",
        ["q0", "q1", "qa", "qr"],
        "q0",
        ["qa"],
        ["qr"],
        [
            t("wwr_pa", "q0", "q0", "a", null, "A", "a / push A"),
            t("wwr_pb", "q0", "q0", "b", null, "B", "b / push B"),
            t("wwr_ma", "q0", "q1", "a", "A", null, "a / pop A  (midpoint)"),
            t("wwr_mb", "q0", "q1", "b", "B", null, "b / pop B  (midpoint)"),
            t("wwr_qa", "q1", "q1", "a", "A", null, "a / pop A"),
            t("wwr_qb", "q1", "q1", "b", "B", null, "b / pop B"),
            t("wwr_acc", "q1", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t("wwr_rj0", "q0", "qr", "EOF", null, null, "EOF in q0 → reject"),
            t("wwr_rj1", "q1", "qr", "EOF", null, null, "EOF / non-empty → reject"),
        ],
        ["a", "b"]
    );
}

function buildWCWR() {
    return def(
        "wcwᴿ — Centre-marked Palindrome  { wcwᴿ | w ∈ {a,b}* }",
        ["q0", "q1", "qa", "qr"],
        "q0",
        ["qa"],
        ["qr"],
        [
            t("wcwr_pa", "q0", "q0", "a", null, "A", "a / push A"),
            t("wcwr_pb", "q0", "q0", "b", null, "B", "b / push B"),
            t("wcwr_c", "q0", "q1", "c", null, null, "c / pivot → q1"),
            t("wcwr_qa", "q1", "q1", "a", "A", null, "a / pop A"),
            t("wcwr_qb", "q1", "q1", "b", "B", null, "b / pop B"),
            t("wcwr_acc", "q1", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t("wcwr_rj", "q0", "qr", "EOF", null, null, "no centre marker → reject"),
            t("wcwr_rj2", "q1", "qr", "EOF", null, null, "stack not empty → reject"),
        ],
        ["a", "b", "c"]
    );
}

function buildAnBn() {
    return def(
        "aⁿbⁿ  { aⁿbⁿ | n ≥ 0 }",
        ["q0", "q1", "qa", "qr"],
        "q0",
        ["qa"],
        ["qr"],
        [
            t("ab_pa", "q0", "q0", "a", null, "A", "a / push A"),
            t("ab_pop", "q0", "q1", "b", "A", null, "b / pop A → q1"),
            t("ab_q1", "q1", "q1", "b", "A", null, "b / pop A"),
            t("ab_acc0", "q0", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t("ab_acc1", "q1", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t("ab_rj0", "q0", "qr", "EOF", null, null, "else → reject"),
            t("ab_rj1", "q1", "qr", "EOF", null, null, "else → reject"),
        ],
        ["a", "b"]
    );
}

function buildAnB2n() {
    return def(
        "aⁿb²ⁿ  { aⁿb²ⁿ | n ≥ 0 }",
        ["q0", "q1", "qa", "qr"],
        "q0",
        ["qa"],
        ["qr"],
        [
            t("a2_pa", "q0", "q0", "a", null, ["A", "A"], "a / push AA"),
            t("a2_1b", "q0", "q1", "b", "A", null, "b / pop A → q1"),
            t("a2_b", "q1", "q1", "b", "A", null, "b / pop A"),
            t("a2_acc0", "q0", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t("a2_acc1", "q1", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t("a2_rj0", "q0", "qr", "EOF", null, null, "else → reject"),
            t("a2_rj1", "q1", "qr", "EOF", null, null, "else → reject"),
        ],
        ["a", "b"]
    );
}

function buildA2nBn() {
    return def(
        "a²ⁿbⁿ  { a²ⁿbⁿ | n ≥ 0 }",
        ["q0", "q1", "q2", "qa", "qr"],
        "q0",
        ["qa"],
        ["qr"],
        [
            t("2a_a1", "q0", "q1", "a", null, null, "1st a / no push"),
            t("2a_a2", "q1", "q0", "a", null, "A", "2nd a / push A"),
            t("2a_b", "q0", "q2", "b", "A", null, "b / pop A → q2"),
            t("2a_b2", "q2", "q2", "b", "A", null, "b / pop A"),
            t("2a_acc0", "q0", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t("2a_acc2", "q2", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t("2a_rj0", "q0", "qr", "EOF", null, null, "else → reject"),
            t("2a_rj1", "q1", "qr", "EOF", null, null, "odd a's → reject"),
            t("2a_rj2", "q2", "qr", "EOF", null, null, "else → reject"),
        ],
        ["a", "b"]
    );
}

function buildAnBnCn() {
    return def(
        "aⁿbⁿcⁿ  (Not CFL — always rejects)",
        ["q0", "qr"],
        "q0",
        [],
        ["qr"],
        [
            t("abc_rj", "q0", "qr", "EOF", null, null, "EOF → reject (not CFL)"),
        ],
        ["a", "b", "c"]
    );
}

function buildParen() {
    return def(
        "Balanced Parentheses  { balanced ( ) }",
        ["q0", "qa", "qr"],
        "q0",
        ["qa"],
        ["qr"],
        [
            t("par_open", "q0", "q0", "(", null, "(", "( / push ("),
            t("par_close", "q0", "q0", ")", "(", null, ") / pop ("),
            t("par_acc", "q0", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t("par_rj", "q0", "qr", "EOF", null, null, "else → reject"),
        ],
        ["(", ")"]
    );
}

function buildBalancedBraces() {
    return def(
        "Balanced Braces  { balanced { } }",
        ["q0", "qa", "qr"],
        "q0",
        ["qa"],
        ["qr"],
        [
            t("br_open", "q0", "q0", "{", null, "{", "{ / push {"),
            t("br_close", "q0", "q0", "}", "{", null, "} / pop {"),
            t("br_acc", "q0", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t("br_rj", "q0", "qr", "EOF", null, null, "else → reject"),
        ],
        ["{", "}"]
    );
}

function buildAnBmN_gt() {
    return def(
        `aⁿbᵐ where m > n`,
        ["q0", "q1", "q2", "qa", "qr"],
        "q0",
        ["qa"],
        ["qr"],
        [
            t("mn_pa", "q0", "q0", "a", null, "A", "a / push A"),
            t("mn_b1", "q0", "q1", "b", "A", null, "b / pop A (matching)"),
            t("mn_b_empty", "q0", "q2", "b", null, null, "b / empty stack"),
            t("mn_b2", "q1", "q1", "b", "A", null, "b / pop A (matching)"),
            t("mn_b3", "q1", "q2", "b", null, null, "extra b / empty stack"),
            t("mn_b4", "q2", "q2", "b", null, null, "more extra b's"),
            t("mn_acc", "q2", "qa", "EOF", null, null, "EOF → accept (extra b's exist)"),
            t("mn_rj0", "q0", "qr", "EOF", null, null, "no b at all → reject"),
            t("mn_rj1", "q1", "qr", "EOF", null, null, "m = n → reject"),
        ],
        ["a", "b"]
    );
}
function buildAnBmN_lt() {
    return def(
        `aⁿbᵐ where m < n  (more a's than b's)`,
        ["q0", "q1", "qa", "qr"],
        "q0",
        ["qa"],
        ["qr"],
        [
            t("lt_pa", "q0", "q0", "a", null, "A", "a / push A"),
            t("lt_b", "q0", "q1", "b", "A", null, "b / pop A → q1"),
            t("lt_b2", "q1", "q1", "b", "A", null, "b / pop A"),
            t("lt_acc", "q1", "qa", "EOF", null, null, "EOF / stack non-empty → accept", { stackEmpty: false }),
            
            // FIX: Split the pure "a" string handling into two edge cases
            t("lt_acc0", "q0", "qa", "EOF", null, null, "no b's but n>0 → accept", { stackEmpty: false }),
            t("lt_rj0", "q0", "qr", "EOF", null, null, "empty string (m=n=0) → reject", { stackEmpty: true }),
            
            t("lt_rj1", "q1", "qr", "EOF", null, null, "stack empty (m=n) → reject", { stackEmpty: true }),
        ],
        ["a", "b"]
    );
}

function buildXnYn(x, y) {
    const sx = x.replace(/[^a-zA-Z0-9]/g, "_");
    const sy = y.replace(/[^a-zA-Z0-9]/g, "_");
    return def(
        `${x}ⁿ${y}ⁿ  { ${x}ⁿ${y}ⁿ | n ≥ 0 }`,
        ["q0", "q1", "qa", "qr"],
        "q0",
        ["qa"],
        ["qr"],
        [
            t(`${sx}_pa`, "q0", "q0", x, null, "X", `${x} / push X`),
            t(`${sx}_pop`, "q0", "q1", y, "X", null, `${y} / pop X → q1`),
            t(`${sx}_q1`, "q1", "q1", y, "X", null, `${y} / pop X`),
            t(`${sx}_acc0`, "q0", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t(`${sx}_acc1`, "q1", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
            t(`${sx}_rj0`, "q0", "qr", "EOF", null, null, "else → reject"),
            t(`${sx}_rj1`, "q1", "qr", "EOF", null, null, "else → reject"),
        ],
        [x, y]
    );
}

// ── Pattern recognition ───────────────────────────────────────────────────────

/**
 * recogniseLanguage(raw)
 * Returns { ok: true, def, label, alphabet, examples } on success
 * Returns { ok: false, error } on failure
 */
export function recogniseLanguage(raw) {
    const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");

    if (/^(wwr|w\^r|wwreverse|evenpalindrome|palindrome)$/.test(s)) {
        const d = buildWWR();
        return ok(d, ["abba", "aabbaa", "baab", "ab", "aab", "aba"]);
    }

    if (/^(wcwr|wcw\^r|centrepalindrome|centremarkpalindrome|markedpalindrome)$/.test(s)) {
        const d = buildWCWR();
        return ok(d, ["acba", "abcba", "aabcbaa", "ac", "abc", "abbc"]);
    }

    if (/^(anbn|a\^nb\^n|abn|anb\u207f)$/.test(s)) {
        const d = buildAnBn();
        return ok(d, ["ab", "aabb", "aaabbb", "aab", "abb", "ba"]);
    }

    if (/^(anb2n|a\^nb\^2n|anb2|an b2n)$/.test(s)) {
        const d = buildAnB2n();
        return ok(d, ["abb", "aabbbb", "aaabbbbbb", "ab", "abbb", "aab"]);
    }

    if (/^(a2nbn|a\^2nb\^n|a2n|2anbn)$/.test(s)) {
        const d = buildA2nBn();
        return ok(d, ["aab", "aaaabb", "aaaaaabb", "ab", "aaab", "ab"]);
    }

    if (/^(anbncn|a\^nb\^nc\^n|abc_notcfl|anbn cn)$/.test(s)) {
        const d = buildAnBnCn();
        return ok(d, ["abc", "aabbcc", "aaabbbccc"]);
    }

    if (/^(paren|parens|parentheses|balancedparen|balancedparens|\(\))$/.test(s)) {
        const d = buildParen();
        return ok(d, ["()", "(())", "(()())", "(", "())", "(()"]);
    }

    if (/^(braces|balancedbraces|\{\})$/.test(s)) {
        const d = buildBalancedBraces();
        return ok(d, ["{}", "{{}}", "{{}{}}", "{", "{}}", "{{}"]);
    }

    if (/^(m>n|moreb|anbm_gt|anbn_gt)$/.test(s)) {
        const d = buildAnBmN_gt();
        return ok(d, ["abb", "abbb", "aabbb", "ab", "aab", "b"]);
    }

    if (/^(m<n|morea|anbm_lt|anbn_lt)$/.test(s)) {
        const d = buildAnBmN_lt();
        return ok(d, ["aab", "aaab", "aaabb", "ab", "b", "aa"]);
    }

    // Pattern: a^n b^(k*n)
    const multMatch = s.match(/^a\^?n\s*b\^?\(?(\d+)n\)?$/) ||
        s.match(/^an\s*b(\d+)n$/) ||
        s.match(/^anb\^(\d+)n$/);
    if (multMatch) {
        const k = parseInt(multMatch[1], 10);
        if (k === 1) return { ok: true, ...ok(buildAnBn(), ["ab", "aabb", "aab", "ba"]) };
        if (k === 2) return { ok: true, ...ok(buildAnB2n(), ["abb", "aabbbb", "ab", "abbb"]) };
        const pushArr = Array(k).fill("A");
        const d = def(
            `aⁿb^(${k}n)  { aⁿb^(${k}n) | n ≥ 0 }`,
            ["q0", "q1", "qa", "qr"], "q0", ["qa"], ["qr"],
            [
                t("gm_pa", "q0", "q0", "a", null, pushArr, `a / push ${k} A's`),
                t("gm_1b", "q0", "q1", "b", "A", null, "b / pop A → q1"),
                t("gm_b", "q1", "q1", "b", "A", null, "b / pop A"),
                t("gm_acc0", "q0", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
                t("gm_acc1", "q1", "qa", "EOF", null, null, "EOF / empty → accept", { stackEmpty: true }),
                t("gm_rj0", "q0", "qr", "EOF", null, null, "else → reject"),
                t("gm_rj1", "q1", "qr", "EOF", null, null, "else → reject"),
            ],
            ["a", "b"]
        );
        return ok(d, [`a${"b".repeat(k)}`, `aa${"b".repeat(k * 2)}`, "ab", `a${"b".repeat(k + 1)}`]);
    }

    // Pattern: x^n y^n for arbitrary single chars
    const xyMatch = s.match(/^([a-z0-9])[\^n]*([a-z0-9])[\^n]*$/) ||
        s.match(/^([a-z0-9])\^n([a-z0-9])\^n$/) ||
        s.match(/^([a-z0-9])n([a-z0-9])n$/);
    if (xyMatch && xyMatch[1] !== xyMatch[2]) {
        const x = xyMatch[1], y = xyMatch[2];
        const d = buildXnYn(x, y);
        return ok(d, [x + y, x + x + y + y, x + x + x + y + y + y, x + x + y, x + y + y, y + x]);
    }

    return {
        ok: false,
        error: `Could not recognise "${raw}". Try: wwR, wcwR, anbn, anb2n, a2nbn, anbncn, paren, or xⁿyⁿ.`
    };
}

function ok(d, examples) {
    return {
        ok: true,
        def: d,
        label: d.name,
        alphabet: d._alphabet ?? ["a", "b"],
        examples,
    };
}

// ── Library ───────────────────────────────────────────────────────────────────

export const LANGUAGE_LIBRARY = [
    {
        group: "Classic CFLs",
        items: [
            { key: "anbn", label: "aⁿbⁿ", hint: "Push per a, pop per b" },
            { key: "anb2n", label: "aⁿb²ⁿ", hint: "Push 2 per a, pop per b" },
            { key: "a2nbn", label: "a²ⁿbⁿ", hint: "Push per 2 a's, pop per b" },
            { key: "paren", label: "Balanced ( )", hint: "Push on (, pop on )" },
            { key: "braces", label: "Balanced { }", hint: "Push on {, pop on }" },
        ]
    },
    {
        group: "Palindromes",
        items: [
            { key: "wwR", label: "wwᴿ  (even)", hint: "Push first half, pop second" },
            { key: "wcwR", label: "wcwᴿ  (marked)", hint: "Centre marker c splits the string" },
        ]
    },
    {
        group: "Inequality",
        items: [
            { key: "m>n", label: "aⁿbᵐ  (m > n)", hint: "More b's than a's" },
            { key: "m<n", label: "aⁿbᵐ  (m < n)", hint: "More a's than b's" },
        ]
    },
    {
        group: "Not Context-Free (demo)",
        items: [
            { key: "anbncn", label: "aⁿbⁿcⁿ", hint: "Impossible for any PDA — always rejects" },
        ]
    },
];