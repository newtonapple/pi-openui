// Notes through the pi component: the chip, notes mode, the editor, pins and the tray, the message, the keyboard, and the rules
// that keep the user in control (nothing is sent, typing returns the keyboard to pi, an open editor owns its keys).
import assert from "node:assert/strict";
import { test } from "node:test";
import { NOTE_LIMITS } from "../src/blocks/notes.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";
import { sample, setup, skip, strip } from "./pi-setup.ts";

const ENTER = "\r";
const SHIFT_ENTER = "\x1b[13;2u";
const DOWN = "\x1b[B";
const RIGHT = "\x1b[C";
const DELETE = "\x1b[3~";
const flush = () => new Promise((r) => setTimeout(r, 0));
const text = (widget: any, width = 100) => strip(widget.render(width).join("\n"));

/** The editor, as a person would use it: it answers with what the test says next, and records what it was asked. */
function editor(w: any) {
	const asked: Array<{ title: string; initial: string }> = [];
	const answers: Array<string | undefined> = [];
	w.hooks.prompt = async (title: string, initial: string) => {
		asked.push({ title, initial });
		return answers.shift();
	};
	const message: string[] = [];
	w.hooks.toEditor = (t: string) => message.push(t);
	return { asked, answers, message };
}
const item = (find: any, widget: any, key: string, type?: string) => find(widget, (t: any) => t.kind === "item" && t.item.key === key && (!type || t.item.type === type));
/** What pi does after any event: it draws a frame, which is also what refreshes the targets the next event is aimed at. */
const frame = (widget: any, width = 100) => widget.render(width);
/** Activate a specific target the way Enter does: aim at it, not at whatever is under its middle. */
function perform(w: any, widget: any, target: any) {
	w.entryOf(widget.id).state.focus = target.id;
	w.active.id = widget.id;
	w.handleKey(ENTER);
}
/** Click an item the way a person would (the most specific thing under the pointer), let the editor answer, then draw. */
async function writeOn(widget: any, ed: any, target: any, answer: string | undefined, shift = false) {
	ed.answers.push(answer);
	widget.handleMouse({ type: "click", button: "left", shift, x: 2 + target.rect.x + Math.floor(target.rect.w / 2), y: target.rect.y });
	await flush();
	frame(widget);
}

test("the notes chip: there when something can carry a note, absent when nothing can, and it says what mode you are in", { skip }, async () => {
	const { make, w } = await setup();
	editor(w);
	const table = make(sample("table"));
	assert.match(text(table).split("\n").at(-1)!, /\[ notes \]$/);
	w.toggleNotesNewest();
	assert.match(text(table).split("\n").at(-1)!, /\[ notes: on \]$/);
	w.toggleNotesNewest();
	assert.match(text(table).split("\n").at(-1)!, /\[ notes \]$/);
	const actions = make(`root = Stack([b, c])\nb = Button("Go")\nc = Choice("Q?", ["a", "b"])`);
	assert.ok(!text(actions).includes("[ notes"), "a widget of buttons has nothing to note, so no chip");
});

test("click the chip to turn notes mode on, click it again or press Esc to leave", { skip }, async () => {
	const { make, w, click, find } = await setup();
	editor(w);
	const widget = make(sample("table"));
	widget.render(100);
	click(widget, find(widget, (t: any) => t.kind === "notes"));
	assert.equal(w.entryOf(widget.id).state.noteMode, true);
	assert.equal(w.active.id, widget.id, "the widget has the keyboard");
	click(widget, find(widget, (t: any) => t.kind === "notes"));
	assert.equal(w.entryOf(widget.id).state.noteMode, false);
	w.toggleNotesNewest();
	assert.equal(w.handleKey("\x1b"), true);
	assert.equal(w.entryOf(widget.id).state.noteMode, false, "Esc leaves notes mode");
});

test("click an element in notes mode: the editor opens on it, the note is pinned and listed", { skip }, async () => {
	const { make, w, click, find } = await setup();
	const ed = editor(w);
	const widget = make(sample("table"));
	w.toggleNotesNewest();
	widget.render(100);
	await writeOn(widget, ed, item(find, widget, "cell:3.State"), "why did this reboot?");
	assert.deepEqual(ed.asked.map((a) => a.title), ["Note on Table > row 3, State"]);
	assert.equal(ed.asked[0].initial, "");
	const e = w.entryOf(widget.id);
	assert.equal(e.state.notes.length, 1);
	assert.equal(e.state.notes[0].text, "why did this reboot?");
	const out = text(widget);
	assert.ok(out.includes("Notes (1)"), "the tray");
	assert.ok(out.includes("why did this reboot?"), "with the note in it");
	assert.ok(out.includes("[ Add 1 note to your message ]") && out.includes("[ Clear ]"), "and the two buttons");
	const line = out.split("\n").find((l) => l.includes("spark-3"))!;
	assert.ok(line.includes("│1draining"), `the cell carries the pin, in the blank cell before its text: ${line}`);
	assert.equal(w.entryOf(widget.id).state.noteMode, true, "still in notes mode for the next one");
	// Shift+click picks what holds the thing under the pointer: the row instead of its cell
	await writeOn(widget, ed, item(find, widget, "cell:2.State"), "the whole row", true);
	assert.equal(ed.asked.at(-1)!.title, "Note on Table > row 2");
	assert.deepEqual(w.entryOf(widget.id).state.notes.map((n: any) => n.info.key), ["cell:3.State", "row:2"]);
});

test("cancelling saves nothing; editing prefills the note; saving it empty removes it", { skip }, async () => {
	const { make, w, click, find } = await setup();
	const ed = editor(w);
	const widget = make(sample("table"));
	w.toggleNotesNewest();
	widget.render(100);
	await writeOn(widget, ed, item(find, widget, "col:State"), undefined);
	assert.equal(w.entryOf(widget.id).state.notes.length, 0, "cancelled");
	assert.equal(w.dialog.open, false, "the dialog is closed again");
	await writeOn(widget, ed, item(find, widget, "col:State"), "first");
	await writeOn(widget, ed, item(find, widget, "col:State"), "second");
	assert.equal(ed.asked.at(-1)!.initial, "first", "the same element opens its note for editing");
	assert.match(ed.asked.at(-1)!.title, /\(editing\)$/);
	assert.equal(w.entryOf(widget.id).state.notes.length, 1, "one note, not two");
	assert.equal(w.entryOf(widget.id).state.notes[0].text, "second");
	await writeOn(widget, ed, item(find, widget, "col:State"), "   \n  ");
	assert.equal(w.entryOf(widget.id).state.notes.length, 0, "an empty note removes it");
});

test("Add to message puts the notes in pi's message box, sends nothing, and leaves notes mode", { skip }, async () => {
	const { make, w, click, find, sent, echoed } = await setup();
	const ed = editor(w);
	const widget = make(sample("table"));
	w.toggleNotesNewest();
	widget.render(100);
	await writeOn(widget, ed, item(find, widget, "cell:1.GPU %"), "too slow");
	await writeOn(widget, ed, item(find, widget, "col:GPU %"), "is this the average?");
	click(widget, find(widget, (t: any) => t.kind === "noteadd"));
	assert.equal(ed.message.length, 1);
	const m = ed.message[0];
	assert.match(m, /^Notes on the widget you drew \(2\)\./, "this widget has no title to name it by");
	assert.match(m, /1\. `tbl` \(Table\) > row 1, column `GPU %`, cell "91"\n {3}too slow/);
	assert.match(m, /2\. `tbl` \(Table\) > column `GPU %`\n {3}is this the average\?/);
	assert.deepEqual([sent, echoed], [[], []], "nothing was sent: the user reads it, edits it and presses Enter");
	const e = w.entryOf(widget.id);
	assert.equal(e.state.notes.length, 0, "the notes moved to the message");
	assert.equal(e.state.noteMode, false);
	// The user's next key is Enter, to send the message they just read. It must reach pi's editor, not the widget.
	assert.equal(w.active.id, null, "the widget gave the keyboard back");
	assert.equal(w.handleKey(ENTER), false, "Enter is pi's: it sends the message");
	assert.equal(w.handleKey("\t"), false);
	frame(widget);
	assert.ok(text(widget).includes("Added 2 notes to your message"), "and it says so");
});

test("Clear discards the notes", { skip }, async () => {
	const { make, w, click, find } = await setup();
	const ed = editor(w);
	const widget = make(sample("table"));
	w.toggleNotesNewest();
	widget.render(100);
	await writeOn(widget, ed, item(find, widget, "cell:1.Node"), "a");
	click(widget, find(widget, (t: any) => t.kind === "noteclear"));
	frame(widget);
	assert.equal(w.entryOf(widget.id).state.notes.length, 0);
	assert.equal(ed.message.length, 0);
	assert.ok(!text(widget).includes("Notes (1)"));
});

test("buttons and choices do not fire in notes mode: clicks on them are left alone", { skip }, async () => {
	const { make, w, click, find, sent, echoed } = await setup();
	editor(w);
	const widget = make(sample("interactive"));
	widget.render(100);
	const button = find(widget, (t: any) => t.kind === "button");
	w.toggleNotesNewest();
	widget.render(100);
	const r = widget.handleMouse({ type: "click", button: "left", x: 2 + button.rect.x + 1, y: button.rect.y });
	assert.notEqual(r?.handled, true, "not handled: pi keeps the click");
	assert.deepEqual([sent, echoed], [[], []]);
	void click;
});

test("keyboard: Tab to an element, Enter writes a note, Shift+Enter picks its parent, Delete removes a note from the tray", { skip }, async () => {
	const { make, w } = await setup();
	const ed = editor(w);
	const widget = make(sample("table"));
	w.toggleNotesNewest();
	widget.render(100);
	const e = w.entryOf(widget.id);
	const focusItem = () => widget.lastBlock().targets.find((t: any) => t.id === e.state.focus)?.item;
	assert.equal(w.handleKey("\t"), true);
	assert.equal(focusItem()?.type, "Table", "Tab lands on the whole component first");
	let guard = 0;
	while (!focusItem()?.key.startsWith("cell:") && guard++ < 40) w.handleKey(DOWN);
	const cell = focusItem()!;
	assert.ok(cell.key.startsWith("cell:"), `arrows step into the parts (${cell.key})`);
	ed.answers.push("about the cell");
	w.handleKey(ENTER);
	await flush();
	frame(widget);
	assert.equal(e.state.notes[0].info.key, cell.key, "Enter wrote a note on the cell");
	ed.answers.push("about the row");
	w.handleKey(SHIFT_ENTER);
	await flush();
	frame(widget);
	assert.match(e.state.notes[1].info.key, /^row:\d+$/, "Shift+Enter picked the row that holds the cell");
	// walk to the tray and delete the first note
	guard = 0;
	while (widget.lastBlock().targets.find((t: any) => t.id === e.state.focus)?.kind !== "note" && guard++ < 40) {
		w.handleKey("\t");
		frame(widget);
	}
	assert.equal(widget.lastBlock().targets.find((t: any) => t.id === e.state.focus)?.kind, "note");
	w.handleKey(DELETE);
	frame(widget);
	assert.equal(e.state.notes.length, 1, "Delete removed the note under the cursor");
});

test("down from a note reaches Add, never Clear; sideways moves between the two buttons", { skip }, async () => {
	const { make, w, click, find } = await setup();
	const ed = editor(w);
	const widget = make(sample("table"));
	w.toggleNotesNewest();
	widget.render(100);
	await writeOn(widget, ed, item(find, widget, "cell:1.Node"), "a");
	await writeOn(widget, ed, item(find, widget, "cell:2.Node"), "b");
	const e = w.entryOf(widget.id);
	const kind = () => widget.lastBlock().targets.find((t: any) => t.id === e.state.focus)?.kind;
	const noteRow = widget.lastBlock().targets.filter((t: any) => t.kind === "note").at(-1);
	e.state.focus = noteRow.id;
	w.handleKey(DOWN);
	frame(widget);
	assert.equal(kind(), "noteadd", "Enter on Clear would wipe the notes: it is not where Down lands");
	w.handleKey(RIGHT);
	frame(widget);
	assert.equal(kind(), "noteclear");
});

test("typing returns the keyboard to pi: a letter leaves notes mode and the widget stops taking keys", { skip }, async () => {
	const { make, w } = await setup();
	editor(w);
	const widget = make(sample("table"));
	w.toggleNotesNewest();
	widget.render(100);
	assert.equal(w.handleKey("a"), false, "the key is not used: pi's editor gets it");
	assert.equal(w.active.id, null);
	assert.equal(w.entryOf(widget.id).state.noteMode, false);
	assert.equal(w.handleKey(ENTER), false, "Enter is pi's again: it sends the message being typed");
});

test("while the editor is open, the widget does not touch its keys or the mouse", { skip }, async () => {
	const { make, w, find } = await setup();
	editor(w);
	const widget = make(sample("table"));
	w.toggleNotesNewest();
	widget.render(100);
	const t = item(find, widget, "row:1");
	w.dialog.open = true;
	try {
		assert.equal(w.handleKey("\t"), false);
		assert.equal(w.handleKey(ENTER), false);
		assert.equal(widget.handleMouse({ type: "click", button: "left", x: 2 + t.rect.x, y: t.rect.y }), undefined);
	} finally {
		w.dialog.open = false;
	}
});

test("limits: 20 notes per widget, and a long note is shortened", { skip }, async () => {
	const { make, w, click, find } = await setup();
	const ed = editor(w);
	const widget = make(sample("table"));
	w.toggleNotesNewest();
	widget.render(100);
	const targets = widget.lastBlock().targets.filter((t: any) => t.kind === "item" && t.item.key !== "");
	assert.ok(targets.length > NOTE_LIMITS.notes, `${targets.length} parts to note`);
	for (let i = 0; i < NOTE_LIMITS.notes; i++) {
		ed.answers.push(`note ${i + 1}`);
		perform(w, widget, targets[i]);
		await flush();
		frame(widget);
	}
	assert.equal(w.entryOf(widget.id).state.notes.length, NOTE_LIMITS.notes);
	const askedBefore = ed.asked.length;
	perform(w, widget, targets[NOTE_LIMITS.notes]);
	await flush();
	frame(widget);
	assert.equal(ed.asked.length, askedBefore, "the editor is not even opened for the 21st");
	assert.equal(w.entryOf(widget.id).state.notes.length, NOTE_LIMITS.notes, "the 21st is refused");
	assert.ok(text(widget).includes(`${NOTE_LIMITS.notes} notes is the most per widget`), "and the reason is shown");
	// editing an existing note is still allowed at the limit, and a long one is cut
	ed.answers.push("x".repeat(NOTE_LIMITS.note + 500));
	perform(w, widget, targets[0]);
	await flush();
	frame(widget);
	assert.equal(w.entryOf(widget.id).state.notes[0].text.length, NOTE_LIMITS.note);
	assert.ok(text(widget).includes(`shortened to ${NOTE_LIMITS.note} characters`));
	void find;
	void click;
});

test("a note on another tab keeps its tray entry when that tab is hidden, and its pin comes back with the tab", { skip }, async () => {
	const { make, w, click, find } = await setup();
	const ed = editor(w);
	const widget = make(sample("tabs"));
	w.toggleNotesNewest();
	widget.render(100);
	click(widget, find(widget, (t: any) => t.kind === "tab" && t.label === "Nodes"));
	frame(widget);
	await writeOn(widget, ed, item(find, widget, "row:2"), "two nodes only?", true);
	assert.ok(text(widget).includes("Notes (1)"));
	click(widget, find(widget, (t: any) => t.kind === "tab" && t.label === "Overview"));
	const away = text(widget);
	assert.ok(away.includes("Notes (1)") && away.includes("two nodes only?"), "the entry stays while its element is not on screen");
	assert.match(away, /\[tab "Nodes"\]/, "and says which tab it is on");
	click(widget, find(widget, (t: any) => t.kind === "tab" && t.label === "Nodes"));
	frame(widget);
	assert.ok(widget.lastBlock().targets.some((t: any) => t.id === w.entryOf(widget.id).state.notes[0].itemId), "the element is back");
});

test("words the widget supplies cannot put a file reference or a code span into the message", { skip }, async () => {
	const { make, w, click, find } = await setup();
	const ed = editor(w);
	const widget = make(`root = Stack([t])\nt = Table(["a"], [["@/etc/passwd \`rm -rf\` \\"quoted\\""]])`);
	w.toggleNotesNewest();
	widget.render(100);
	await writeOn(widget, ed, item(find, widget, "cell:1.a"), "look");
	click(widget, find(widget, (t: any) => t.kind === "noteadd"));
	const m = ed.message[0];
	assert.ok(!m.includes("@/etc"), m);
	assert.ok(m.includes("(at)/etc/passwd"), m);
	assert.ok(!m.includes("`rm -rf`"), "the widget's own backticks are gone");
});

test("no line is wider than the terminal with notes, pins, the tray and the chip, at any width", { skip }, async () => {
	const { tui, make, w, find, click } = await setup();
	const ed = editor(w);
	for (const s of LANG_SAMPLES) {
		const widget = make(s.source);
		for (const width of [24, 40, 70, 110]) {
			w.entryOf(widget.id).state.notes = [];
			w.entryOf(widget.id).state.noteMode = false;
			widget.render(width);
			w.toggleNotesNewest();
			widget.render(width);
			const its = widget.lastBlock().targets.filter((t: any) => t.kind === "item").slice(0, 3);
			for (const t of its) {
				ed.answers.push("a note that is long enough to need wrapping in the tray at a small width");
				perform(w, widget, t);
				await flush();
				widget.render(width);
			}
			for (const l of widget.render(width)) assert.ok(tui.visibleWidth(l) <= width, `${s.key}@${width}: ${tui.visibleWidth(l)} wide: ${strip(l)}`);
			w.entryOf(widget.id).state.notes = [];
			w.entryOf(widget.id).state.noteMode = false;
		}
	}
	void find;
});

test("/openui-notes toggles notes on the newest widget, or says there is none", { skip }, async () => {
	const { make, w } = await setup();
	const ext: any = await import("../src/pi/extension.ts");
	const commands: Record<string, any> = {};
	ext.default({ registerTool() {}, registerMessageRenderer() {}, registerCommand: (n: string, c: any) => (commands[n] = c), on() {}, sendUserMessage() {}, sendMessage() {} });
	const notices: string[] = [];
	const ctx: any = { ui: { notify: (m: string) => notices.push(m) } };
	await commands["openui-notes"].handler("", ctx);
	assert.equal(notices.length, 1, "no widget yet");
	assert.match(notices[0], /no widget yet/);
	const widget = make(sample("table"));
	widget.render(100);
	await commands["openui-notes"].handler("", ctx);
	assert.equal(w.entryOf(widget.id).state.noteMode, true);
	await commands["openui-notes"].handler("", ctx);
	assert.equal(w.entryOf(widget.id).state.noteMode, false);
});

test("the extension wires the editor and the message box to pi's own, and cleans up", { skip }, async () => {
	const { w } = await setup();
	const ext: any = await import("../src/pi/extension.ts");
	const handlers: Record<string, Function> = {};
	ext.default({ registerTool() {}, registerMessageRenderer() {}, registerCommand() {}, on: (n: string, f: Function) => (handlers[n] = f), sendUserMessage() {}, sendMessage() {} });
	const calls: string[] = [];
	let unsubbed = 0;
	const widgets: Record<string, any> = {};
	const ctx: any = {
		hasUI: true,
		ui: {
			onTerminalInput: () => () => unsubbed++,
			editor: async (title: string, prefill: string) => (calls.push(`editor:${title}:${prefill}`), "typed in pi's editor"),
			pasteToEditor: (t: string) => calls.push(`paste:${t}`),
			setWidget: (id: string, f: any) => (widgets[id] = f),
		},
	};
	await handlers.session_start({}, ctx);
	assert.equal(await w.hooks.prompt("Note on Table > row 1", "old"), "typed in pi's editor");
	w.hooks.toEditor("hello");
	assert.deepEqual(calls, ["editor:Note on Table > row 1:old", "paste:hello"]);
	// the hint line shows how to use notes while a widget is armed in notes mode
	const bar = widgets["openui-hint"]({ requestRender() {} }, { fg: (_c: string, s: string) => s });
	assert.deepEqual(bar.render(100), [], "nothing while no widget is armed");
	await handlers.session_start({}, ctx);
	assert.equal(unsubbed, 1, "a second start releases the first input listener");
	await handlers.session_shutdown();
	assert.equal(unsubbed, 2);
});
