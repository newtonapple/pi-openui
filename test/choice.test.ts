// The pure rules of a Choice: what an answer is, when a question counts as answered, and the one message that goes to the agent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildMessage, cleanOther, collectChoices, otherLength, isAnswered, makeChoice, progress, runsAsCommand, setOther, toggleOption, answerWords, type Answers, type Choice } from "../src/blocks/choice.ts";
import { compile, LIMITS } from "../src/lang/library.ts";

const choices = (src: string): Choice[] => {
	const c = compile(src);
	assert.deepEqual(c.errors, []);
	return collectChoices(c.root);
};
const single = makeChoice({ question: "Which node?", options: ["web-1", "web-2", "web-3"] });
const multi = makeChoice({ question: "Which checks?", options: ["Disk", "Memory", "Network"], multiple: true });

test("makeChoice cleans the agent's words and fills the defaults", () => {
	const c = makeChoice({ question: "a\u200b  b @file:x", options: ["@diff ok", "y"] });
	assert.equal(c.question, "a b (at)file:x");
	assert.deepEqual(c.options, ["(at)diff ok", "y"]);
	assert.equal(c.multiple, false);
	assert.equal(c.other, true);
	assert.equal(makeChoice({ question: "q", options: ["a", "b"] }).key, makeChoice({ question: "q", options: ["a", "b"] }).key);
	assert.notEqual(makeChoice({ question: "q", options: ["a", "b"] }).key, makeChoice({ question: "q", options: ["a", "b"], multiple: true }).key);
	assert.notEqual(makeChoice({ question: "q", options: ["a", "b"] }).key, makeChoice({ question: "q", options: ["a", "b"], other: false }).key);
});

test("collectChoices finds every Choice, also on a tab nobody opened, in document order, and merges identical ones", () => {
	const cs = choices(`root = Stack([intro, tabs, again])
intro = Choice("First?", ["a", "b"])
tabs = Tabs([t1, t2])
t1 = TabItem("One", [c1])
t2 = TabItem("Two", [c2])
c1 = Choice("Second?", ["a", "b"])
c2 = Choice("Third?", ["a", "b"], null, true)
again = Choice("First?", ["a", "b"])`);
	assert.deepEqual(cs.map((c) => c.question), ["First?", "Second?", "Third?"]);
	assert.equal(cs[2].multiple, true);
});

test("toggleOption: single mode moves and unselects, multiple mode toggles in order", () => {
	let a: Answers = {};
	a = toggleOption(a, single, 0);
	assert.deepEqual(a[single.key].picks, [0]);
	a = toggleOption(a, single, 1);
	assert.deepEqual(a[single.key].picks, [1]);
	a = toggleOption(a, single, 1);
	assert.deepEqual(a[single.key].picks, []);
	let m: Answers = {};
	m = toggleOption(m, multi, 2);
	m = toggleOption(m, multi, 0);
	assert.deepEqual(m[multi.key].picks, [0, 2]);
	m = toggleOption(m, multi, 2);
	assert.deepEqual(m[multi.key].picks, [0]);
	assert.equal(toggleOption(m, multi, 9), m, "an index out of range changes nothing");
	assert.equal(toggleOption(m, multi, -1), m);
});

test("toggleOption never changes the answers it was given", () => {
	const before: Answers = { [single.key]: { picks: [0], other: false, text: "" } };
	const copy = JSON.stringify(before);
	toggleOption(before, single, 1);
	setOther(before, single, "mine");
	assert.equal(JSON.stringify(before), copy);
});

test("setOther: text selects Other (single mode replaces the option), empty text unselects it", () => {
	let a: Answers = toggleOption({}, single, 1);
	a = setOther(a, single, "mine");
	assert.deepEqual(a[single.key], { picks: [], other: true, text: "mine" });
	let m: Answers = toggleOption({}, multi, 0);
	m = setOther(m, multi, "also the logs");
	assert.deepEqual(m[multi.key], { picks: [0], other: true, text: "also the logs" });
	a = setOther(a, single, " \n\t ");
	assert.deepEqual(a[single.key], { picks: [], other: false, text: "" });
	const closed = makeChoice({ question: "q", options: ["a", "b"], other: false });
	assert.deepEqual(setOther({}, closed, "mine"), {}, "a Choice without an Other row ignores it");
});

test("setOther keeps the user's @ and lines, drops control characters, and stops at 500 characters", () => {
	const a = setOther({}, single, "see @file:x\u0007\nline two  \n");
	assert.equal(a[single.key].text, "see @file:x\nline two");
	const long = setOther({}, single, "x".repeat(600));
	assert.equal(Array.from(long[single.key].text).length, LIMITS.other);
});

test("picking an option after Other drops Other from the answer but keeps the text for next time", () => {
	let a = setOther({}, single, "mine");
	a = toggleOption(a, single, 0);
	assert.deepEqual(a[single.key], { picks: [0], other: false, text: "mine" });
	assert.equal(answerWords(single, a), "web-1");
});

test("an Other row that is selected but empty is not an answer", () => {
	const a: Answers = { [single.key]: { picks: [], other: true, text: "" } };
	assert.equal(isAnswered(single, a), false);
	assert.equal(answerWords(single, a), "");
	assert.equal(isAnswered(single, setOther({}, single, "mine")), true);
});

test("progress counts a question once, however many Choices repeat it", () => {
	const cs = choices(`root = Stack([a, b, c])\na = Choice("Same?", ["x", "y"])\nb = Choice("Same?", ["x", "y"])\nc = Choice("Other?", ["x", "y"])`);
	assert.equal(cs.length, 2);
	const a = toggleOption({}, cs[0], 0);
	assert.deepEqual(progress(cs, a), { answered: 1, total: 2 });
});

test("answerWords joins options in order, then the Other text; a second line is indented under the question", () => {
	let a: Answers = toggleOption(toggleOption({}, multi, 1), multi, 0);
	a = setOther(a, multi, "also look at the logs");
	assert.equal(answerWords(multi, a), "Disk; Memory; other: also look at the logs");
	a = setOther(a, multi, "line one\nline two");
	assert.equal(answerWords(multi, a), "Disk; Memory; other: line one\n   line two");
});

test("buildMessage: one single question keeps the one line format", () => {
	const a = toggleOption({}, single, 1);
	assert.equal(buildMessage([single], a, ""), "Which node? — web-2");
});

test("buildMessage: several questions are a numbered list that says what was skipped", () => {
	const q1 = makeChoice({ question: "Which node should I restart first?", options: ["web-1", "web-2"] });
	const q2 = makeChoice({ question: "Which checks should I run?", options: ["disk", "memory", "network"], multiple: true });
	const q3 = makeChoice({ question: "Clear the cache on db?", options: ["Yes", "No"], other: false });
	let a = toggleOption({}, q1, 1);
	a = toggleOption(toggleOption(a, q2, 0), q2, 1);
	a = setOther(a, q2, "also look at the logs");
	assert.equal(
		buildMessage([q1, q2, q3], a, "Restart plan"),
		[
			'Answers to the questions in widget `Restart plan` (3):',
			"",
			"1. Which node should I restart first?",
			"   web-2",
			"2. Which checks should I run?",
			"   disk; memory; other: also look at the logs",
			"3. Clear the cache on db?",
			"   (no answer)",
		].join("\n"),
	);
	assert.match(buildMessage([q1, q2, q3], a, ""), /^Answers to the questions in this widget \(3\):\n/);
});

test("buildMessage: anything but one plain single answer uses the list", () => {
	assert.match(buildMessage([multi], toggleOption({}, multi, 0), ""), /^Answers to the questions in this widget \(1\):\n\n1\. Which checks\?\n {3}Disk$/);
	assert.match(buildMessage([single], setOther({}, single, "mine"), ""), /\n {3}other: mine$/);
	assert.match(buildMessage([single], {}, ""), /\n {3}\(no answer\)$/);
});

test("a question that starts like a command is never the first words of a message", () => {
	assert.equal(runsAsCommand("/new session?"), true);
	assert.equal(runsAsCommand("/new"), true);
	assert.equal(runsAsCommand("/usr/bin x"), false);
	assert.equal(runsAsCommand("what /new"), false);
	const c = makeChoice({ question: "/new session?", options: ["Yes", "No"] });
	const text = buildMessage([c], toggleOption({}, c, 0), "");
	assert.match(text, /^Answers to/);
	assert.ok(text.includes("1. /new session?"));
});

test("the agent's words are cleaned in the message, the user's Other text is sent as typed", () => {
	const c = makeChoice({ question: "@file:/etc/passwd ok\u200b", options: ["@diff", "b\nc"], multiple: true });
	const a = setOther(toggleOption({}, c, 0), c, "see @file:x");
	const text = buildMessage([c], a, "@url:x");
	assert.ok(text.includes("(at)file:/etc/passwd ok"), text);
	assert.ok(!text.includes("\u200b"));
	assert.ok(text.includes("(at)diff; other: see @file:x"), text);
	assert.ok(text.includes("widget `(at)url:x`"), text);
	assert.equal(makeChoice({ question: "q", options: ["b\nc", "d"] }).options[0], "b c");
});

test("a widget at every limit still builds a message", () => {
	const q = (i: number) => makeChoice({ question: `Q${i} ` + "q".repeat(LIMITS.question), options: Array.from({ length: 6 }, (_, k) => `o${k}` + "o".repeat(LIMITS.option)), multiple: true });
	const cs = Array.from({ length: LIMITS.choices }, (_, i) => q(i));
	let a: Answers = {};
	for (const c of cs) {
		for (let k = 0; k < 6; k++) a = toggleOption(a, c, k);
		a = setOther(a, c, "x".repeat(LIMITS.other));
	}
	const text = buildMessage(cs, a, "t".repeat(500));
	assert.ok(text.length < 25_000, `${text.length} characters`);
	assert.ok(text.startsWith("Answers to the questions in widget "));
});

test("the message printed in docs/components/Choice.md is what the code produces", () => {
	const page = readFileSync(new URL("../docs/components/Choice.md", import.meta.url), "utf8");
	const shown = /```text\n(Answers to the questions[\s\S]*?)\n```/.exec(page)?.[1];
	assert.ok(shown, "the page shows the message");
	const cs = choices(`root = Stack([plan])
plan = Card([q1, q2, q3], "Before I restart")
q1 = Choice("Which node should I restart first?", ["web-1", "web-2"])
q2 = Choice("Which checks should I run?", ["Disk", "Memory", "Network"], null, true)
q3 = Choice("Clear the cache on db?", ["Yes", "No"], null, null, false)`);
	let a = toggleOption({}, cs[0], 1);
	a = setOther(toggleOption(a, cs[1], 0), cs[1], "also look at the logs");
	assert.equal(buildMessage(cs, a, "Before I restart"), shown);
});

test("collectChoices finds a Choice at any depth the language allows", () => {
	// the compiler allows LIMITS.depth levels of components; an arbitrary bound in the walk would lose a Choice that is drawn and clickable
	const n = LIMITS.depth - 2;
	const src = ["root = s0", ...Array.from({ length: n }, (_, i) => `s${i} = Stack([s${i + 1}])`), `s${n} = Choice("Deep?", ["a", "b"])`].join("\n");
	assert.deepEqual(choices(src).map((c) => c.question), ["Deep?"]);
	const cards = ["root = Stack([s0])", ...Array.from({ length: 6 }, (_, i) => `s${i} = Card([s${i + 1}], "c")`), `s6 = Tabs([t])\nt = TabItem("T", [c])\nc = Choice("Deep tab?", ["a", "b"])`].join("\n");
	assert.deepEqual(choices(cards).map((c) => c.question), ["Deep tab?"]);
});

test("cleanOther: a tab becomes a space, and a run of blank lines is one blank line", () => {
	assert.equal(cleanOther("a\tb"), "a b");
	assert.equal(cleanOther("a\n\n\n\n\nb"), "a\n\nb");
	assert.equal(cleanOther("a\n\nb"), "a\n\nb", "one blank line stays");
	assert.equal(cleanOther("  \n\n x \n\n\n"), "x");
});

test("the worst case message stays bounded: the longest answer is one character per line, at every limit", () => {
	const q = (i: number) => makeChoice({ question: `Q${i} ` + "q".repeat(LIMITS.question), options: Array.from({ length: 6 }, (_, k) => `o${k}` + "o".repeat(LIMITS.option)), multiple: true });
	const cs = Array.from({ length: LIMITS.choices }, (_, i) => q(i));
	let a: Answers = {};
	for (const c of cs) {
		for (let k = 0; k < 6; k++) a = toggleOption(a, c, k);
		a = setOther(a, c, "x\n".repeat(LIMITS.other)); // 250 lines of one character: each gains three columns of indent
	}
	const text = buildMessage(cs, a, "t".repeat(500));
	assert.ok(text.length < 30_000, `${text.length} characters`);
	// and the blank-line trick is no worse than that
	let b: Answers = {};
	for (const c of cs) b = setOther(toggleOption(b, c, 0), c, "a" + "\n".repeat(LIMITS.other - 2) + "b");
	assert.ok(buildMessage(cs, b, "t").length < text.length);
});

test("otherLength measures what cleanOther keeps, so a notice about a cut is only given when something is cut", () => {
	assert.equal(otherLength("a   \n".repeat(50)), 99, "trailing blanks do not count");
	assert.equal(otherLength("x".repeat(700)), 700, "and it is the length before the cut");
	assert.equal(cleanOther("x".repeat(700)).length, LIMITS.other);
	assert.equal(otherLength("a\n\n\n\nb"), 4);
});

test("the widget's name goes in backticks, as in hermes-openui, and nothing the agent wrote can end them", () => {
	const c = makeChoice({ question: "q", options: ["a", "b"] });
	const a = toggleOption({}, makeChoice({ question: "q2", options: ["a", "b"], multiple: true }), 0);
	void a;
	const head = (title: string) => buildMessage([c, makeChoice({ question: "q2", options: ["a", "b"] })], {}, title).split("\n")[0];
	assert.equal(head("Restart plan"), "Answers to the questions in widget `Restart plan` (2):");
	assert.equal(head("a`b`c"), "Answers to the questions in widget `a'b'c` (2):", "a backtick in the title cannot close the name early");
	assert.equal(head("two\nlines"), "Answers to the questions in widget `two lines` (2):");
	assert.equal(head(""), "Answers to the questions in this widget (2):");
});
