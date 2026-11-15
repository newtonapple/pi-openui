// A cell that was cut to fit the pane ends in an ellipsis. It is a target of its own: a tap (or Enter) opens a panel under the
// table with the whole cell, as plain text, so nothing a table holds is out of reach. A table that scrolls cuts nothing and has
// no such targets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { activate, describe, nextTarget, targetAt, type Env } from "../src/blocks/interact.ts";
import { renderTree } from "../src/blocks/render.ts";
import { tableBlock } from "../src/blocks/table.ts";
import { newState, type Block, type Target } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";
import { rng } from "./helpers.ts";

const NOTE = "rolling restart in progress since 14:02, owner platform-team, ticket OPS-4471, see the *runbook* #12";
const COLS = ["Service", "Notes", "State"];
const ROWS = [["billing-api-gateway", NOTE, "up"], ["auth", "ok", "down 8d"], ["search", "x".repeat(70), "up"]];
const q = JSON.stringify;
const env: Env = { send() {}, copy() {}, note() {} };

class Scene {
	state = newState();
	root;
	block!: Block;
	width: number;
	minCol: number;
	constructor(src: string, width: number, minCol = 12) {
		this.width = width;
		this.minCol = minCol;
		const c = compile(src);
		assert.deepEqual(c.errors, [], c.errors.join("|"));
		this.root = c.root!;
		this.draw();
	}
	draw() {
		this.block = renderTree(this.root, this.width, this.state, { settings: { tableMinCol: this.minCol, scrollStep: 8 } }).block;
	}
	get text() {
		return rowsToLines(this.block.rows).join("\n");
	}
	get full(): Target[] {
		return this.block.targets.filter((t) => t.kind === "tip" && t.tip?.full !== undefined);
	}
	tap(t: Target) {
		const hit = targetAt(this.block, t.rect.x + Math.floor(t.rect.w / 2), t.rect.y);
		assert.ok(hit, `nothing under ${t.id}`);
		if (activate(hit!, this.state, env)) this.draw();
		return hit!;
	}
}
const table = (extra = "") => `root = Stack([t])\nt = Table(${q(COLS)}, ${q(ROWS)}${extra})`;
/** a picture's text with the borders and every line break taken out: what is left is what the reader can read, wrapped or not */
const squash = (s: string) => s.replace(/[│╭╮╰╯─\s]/g, "");
const has = (picture: string, full: string) => squash(picture).includes(squash(full));

test("tableBlock says which cells it cut: the ones that end in an ellipsis, and no others", () => {
	const t = tableBlock(COLS, ROWS, 60, { minCol: 12 });
	const lines = rowsToLines(t.block.rows);
	assert.equal(t.cut.length, ROWS.length);
	const cutCells = t.cut.flatMap((row, ri) => row.map((c, ci) => (c ? `${ri}.${t.order[ci]}` : null)).filter(Boolean));
	assert.deepEqual(cutCells, ["0.1", "2.1"], "the two long notes, and nothing else");
	assert.ok(lines[3].includes("…") && lines[5].includes("…") && !lines[4].includes("…"));
});

test("a table that scrolls, or fits, cuts nothing and says so", () => {
	const wide = tableBlock(COLS, ROWS, 30, { minCol: 12 });
	assert.ok(wide.block.w > 30, "it scrolls");
	assert.ok(wide.cut.flat().every((c) => !c) && wide.headCut.every((c) => !c));
	const roomy = tableBlock(COLS, ROWS, 300, { minCol: 12 });
	assert.ok(roomy.cut.flat().every((c) => !c));
});

test("each cut cell is a target that carries its whole text; the cells that were not cut are not", () => {
	const s = new Scene(table(), 60);
	assert.equal(s.full.length, 2);
	assert.deepEqual(s.full.map((t) => t.tip!.full).sort(), [NOTE, "x".repeat(70)].sort());
	assert.ok(s.full.every((t) => t.rect.w > 0 && t.rect.x + t.rect.w <= 60), "each sits on its cell, inside the pane");
	assert.ok(s.full.every((t) => /^Notes, row [13]$/.test(t.label)), s.full.map((t) => t.label).join("|"));
});

test("a cut header is readable in full too", () => {
	const src = `root = Stack([t])\nt = Table(["A heading that is far too long for its column", "B"], [["x", "y"]])`;
	const s = new Scene(src, 30);
	const head = s.full.find((t) => t.label.startsWith("column"));
	assert.ok(head, s.block.targets.map((t) => t.label).join("|"));
	assert.equal(head!.tip!.full, "A heading that is far too long for its column");
});

test("a tap opens a panel under the table with the whole cell as plain text, a second tap closes it", () => {
	const s = new Scene(table(), 60);
	const cell = s.full.find((t) => t.tip!.full === NOTE)!;
	const before = s.block.rows.length;
	assert.ok(!s.text.includes("OPS-4471"), "the end of the note is not on screen yet");
	s.tap(cell);
	assert.ok(s.block.rows.length > before, "the panel is under the table");
	assert.ok(has(s.text, NOTE), `the whole note, with its *star* and #12 as typed:\n${s.text}`);
	assert.ok(s.block.rows.every((r) => r.length <= 60));
	s.tap(s.full.find((t) => t.tip!.full === NOTE)!);
	assert.equal(s.block.rows.length, before, "closed");
	assert.ok(!s.text.includes("OPS-4471"));
});

test("only one panel is open: opening another cell closes the first", () => {
	const s = new Scene(table(), 60);
	s.tap(s.full.find((t) => t.tip!.full === NOTE)!);
	s.tap(s.full.find((t) => t.tip!.full === "x".repeat(70))!);
	assert.ok(has(s.text, "x".repeat(70)) && !has(s.text, "OPS-4471"));
});

test("line breaks in a cell are kept in the panel, and a number is read as it was written", () => {
	const src = `root = Stack([t])\nt = Table(["Log", "n"], [["first line of the log\\nsecond line of the log, which is long enough to be cut", 1234567.891]])`;
	const s = new Scene(src, 40);
	const cell = s.full.find((t) => t.label.startsWith("Log"))!;
	assert.ok(cell.tip!.full!.includes("\n"));
	s.tap(cell);
	assert.match(s.text, /first line of the log\s*│\n│[^\n]*second line/);
});

test("it says what a tap will do, in the line under the widget", () => {
	const s = new Scene(table(), 60);
	const line = describe(s.full[0]);
	assert.match(line, /Notes, row 1/);
	assert.match(line, /read all/i);
	assert.ok(line.length <= 40, `short enough to fit a phone: ${line.length}`);
});

test("a tooltip the model wrote on that cell keeps its words, and the full text is added to its panel", () => {
	const src = table(`, [tip]`) + `\ntip = Tooltip("cell:1.Notes", "restart", "The gateway is draining.")`;
	const s = new Scene(src, 60);
	const cell = s.block.targets.find((t) => t.label === "cell:1.Notes")!;
	assert.equal(cell.tip!.hint, "restart");
	assert.equal(cell.tip!.full, NOTE);
	s.tap(cell);
	const text = s.text;
	assert.ok(text.includes("The gateway is draining.") && has(text, NOTE), text);
	assert.ok(s.text.includes("◆"), "its badge is still there");
	assert.equal(s.full.length, 2, "the other cut cell has its own target; this one is the tooltip's");
});

test("a Markdown table is cut the same way and reads the same way", () => {
	const md = "| name | note |\n|---|---|\n| alpha | " + NOTE + " |\n| beta | ok |";
	const s = new Scene(`root = Stack([m])\nm = Markdown(${q(md)})`, 40);
	assert.equal(s.full.length, 1);
	s.tap(s.full[0]);
	assert.ok(has(s.text, NOTE), s.text);
});

test("a table in a place that cannot hold targets (a tooltip's own panel) is just cut, as before", () => {
	const md = "| name | note |\n|---|---|\n| alpha | " + NOTE + " |";
	const s = new Scene(`root = Stack([t])\nt = Table(["a"], [["b"]], [tip])\ntip = Tooltip("cell:1.a", "h", ${q(md)})`, 40);
	assert.ok(s.block.targets.every((t) => t.tip?.full === undefined));
});

test("by keyboard: Tab reaches a cut cell and Enter opens it; the arrows move between cut cells", () => {
	const s = new Scene(table(), 60);
	const first = nextTarget(s.block, null, "next")!;
	assert.ok(first.tip?.full !== undefined, `the first stop is a cut cell: ${first.label}`);
	assert.equal(activate(first, s.state, env), true);
	s.draw();
	assert.ok(has(s.text, first.tip!.full!));
	const second = nextTarget(s.block, first.id, "down")!;
	assert.ok(second.tip?.full !== undefined && second.id !== first.id, `down goes to the next cut cell: ${second.label}`);
});

test("in notes mode the cut cells stand back: clicks write notes, they do not open panels", () => {
	const s = new Scene(table(), 60);
	s.state.noteMode = true;
	s.draw();
	assert.ok(nextTarget(s.block, null, "next", true)!.tip?.full === undefined);
});

test("random squeezed tables: every cell that ends in an ellipsis has a target with its text, and nothing else does", () => {
	const r = rng(5);
	for (let i = 0; i < 200; i++) {
		const n = 2 + Math.floor(r() * 3);
		const cols = Array.from({ length: n }, (_, k) => `H${k}`);
		const rows = Array.from({ length: 1 + Math.floor(r() * 4) }, () => cols.map(() => "w".repeat(1 + Math.floor(r() * 50)) + " tail"));
		const width = 30 + Math.floor(r() * 60);
		const src = `root = Stack([t])\nt = Table(${q(cols)}, ${q(rows)})`;
		const s = new Scene(src, width);
		const lines = rowsToLines(s.block.rows);
		const body = lines.slice(3, 3 + rows.length);
		const dots = body.reduce((a, l) => a + (l.match(/…/g) ?? []).length, 0);
		const bodyTargets = s.full.filter((t) => t.rect.y >= 3 && t.rect.y < 3 + rows.length);
		assert.equal(bodyTargets.length, dots, `${JSON.stringify({ n, width })}\n${lines.join("\n")}`);
		for (const t of bodyTargets) {
			const shown = body[t.rect.y - 3].slice(t.rect.x, t.rect.x + t.rect.w);
			assert.ok(shown.includes("…") && t.tip!.full!.startsWith(shown.replace("…", "").trimEnd().slice(0, 5)), `${shown} / ${t.tip!.full}`);
		}
	}
});
