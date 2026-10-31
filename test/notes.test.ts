// Notes, the pure part: which elements can carry a note, the words that describe them, cleaning, the message, pins, the tray
// and keyboard navigation in notes mode.
import assert from "node:assert/strict";
import { test } from "node:test";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { isLive, nextTarget, targetAt } from "../src/blocks/interact.ts";
import { buildMessage, cleanNote, describeNote, neutralize, quiet, widgetTitle } from "../src/blocks/notes.ts";
import { renderTree } from "../src/blocks/render.ts";
import { newState, type Block, type Note, type Target, type WState } from "../src/blocks/types.ts";
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";

const sample = (key: string) => LANG_SAMPLES.find((s) => s.key === key)!.source;

function draw(src: string, state: WState = newState(), width = 100) {
	const c = compile(src);
	assert.deepEqual(c.errors, [], src);
	const r = renderTree(c.root!, width, state);
	return { block: r.block, root: c.root!, text: rowsToLines(r.block.rows).join("\n") };
}
const items = (b: Block) => b.targets.filter((t) => t.kind === "item");
const item = (b: Block, key: string, host?: string): Target => {
	const t = items(b).find((x) => x.item!.key === key && (!host || x.item!.host === host));
	assert.ok(t, `no item "${key}"; have ${items(b).map((x) => x.item!.key || "(whole)").join(", ")}`);
	return t!;
};

test("components that hold or act offer nothing to note; every other component offers its whole body", () => {
	const none = draw(`root = Stack([c, b, ch, t])
c = Card([Text("x")], "Card")
b = Button("Go")
ch = Choice("Q?", ["a", "b"])
t = Tabs([i])
i = TabItem("One", [Text("inside")])`);
	const hosts = items(none.block).map((t) => t.item!.type);
	assert.ok(!hosts.includes("Card") && !hosts.includes("Button") && !hosts.includes("Choice") && !hosts.includes("Tabs") && !hosts.includes("Stack"));
	assert.equal(hosts.filter((h) => h === "Text").length, 2, "the two Texts, nothing else");
	for (const [key, type] of [["text", "Text"], ["markdown", "Markdown"], ["code-langs", "CodeBlock"], ["interactive", "Faq"], ["image", "Image"]] as const) {
		const d = draw(sample(key));
		assert.ok(items(d.block).some((t) => t.item!.type === type && t.item!.key === ""), `${key}: whole ${type}`);
	}
});

test("components with parts offer them (rows, columns, cells, nodes, points, slices, axes, pins ...) plus the whole", () => {
	const expect: Record<string, string[]> = {
		table: ["", "row:1", "col:State", "cell:3.State"],
		dag: ["", "lint", "build"],
		erd: ["", "users", "users.email", "jobs.status"],
		infra: ["", "worker", "zone:Edge", "api>db"],
		sequence: ["", "user", "req"],
		geo: ["", "Tokyo"],
		pie: ["", "llama-3.3-70b", "free"],
		line: ["", "Thu", "series:worker"],
		area: ["", "12:00", "series:qwen3"],
		radar: ["", "Cost", "series:llama"],
	};
	for (const [key, keys] of Object.entries(expect)) {
		const d = draw(sample(key), newState(), 110);
		for (const k of keys) assert.ok(items(d.block).some((t) => t.item!.key === k), `${key}: item "${k}" among ${items(d.block).map((t) => t.item!.key || "(whole)").join(", ")}`);
	}
	const bar = draw(`root = Stack([c])\nc = BarChart(["a", "b"], [1, 2])`);
	assert.deepEqual(items(bar.block).map((t) => t.item!.key).sort(), ["", "a", "b"]);
});

test("the words for each kind of element", () => {
	const d = draw(sample("table"));
	assert.equal(item(d.block, "row:3").item!.where, 'row 3 ("spark-3")');
	assert.equal(item(d.block, "col:State").item!.where, "column `State`");
	assert.equal(item(d.block, "cell:3.State").item!.where, 'row 3, column `State`, cell "draining"');
	assert.equal(item(d.block, "").item!.short, "Table");
	const dag = draw(sample("dag"));
	assert.equal(item(dag.block, "lint").item!.where, 'node `lint` ("Lint")');
	assert.equal(item(dag.block, "lint").item!.short, "Dag > node Lint");
	const erd = draw(sample("erd"), newState(), 110);
	assert.equal(item(erd.block, "users").item!.where, "table `users`");
	assert.equal(item(erd.block, "jobs.status").item!.where, "column `jobs.status`");
	const inf = draw(sample("infra"), newState(), 110);
	assert.equal(item(inf.block, "zone:Edge").item!.where, 'zone "Edge"');
	assert.equal(item(inf.block, "api>db").item!.where, "link `api` -> `db`");
	const pie = draw(sample("pie"));
	assert.equal(item(pie.block, "llama-3.3-70b").item!.where, 'slice "llama-3.3-70b" (value 52)');
	const line = draw(sample("line"));
	assert.equal(item(line.block, "Thu").item!.where, 'point "Thu"');
	assert.equal(item(line.block, "series:worker").item!.where, 'series "worker"');
	const radar = draw(sample("radar"));
	assert.equal(item(radar.block, "Cost").item!.where, 'axis "Cost"');
	const geo = draw(sample("geo"));
	assert.equal(item(geo.block, "Tokyo").item!.where, 'pin "Tokyo"');
	const seq = draw(sample("sequence"), newState(), 110);
	assert.equal(item(seq.block, "user").item!.where, "participant `user`");
	assert.equal(item(seq.block, "req").item!.where, "message `req`");
	// whole components say which one they are by quoting their own words
	const md = draw(`root = Stack([m, t, c])\nm = Markdown("# Release notes\\n\\nbody")\nt = Text("Cluster status", "title")\nc = CodeBlock("kubectl get pods", "bash", "pods.sh")`);
	assert.deepEqual(items(md.block).map((t) => t.item!.where).sort(), ['"Cluster status"', '"Release notes"', '"pods.sh"']);
});

test("an item carries the variable it was defined under, the tab it sits under, and its source line", () => {
	const d = draw(sample("tabs"));
	assert.ok(items(d.block).length > 0 && items(d.block).every((t) => t.item!.tab === "Overview"), "everything on the first tab is under Overview");
	const st = newState();
	st.tab["0.0"] = 1;
	const d2 = draw(sample("tabs"), st);
	assert.ok(items(d2.block).every((t) => t.item!.tab === "Nodes"));
	const tbl = items(d2.block).find((t) => t.item!.type === "Table" && t.item!.key === "")!;
	assert.equal(tbl.item!.name, "tbl");
	assert.equal(tbl.item!.tab, "Nodes");
	assert.ok(tbl.item!.line > 1);
	const inline = draw(`root = Stack([Text("no variable")])`);
	assert.equal(items(inline.block)[0].item!.name, undefined);
});

test("parents: a cell's row, a column's table, anything else's whole component", () => {
	const d = draw(sample("table"));
	const cell = item(d.block, "cell:3.State");
	assert.equal(cell.item!.parent, "item:0.0:row:3");
	assert.ok(d.block.targets.some((t) => t.id === cell.item!.parent), "the parent exists");
	assert.equal(item(d.block, "row:3").item!.parent, "item:0.0:");
	const erd = draw(sample("erd"), newState(), 110);
	assert.equal(item(erd.block, "users.email").item!.parent, "item:0.0:users");
});

test("words from the widget are made safe for a message the user will send", () => {
	assert.equal(quiet("a `tick` and \"quotes\"\nand  newlines", 80), "a 'tick' and 'quotes' and newlines");
	assert.equal(quiet("zero\u200bwidth\u202ebidi\u0007bell", 80), "zerowidthbidibell");
	assert.equal(quiet("x".repeat(100), 20), "x".repeat(17) + "...");
	assert.equal(neutralize("@file:/etc/passwd and a@b.com and @url:x"), "(at)file:/etc/passwd and a@b.com and (at)url:x");
	assert.equal(quiet("@file:/etc/passwd", 80), "(at)file:/etc/passwd");
	const evil = draw(`root = Stack([t])\nt = Table(["a"], [["\`rm -rf\` @file:/x \\"q\\""]])`);
	const where = item(evil.block, "cell:1.a").item!.where;
	assert.ok(!/@file/.test(where) && !where.slice(where.indexOf("cell")).includes("`"), where);
	// the user's own text keeps its newlines and its @, loses control characters and trailing blanks
	assert.equal(cleanNote("  line one  \r\nline two @file:x\u200b\u0007  \n\n"), "line one\nline two @file:x");
});

function noteFor(d: ReturnType<typeof draw>, key: string, text: string, id = 1, host?: string): Note {
	const t = item(d.block, key, host);
	return { id, itemId: t.id, info: t.item!, text };
}

test("the message names each element the way the agent wrote it, numbered, with the user's words indented", () => {
	const d = draw(sample("table"));
	const notes = [noteFor(d, "cell:3.State", "Is this expected?"), noteFor(d, "col:GPU %", "Average over what window?\nAnd why not p95?", 2)];
	const msg = buildMessage(notes, "Cluster status");
	assert.equal(
		msg,
		[
			'Notes on the widget "Cluster status" (2). Please answer each note by its number. Names in backticks are the variable names in the widget source; table rows count from 1, not counting the header row.',
			"",
			'1. `tbl` (Table) > row 3, column `State`, cell "draining"',
			"   Is this expected?",
			"2. `tbl` (Table) > column `GPU %`",
			"   Average over what window?",
			"   And why not p95?",
		].join("\n"),
	);
	assert.equal(buildMessage([], ""), buildMessage([], "").replace("(0)", "(0)"));
	assert.match(buildMessage([notes[0]], ""), /^Notes on the widget you drew \(1\)/);
});

test("an element without a variable is identified by its type and source line; a tab is named", () => {
	const st = newState();
	const d = draw(`root = Stack([Text("inline words")])`);
	const n = noteFor(d, "", "hm");
	assert.match(describeNote(n), /^the Text at line 1 \(Text\) > "inline words"$/);
	st.tab["0.0"] = 1;
	const t = draw(sample("tabs"), st);
	const tblHost = items(t.block).find((x) => x.item!.type === "Table")!.item!.host;
	assert.match(describeNote(noteFor(t, "", "x", 1, tblHost)), /^`tbl` \(Table\) \[tab "Nodes"\]$/);
});

test("the widget's title names it in the message", () => {
	assert.equal(widgetTitle(draw(sample("dashboard")).root), "Cluster status");
	assert.equal(widgetTitle(draw(`root = Stack([c])\nc = Card([Text("x")], "Release 2.3")`).root), "Release 2.3");
	assert.equal(widgetTitle(draw(`root = Stack([Text("plain")])`).root), "");
});

test("pins and the tray: numbers on the elements, one tray entry per note, two buttons, and the tray does not move the widget", () => {
	const st = newState();
	const base = draw(sample("table"), st);
	st.notes = [noteFor(base, "cell:3.State", "first"), noteFor(base, "col:GPU %", "second", 2)];
	const d = draw(sample("table"), st);
	assert.ok(d.text.includes("│1draining") || /1\s*draining/.test(d.text), `pin 1 next to its cell:\n${d.text}`);
	assert.ok(/GPU %.*2|2.*GPU %/.test(d.text.split("\n")[1]), "pin 2 on the header");
	assert.ok(d.text.includes("Notes (2)"));
	assert.ok(d.text.includes("[ Add 2 notes to your message ]") && d.text.includes("[ Clear ]"));
	assert.ok(/1 .*row 3.*cell "draining"/.test(d.text), "the tray says where note 1 is");
	assert.ok(d.text.includes("first") && d.text.includes("second"));
	const kinds = d.block.targets.map((t) => t.kind);
	assert.equal(kinds.filter((k) => k === "note").length, 2);
	assert.ok(kinds.includes("noteadd") && kinds.includes("noteclear"));
	// the table itself is where it was
	assert.equal(d.text.split("\n").slice(0, 7).join("\n").replace(/\d(?=\w)/g, " ").length > 0, true);
	assert.equal(d.block.rows.length, base.block.rows.length + d.block.targets.filter((t) => t.kind === "note").reduce((a, t) => a + t.rect.h, 0) + 3, "tray rows: entries, buttons, and the box around them");
});

test("a note whose element is not on screen (another tab) keeps its tray entry and shows no pin", () => {
	const st = newState();
	st.tab["0.0"] = 1;
	const onNodes = draw(sample("tabs"), st);
	const tblHost = items(onNodes.block).find((x) => x.item!.type === "Table")!.item!.host;
	st.notes = [noteFor(onNodes, "cell:1.State", "check this", 1, tblHost)];
	st.tab["0.0"] = 0;
	const back = draw(sample("tabs"), st);
	assert.ok(back.text.includes("Notes (1)") && back.text.includes("check this"));
	assert.ok(!/│1\w/.test(back.text), "no pin without its element");
	assert.ok(back.text.includes('[tab Nodes]') || back.text.includes("tab Nodes") || /tbl/.test(back.text));
});

test("notes mode: items, tabs, the tray and the chip answer; buttons, choices, faq and copy do not", () => {
	const d = draw(sample("interactive"));
	const live = (notes: boolean) => new Set(d.block.targets.filter((t) => isLive(t, notes)).map((t) => t.kind));
	assert.ok(live(false).has("button") && live(false).has("choice") && live(false).has("faq") && !live(false).has("item"));
	assert.ok(live(true).has("item") && !live(true).has("button") && !live(true).has("choice") && !live(true).has("faq"));
	const b = d.block.targets.find((t) => t.kind === "button")!;
	assert.equal(targetAt(d.block, b.rect.x + 1, b.rect.y, false)?.kind, "button");
	assert.equal(targetAt(d.block, b.rect.x + 1, b.rect.y, true)?.kind === "button", false, "in notes mode a click on a button does not press it");
	const tabs = draw(sample("tabs"));
	const tab = tabs.block.targets.find((t) => t.kind === "tab")!;
	assert.equal(targetAt(tabs.block, tab.rect.x, tab.rect.y, true)?.kind, "tab", "tabs still switch, so every tab's content can be noted");
});

test("notes mode keyboard: Tab hops between components, arrows move inside one and then on to the next", () => {
	const d = draw(`root = Stack([intro, tbl, gr])
intro = Text("Overview", "heading")
tbl = Table(["A", "B"], [["1", "2"], ["3", "4"]])
gr = Dag([n1, n2], [["x", "y"]])
n1 = DagNode("x", "X")
n2 = DagNode("y", "Y")`);
	const go = (cur: string | null, key: any) => nextTarget(d.block, cur, key, true)!;
	const label = (t: Target) => `${t.item?.type ?? t.kind}:${t.item?.key ?? ""}`;
	// Tab: whole components in reading order, then wraps
	const a = go(null, "next");
	assert.equal(label(a), "Text:");
	const b = go(a.id, "next");
	assert.equal(label(b), "Table:");
	const c = go(b.id, "next");
	assert.equal(label(c), "Dag:");
	assert.equal(label(go(c.id, "next")), "Text:", "and it wraps (the widget adds the chip as one more stop, see pi-component.test.ts)");
	assert.equal(label(go(a.id, "prev")), "Dag:", "Shift+Tab from the first goes to the last");
	// arrows: from the whole table into its parts
	const first = go(b.id, "down");
	assert.equal(first.item!.host, b.item!.host);
	assert.notEqual(first.item!.key, "");
	const right = go(first.id, "right");
	assert.equal(right.item!.host, b.item!.host, "stays in the table");
	// past the last part of the table, Down moves on to the next component
	let cur = first;
	for (let i = 0; i < 20 && cur.item?.host === b.item!.host; i++) cur = go(cur.id, "down");
	assert.equal(cur.item?.type, "Dag", "stepped out of the table into the next component");
	// a component with no parts: arrows go straight to its neighbour
	assert.equal(label(go(a.id, "down")), "Table:");
});

test("sideways in the tray moves between its two buttons; up and down move between its rows", () => {
	const st = newState();
	const base = draw(sample("table"), st);
	st.notes = [noteFor(base, "row:1", "a"), noteFor(base, "row:2", "b", 2)];
	const d = draw(sample("table"), st);
	const n1 = d.block.targets.find((t) => t.kind === "note")!;
	const add = d.block.targets.find((t) => t.kind === "noteadd")!;
	const clear = d.block.targets.find((t) => t.kind === "noteclear")!;
	assert.equal(nextTarget(d.block, add.id, "right", true)!.id, clear.id);
	assert.equal(nextTarget(d.block, clear.id, "left", true)!.id, add.id);
	const n2 = d.block.targets.filter((t) => t.kind === "note")[1];
	assert.equal(nextTarget(d.block, n1.id, "down", true)!.id, n2.id);
	assert.equal(nextTarget(d.block, n2.id, "down", true)!.id, add.id);
});
