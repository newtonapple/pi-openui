// Two sizes of scroll step: a fine one (‹ ›, a few cells, the user's scroll.step) and a page (« », three quarters of the pane, a
// table lands on a column edge). On a phone one big jump feels disjointed; the fine arrows are for reading along.
import assert from "node:assert/strict";
import { test } from "node:test";
import { activate, describe, nextTarget, panKey, type Env } from "../src/blocks/interact.ts";
import { barLayout, barRow, DEFAULT_FINE_STEP, fineStepPan, panStep, stepPan } from "../src/blocks/pan.ts";
import { renderTree } from "../src/blocks/render.ts";
import { newState, type Block, type Target } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";
import { DEFAULTS } from "../src/pi/config.ts";

const text = (cells: Array<{ ch: string }>) => cells.map((c) => c.ch).join("");
const env: Env = { send() {}, copy() {}, note() {} };

test("the fine step is a setting with one default", () => {
	assert.equal(DEFAULT_FINE_STEP, 8);
	assert.equal(DEFAULTS.scrollStep, DEFAULT_FINE_STEP);
});

test("fineStepPan moves by exactly that many cells and stops at both ends", () => {
	assert.equal(fineStepPan(0, 1, 175, 63, 8), 8);
	assert.equal(fineStepPan(8, 1, 175, 63, 8), 16);
	assert.equal(fineStepPan(3, -1, 175, 63, 8), 0);
	assert.equal(fineStepPan(110, 1, 175, 63, 8), 112);
	assert.equal(fineStepPan(0, 1, 50, 63, 8), 0, "a block that fits has nowhere to go");
});

test("the bar has a page arrow and a fine arrow on each side, with the track between", () => {
	const l = barLayout(60, 0, 175, 59);
	assert.deepEqual([l.pageLeft!.x, l.left.x, l.right.x, l.pageRight!.x], [0, 3, 54, 57]);
	assert.ok([l.pageLeft!, l.left, l.right, l.pageRight!].every((r) => r.w === 3), "each is three cells: something a finger can hit");
	assert.equal(l.track.x, 6);
	assert.equal(l.track.x + l.track.w + (l.label ? l.label.length + 2 : 0), 54, "the track and the label fill what the arrows leave");
	const s = text(barRow(60, 0, 175, 59));
	assert.ok(s.startsWith(" «  ‹ ") && s.endsWith(" ›  » "), JSON.stringify(s)); // each arrow is a three-cell target with the glyph in the middle
	assert.ok(s.includes("1–59/175"));
});

test("an arrow that cannot move is dim, for both sizes", () => {
	const start = barRow(60, 0, 175, 59);
	assert.equal(start[1].role, "text.muted");
	assert.equal(start[4].role, "text.muted");
	assert.equal(start[55].role, "btn");
	assert.equal(start[58].role, "btn");
	const end = barRow(60, 116, 175, 59);
	assert.equal(end[55].role, "text.muted");
	assert.equal(end[58].role, "text.muted");
	assert.equal(end[1].role, "btn");
});

test("a very narrow bar keeps the fine arrows and drops the page arrows, and is always as wide as asked", () => {
	const l = barLayout(16, 0, 100, 14);
	assert.equal(l.pageLeft, undefined);
	assert.equal(l.pageRight, undefined);
	assert.equal(l.left.x, 0);
	for (let width = 1; width <= 80; width++) assert.equal(barRow(width, 3, 400, width).length, width, `width ${width}`);
});

const wideTable = (cols: number) => {
	const heads = Array.from({ length: cols }, (_, i) => `"H${i}"`).join(",");
	const row = Array.from({ length: cols }, () => `"twelve-chars"`).join(",");
	return `root = Stack([t])\nt = Table([${heads}], [[${row}],[${row}]])`;
};
class Scene {
	state = newState();
	root;
	block!: Block;
	width: number;
	step: number | undefined;
	constructor(src: string, width: number, step?: number) {
		this.width = width;
		this.step = step;
		const c = compile(src);
		assert.deepEqual(c.errors, []);
		this.root = c.root!;
		this.draw();
	}
	draw() {
		this.block = renderTree(this.root, this.width, this.state, this.step === undefined ? {} : { settings: { tableMinCol: 12, scrollStep: this.step } }).block;
	}
	part(p: string): Target {
		const t = this.block.targets.find((x) => x.kind === "pan" && x.scroll!.part === p);
		assert.ok(t, `no ${p} part; have ${this.block.targets.map((x) => x.id).join(", ")}`);
		return t!;
	}
	get key() {
		return this.part("track").scroll!.key;
	}
	get pan() {
		return this.state.pan[this.key] ?? 0;
	}
	tap(p: string) {
		const changed = activate(this.part(p), this.state, env);
		this.draw();
		return changed;
	}
}

test("the five parts of the bar are targets, in reading order", () => {
	const s = new Scene(wideTable(16), 60);
	const order: string[] = [];
	let cur: string | null = null;
	for (let i = 0; i < 60 && order.length < 5; i++) {
		const t = nextTarget(s.block, cur, "next")!;
		cur = t.id;
		if (t.kind === "pan") order.push(t.scroll!.part);
	}
	assert.deepEqual(order, ["pageleft", "left", "track", "right", "pageright"]);
});

test("a tap on ‹ › moves the user's scroll.step cells; default 8", () => {
	const s = new Scene(wideTable(16), 60);
	s.tap("right");
	assert.equal(s.pan, 8);
	s.tap("right");
	assert.equal(s.pan, 16);
	s.tap("left");
	assert.equal(s.pan, 8);
	const fine = new Scene(wideTable(16), 60, 3);
	fine.tap("right");
	assert.equal(fine.pan, 3, "scroll.step 3");
	const coarse = new Scene(wideTable(16), 60, 20);
	coarse.tap("right");
	assert.equal(coarse.pan, 20);
});

test("a tap on « » moves three quarters of the pane, and a table lands on a column edge", () => {
	const dag = new Scene(`root = Stack([d])\nd = Dag([a,b,c,e], [["a","b"],["b","c"],["c","e"]], "LR")\na = DagNode("a", "A step with a long name one")\nb = DagNode("b", "A step with a long name two")\nc = DagNode("c", "A step with a long name three")\ne = DagNode("e", "A step with a long name four")`, 50);
	dag.tap("pageright");
	assert.equal(dag.pan, panStep(50), "a diagram: three quarters of the pane");
	dag.tap("pageleft");
	assert.equal(dag.pan, 0);
	const t = new Scene(wideTable(16), 60);
	t.tap("pageright");
	const sc = t.part("right").scroll!;
	assert.equal(t.pan, stepPan(0, 1, sc.total, sc.view, sc.edges));
	assert.ok(sc.edges!.includes(t.pan) || t.pan === sc.total - sc.view, `${t.pan} is a column edge`);
});

test("a fine step is not snapped to a column: it can land anywhere", () => {
	const s = new Scene(wideTable(16), 60, 5);
	s.tap("right");
	assert.equal(s.pan, 5);
	assert.ok(!s.part("right").scroll!.edges!.includes(5), "5 is in the middle of a column");
});

test("the ends: an arrow that cannot move says so, and the pan stays in range", () => {
	const s = new Scene(wideTable(16), 60);
	assert.equal(s.tap("left"), false);
	assert.equal(s.tap("pageleft"), false);
	for (let i = 0; i < 80; i++) s.tap("right");
	const sc = s.part("right").scroll!;
	assert.equal(s.pan, sc.total - sc.view);
	assert.equal(s.tap("right"), false);
	assert.equal(s.tap("pageright"), false);
});

test("keys: Left and Right are fine, the page flag is a page", () => {
	const s = new Scene(wideTable(16), 60);
	const focus = s.part("track").id;
	assert.equal(panKey(s.block, s.state, focus, "right"), true);
	assert.equal(s.pan, 8);
	assert.equal(panKey(s.block, s.state, focus, "right", true), true);
	const sc = s.part("right").scroll!;
	assert.equal(s.pan, stepPan(8, 1, sc.total, sc.view, sc.edges));
	assert.equal(panKey(s.block, s.state, focus, "left"), true);
	assert.equal(panKey(s.block, s.state, null, "right"), false);
});

test("what the hover line says: how far an arrow goes", () => {
	const s = new Scene(wideTable(16), 60);
	assert.match(describe(s.part("right")), /scroll right.*8 cells/);
	assert.match(describe(s.part("pageright")), /page right/);
	assert.match(describe(s.part("left")), /scroll left/);
});

test("the bar still fits a very narrow pane, and a pane that fits has no bar", () => {
	const s = new Scene(wideTable(16), 24);
	assert.ok(rowsToLines(s.block.rows).at(-1)!.includes("»"));
	assert.ok(s.block.rows.every((r) => r.length <= 24));
	const fits = new Scene(`root = Stack([t])\nt = Table(["a"],[["b"]])`, 60);
	assert.ok(!fits.block.targets.some((t) => t.kind === "pan"));
});
