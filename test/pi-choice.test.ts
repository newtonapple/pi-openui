// A Choice through the pi component: the Other row opens pi's editor, answers are staged until Send answers, and the rules that
// keep the user in control (the editor owns its keys, typing returns the keyboard to pi, a sent widget is final).
import assert from "node:assert/strict";
import { test } from "node:test";
import { collectChoices } from "../src/blocks/choice.ts";
import { compile } from "../src/lang/library.ts";
import { textWidth } from "../src/diagram/canvas.ts";
import { sample, setup, skip, strip } from "./pi-setup.ts";

const ENTER = "\r";
const DOWN = "\x1b[B";
const TAB = "\t";
const flush = () => new Promise((r) => setTimeout(r, 0));
const text = (widget: any, width = 100) => strip(widget.render(width).join("\n"));
const ONE = `root = Stack([c])\nc = Choice("Which checks should I run?", ["Disk", "Memory"], null, true)`;
const SINGLE = `root = Stack([c])\nc = Choice("Which node?", ["web-1", "web-2"])`;

/** The editor, as a person would use it: it answers with what the test says next, and records what it was asked. */
function editor(w: any) {
	const asked: Array<{ title: string; initial: string }> = [];
	const answers: Array<string | undefined> = [];
	w.hooks.prompt = async (title: string, initial: string) => {
		asked.push({ title, initial });
		return answers.shift();
	};
	return { asked, answers };
}
/** Click Other, let the editor answer, then draw a frame (which is what refreshes the targets the next event is aimed at). */
async function typeOther(widget: any, find: any, click: any, ed: any, answer: string | undefined) {
	ed.answers.push(answer);
	click(widget, find(widget, (t: any) => t.choice?.index === "other"));
	await flush();
	widget.render(100);
}
const send = (widget: any, find: any, click: any) => {
	widget.render(100);
	click(widget, find(widget, (t: any) => t.kind === "send"));
};

test("Other: the text typed in pi's editor shows under the row, counts as an answer and goes out in the message", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	const ed = editor(w);
	const widget = make(ONE, "live");
	widget.render(100);
	await typeOther(widget, find, click, ed, "also the logs");
	const shown = text(widget);
	assert.ok(shown.includes("[✓] Other...") && shown.includes("also the logs"), shown);
	assert.ok(shown.includes("1 of 1 answered"));
	assert.equal(ed.asked.length, 1);
	assert.ok(ed.asked[0].title.includes("Which checks should I run?"), ed.asked[0].title);
	send(widget, find, click);
	assert.deepEqual(sent, ["Answers to the questions in this widget (1):\n\n1. Which checks should I run?\n   other: also the logs"]);
});

test("Other: Esc (undefined) changes nothing, empty text unselects, and the editor starts with what was saved", { skip }, async () => {
	const { make, w, click, find } = await setup();
	const ed = editor(w);
	const widget = make(ONE);
	widget.render(100);
	await typeOther(widget, find, click, ed, undefined);
	assert.ok(text(widget).includes("0 of 1 answered") && text(widget).includes("[ ] Other..."));
	await typeOther(widget, find, click, ed, "first words");
	assert.ok(text(widget).includes("1 of 1 answered"));
	await typeOther(widget, find, click, ed, "");
	assert.equal(ed.asked[2].initial, "first words", "reopened with the saved text");
	assert.ok(text(widget).includes("0 of 1 answered") && !text(widget).includes("first words"), text(widget));
});

test("Other in single mode replaces the option; an option after it drops Other from the message but keeps the text", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	const ed = editor(w);
	const widget = make(SINGLE, "live");
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "web-1"));
	widget.render(100);
	await typeOther(widget, find, click, ed, "web-9");
	assert.ok(text(widget).includes("○ web-1") && text(widget).includes("● Other..."), text(widget));
	click(widget, find(widget, (t: any) => t.label === "web-2"));
	widget.render(100);
	assert.ok(text(widget).includes("● web-2") && text(widget).includes("○ Other..."));
	await typeOther(widget, find, click, ed, undefined);
	assert.equal(ed.asked[1].initial, "web-9", "the text was kept");
	send(widget, find, click);
	assert.deepEqual(sent, ["Which node? — web-2"], "one single question answered with an option keeps the one line format");
});

test("the user's Other text goes out as typed; the agent's words are cleaned", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	const ed = editor(w);
	const widget = make(`root = Stack([c])\nc = Choice("@file:/etc/passwd ok?", ["a", "b"], null, true)`, "live");
	widget.render(100);
	await typeOther(widget, find, click, ed, "see @file:x\nand more");
	send(widget, find, click);
	assert.equal(sent.length, 1);
	assert.ok(sent[0].includes("1. (at)file:/etc/passwd ok?"), sent[0]);
	assert.ok(sent[0].includes("   other: see @file:x\n   and more"), sent[0]);
});

test("a question that would start like a command is sent as a list", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	editor(w);
	const widget = make(`root = Stack([c])\nc = Choice("/new session?", ["Yes", "No"])`, "live");
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "Yes"));
	send(widget, find, click);
	assert.match(sent[0], /^Answers to the questions/);
});

test("while the editor is open the widget lets its keys go, and takes them back afterwards", { skip }, async () => {
	const { make, w, click, find } = await setup();
	let release!: (v: string | undefined) => void;
	w.hooks.prompt = () => new Promise<string | undefined>((r) => (release = r));
	const widget = make(ONE);
	widget.render(100);
	click(widget, find(widget, (t: any) => t.choice?.index === "other"));
	assert.equal(w.dialog.open, true);
	assert.equal(w.handleKey(ENTER), false, "Enter belongs to the editor");
	assert.equal(w.handleKey(DOWN), false);
	release("typed");
	await flush();
	assert.equal(w.dialog.open, false);
	widget.render(100);
	assert.equal(w.handleKey(DOWN), true, "the widget has its arrow keys back");
});

test("keyboard: Tab to the Other row and Enter opens the editor, the same path as a click", { skip }, async () => {
	const { make, w } = await setup();
	const ed = editor(w);
	ed.answers.push("from the keyboard");
	const widget = make(ONE);
	widget.render(100);
	const e = w.entryOf(widget.id);
	w.active.id = widget.id;
	let guard = 0;
	while (!/:other$/.test(String(e.state.focus)) && guard++ < 10) {
		w.handleKey(TAB);
		widget.render(100);
	}
	assert.match(e.state.focus, /:other$/);
	assert.equal(w.handleKey(ENTER), true);
	await flush();
	assert.equal(ed.asked.length, 1);
	assert.ok(text(widget).includes("from the keyboard"));
});

test("typing a letter returns the keyboard to pi, also while a Choice is focused", { skip }, async () => {
	const { make, w } = await setup();
	editor(w);
	const widget = make(ONE);
	widget.render(100);
	w.armNewest();
	assert.equal(w.active.id, widget.id);
	assert.equal(w.handleKey("a"), false, "the letter goes to pi's editor");
	assert.equal(w.active.id, null, "the widget is no longer armed");
	assert.equal(w.handleKey(ENTER), false, "so Enter sends the user's message, not a Choice");
});

test("after Send the Other row does nothing, and in notes mode neither does it", { skip }, async () => {
	const { make, w, click, find } = await setup();
	const ed = editor(w);
	const widget = make(ONE);
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "Disk"));
	const other = find(widget, (t: any) => t.choice?.index === "other");
	// the coordinates reach the Other row while it is live: the editor opens (and Esc leaves things as they were)
	ed.answers.push(undefined);
	widget.handleMouse({ type: "click", button: "left", x: 2 + other.rect.x + 1, y: other.rect.y });
	await flush();
	assert.equal(ed.asked.length, 1, "control: a click at these coordinates opens the editor");
	ed.asked.length = 0;
	w.toggleNotesNewest();
	widget.render(100);
	widget.handleMouse({ type: "click", button: "left", x: 2 + other.rect.x + 1, y: other.rect.y });
	await flush();
	assert.equal(ed.asked.length, 0, "notes mode: the click is for notes");
	w.toggleNotesNewest();
	send(widget, find, click);
	widget.render(100);
	assert.ok(!widget.lastBlock().targets.some((t: any) => t.kind === "choice"), "sent: no Choice answers any more");
	widget.handleMouse({ type: "click", button: "left", x: 2 + other.rect.x + 1, y: other.rect.y });
	await flush();
	assert.equal(ed.asked.length, 0, "sent: a click where the Other row was opens nothing");
	assert.equal(w.handleKey(ENTER), false, "and Enter is left to pi, so it sends the user's message");
});

test("an answer over 500 characters is cut and the widget says so", { skip }, async () => {
	const { make, w, click, find } = await setup();
	const ed = editor(w);
	const widget = make(ONE);
	widget.render(100);
	await typeOther(widget, find, click, ed, "x".repeat(700));
	const e = w.entryOf(widget.id);
	assert.match(e.notice, /shortened to 500 characters/);
	const key = Object.keys(e.state.answers)[0];
	assert.equal(Array.from(e.state.answers[key].text).length, 500);
});

test("old widgets keep working: a Choice written for the one click behaviour gets the bar and an Other row", { skip }, async () => {
	const { make } = await setup();
	const widget = make(sample("interactive"));
	const shown = text(widget);
	assert.ok(shown.includes("Other...") && shown.includes("0 of 1 answered") && shown.includes("[ Send answers ]"), shown);
});

test("the model is told that Choice answers arrive together, after Send answers", { skip }, async () => {
	await setup(); // registers pi's modules
	const { default: extension } = await import("../src/pi/extension.ts");
	let tool: any;
	extension({ registerTool: (t: any) => (tool = t), registerMessageRenderer() {}, registerCommand() {}, on() {} } as any);
	assert.match(tool.description, /Send answers/);
	assert.match(tool.description, /Button click sends its text/);
	assert.ok(!/Clicking a Button or Choice sends/.test(tool.description), "the old promise is gone");
	const last = tool.promptGuidelines.find((g: string) => /Choice/.test(g));
	assert.match(last, /ONE message/);
	assert.match(last, /one widget/);
});

test("the choice-card sample has a single, a multiple and a closed question", () => {
	const src = sample("choice-card");
	const c = compile(src);
	assert.deepEqual(c.errors, []);
	const qs = collectChoices(c.root);
	assert.deepEqual(qs.map((q) => [q.multiple, q.other]), [[false, true], [true, true], [false, false]]);
});

test("after Send the widget lets go of the keyboard, and Enter is pi's again", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	const widget = make(sample("interactive"), "live");
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "llama-3.3-70b"));
	send(widget, find, click);
	widget.render(100);
	assert.equal(sent.length, 1);
	assert.equal(w.active.id, null, "a locked widget has nothing to hold the keyboard for");
	assert.equal(w.handleKey(ENTER), false, "Enter goes to pi's editor");
	assert.equal(sent.length, 1, "and presses no button of the widget");
});

test("after Clear the focus moves to the first option; a stale focus never fires another element", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	const widget = make(sample("interactive"), "live");
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "llama-3.3-70b"));
	widget.render(100);
	click(widget, find(widget, (t: any) => t.kind === "clear"));
	widget.render(100);
	const e = w.entryOf(widget.id);
	assert.match(e.state.focus, /^choice:/, "the Clear button is gone, so the focus is on the first option");
	assert.equal(w.handleKey(ENTER), true);
	assert.deepEqual(sent, [], "no button of the widget was pressed");
	// a focus that points at nothing (anything can remove its target) is dropped, and Enter does nothing
	e.state.focus = "choice:gone:9";
	widget.render(100);
	assert.equal(w.handleKey(ENTER), true);
	assert.equal(e.state.focus, null);
	assert.deepEqual(sent, []);
});

test("an editor that fails to open leaves the widget as it was and says so", { skip }, async () => {
	const { make, w, click, find } = await setup();
	w.hooks.prompt = async () => {
		throw new Error("stale ctx");
	};
	const widget = make(ONE);
	widget.render(100);
	click(widget, find(widget, (t: any) => t.choice?.index === "other"));
	await flush();
	await flush();
	assert.equal(w.dialog.open, false, "the editor flag is released");
	assert.match(w.entryOf(widget.id).notice, /could not be opened/);
	assert.ok(text(widget).includes("0 of 1 answered"));
});

test("answers that went out while the editor was open are not changed by it", { skip }, async () => {
	const { make, w, click, find } = await setup();
	let release!: (v: string | undefined) => void;
	w.hooks.prompt = () => new Promise<string | undefined>((r) => (release = r));
	const widget = make(ONE);
	widget.render(100);
	click(widget, find(widget, (t: any) => t.choice?.index === "other"));
	w.entryOf(widget.id).state.sent = true; // nothing can do this through the UI while the editor is open; the guard is defence
	release("late");
	await flush();
	assert.deepEqual(w.entryOf(widget.id).state.answers, {});
});

test("two widgets on screen keep their own answers; sending one does not lock the other", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	editor(w);
	const a = make(SINGLE, "live");
	const b = make(SINGLE, "live");
	a.render(100);
	b.render(100);
	click(a, find(a, (t: any) => t.label === "web-1"));
	click(b, find(b, (t: any) => t.label === "web-2"));
	a.render(100);
	b.render(100);
	assert.ok(text(a).includes("● web-1") && text(a).includes("○ web-2"));
	assert.ok(text(b).includes("● web-2") && text(b).includes("○ web-1"));
	send(a, find, click);
	b.render(100);
	assert.deepEqual(sent, ["Which node? — web-1"]);
	assert.ok(text(a).includes("Sent to the agent."));
	assert.ok(text(b).includes("1 of 1 answered") && !text(b).includes("Sent to the agent."), "the other widget is still open");
	send(b, find, click);
	assert.deepEqual(sent, ["Which node? — web-1", "Which node? — web-2"]);
});

test("the notice about a cut answer is given only when something is cut", { skip }, async () => {
	const { make, w, click, find } = await setup();
	const ed = editor(w);
	const widget = make(ONE);
	widget.render(100);
	await typeOther(widget, find, click, ed, ("a" + " ".repeat(12) + "\n").repeat(50)); // 650 characters typed, 99 kept
	assert.equal(w.entryOf(widget.id).notice, null, "nothing was cut, so nothing is said");
});

// ---------- delivery: the widget says "Sent" only when pi has taken the message ----------

/** A pi that has not (yet) taken the message: it neither confirms nor fails out loud, as with no model selected. */
function silentPi(w: any, sent: string[], deliveryMs = 20) {
	w.hooks.sendLive = (t: string) => void sent.push(t);
	w.hooks.deliveryMs = deliveryMs;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("Send: the widget says Sending until pi confirms the message, then Sent", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	silentPi(w, sent, 5000);
	const widget = make(SINGLE, "live");
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "web-1"));
	send(widget, find, click);
	widget.render(100);
	assert.deepEqual(sent, ["Which node? — web-1"]);
	assert.ok(text(widget).includes("Sending to the agent") && !text(widget).includes("Sent to the agent."), text(widget));
	assert.ok(!widget.lastBlock().targets.some((t: any) => t.kind === "choice" || t.kind === "send"), "it is locked while it waits, so it cannot be sent twice");
	assert.equal(w.confirmDelivery("something else"), false, "another message is not this one");
	assert.equal(w.confirmDelivery("  Which node? — web-1\n"), true, "pi's copy of the text is compared without its edges");
	assert.ok(text(widget).includes("Sent to the agent.") && !text(widget).includes("Sending"));
});

test("Send: a pi that never takes the message gives the widget back, with the answers and a reason", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	silentPi(w, sent);
	const widget = make(SINGLE, "live");
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "web-1"));
	send(widget, find, click);
	await wait(80);
	widget.render(100);
	const shown = text(widget);
	assert.ok(shown.includes("● web-1") && shown.includes("1 of 1 answered") && !shown.includes("Sent to the agent."), shown);
	const notice = w.entryOf(widget.id).notice;
	assert.match(notice, /did not take the answers.*Send again/s);
	assert.ok(textWidth(notice) <= 70, `the notice fits one footer line of a narrow terminal (${textWidth(notice)} columns): it was cut off mid-word in a real pi`);
	assert.ok(widget.lastBlock().targets.some((t: any) => t.kind === "send"), "Send answers works again");
	// fix whatever was wrong, press it again: the same answers go out, and this time pi confirms
	w.hooks.sendLive = (t: string) => {
		sent.push(t);
		w.confirmDelivery(t);
	};
	send(widget, find, click);
	assert.deepEqual(sent, ["Which node? — web-1", "Which node? — web-1"]);
	assert.ok(text(widget).includes("Sent to the agent."));
});

test("Send: a message pi is holding for the end of the agent's turn is waited for, not given up on", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	silentPi(w, sent);
	w.hooks.queued = () => true; // pi has it queued as a follow-up: the agent is still busy
	const widget = make(SINGLE, "live");
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "web-1"));
	send(widget, find, click);
	await wait(100);
	widget.render(100);
	assert.ok(text(widget).includes("Sending to the agent"), "still waiting after five check intervals");
	assert.equal(w.entryOf(widget.id).notice, null);
	w.confirmDelivery("Which node? — web-1"); // the turn ended and pi delivered it
	assert.ok(text(widget).includes("Sent to the agent."));
});

test("Send: gallery widgets and Buttons do not wait for a confirmation", { skip }, async () => {
	const { make, w, click, find, sent, echoed } = await setup();
	silentPi(w, sent, 5000);
	const echo = make(SINGLE, "echo");
	echo.render(100);
	click(echo, find(echo, (t: any) => t.label === "web-1"));
	send(echo, find, click);
	assert.deepEqual(echoed, ["Which node? — web-1"]);
	assert.ok(text(echo).includes("Sent to the agent."), "a local echo is delivered when it is shown");
	const live = make(`root = Stack([b])\nb = Button("Go", @ToAssistant("go now"))`, "live");
	live.render(100);
	click(live, find(live, (t: any) => t.kind === "button"));
	assert.deepEqual(sent, ["go now"]);
	assert.equal(w.entryOf(live.id).pending, null, "a Button has nothing to lock, so nothing to wait for");
});

test("Send: two widgets that send the same words are confirmed one message at a time", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	silentPi(w, sent, 5000);
	const a = make(SINGLE, "live");
	const b = make(SINGLE, "live");
	for (const x of [a, b]) {
		x.render(100);
		click(x, find(x, (t: any) => t.label === "web-1"));
		send(x, find, click);
	}
	assert.equal(w.confirmDelivery("Which node? — web-1"), true);
	assert.ok(text(a).includes("Sent to the agent.") && text(b).includes("Sending to the agent"), "one message confirms one widget");
	assert.equal(w.confirmDelivery("Which node? — web-1"), true);
	assert.ok(text(b).includes("Sent to the agent."));
	assert.equal(w.confirmDelivery("Which node? — web-1"), false, "nothing is left waiting");
});

test("Send: dropping the session's state also drops what a widget was waiting for", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	silentPi(w, sent, 20);
	const widget = make(SINGLE, "live");
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "web-1"));
	send(widget, find, click);
	w.resetAll();
	await wait(60);
	assert.equal(w.entryOf(widget.id), undefined, "no timer brought the widget's state back");
});

test("the extension confirms a message when pi reports it as a user message, and tells the widget whether pi is holding messages", { skip }, async () => {
	const { make, w, click, find, sent } = await setup();
	const { default: extension } = await import("../src/pi/extension.ts");
	const handlers: Record<string, Function> = {};
	extension({ registerTool() {}, registerMessageRenderer() {}, registerCommand() {}, on: (n: string, h: Function) => void (handlers[n] = h) } as any);
	silentPi(w, sent, 5000);
	const widget = make(SINGLE, "live");
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "web-1"));
	send(widget, find, click);
	await handlers.message_start({ type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "Which node? — web-1" }] } });
	assert.ok(text(widget).includes("Sending to the agent"), "only a user message counts");
	await handlers.message_start({ type: "message_start", message: { role: "user", content: [{ type: "text", text: "Which node? — " }, { type: "text", text: "web-1" }] } });
	assert.ok(!text(widget).includes("Sending to the agent"), "a user message with the words confirms it");
	let holding = true;
	await handlers.session_start({}, { hasUI: true, ui: { onTerminalInput: () => () => {}, editor() {}, pasteToEditor() {}, setWidget() {} }, hasPendingMessages: () => holding });
	assert.equal(w.hooks.queued(), true);
	holding = false;
	assert.equal(w.hooks.queued(), false);
});
