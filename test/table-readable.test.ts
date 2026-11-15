// A table that scrolls always shows its whole contents: pinning is a request the model makes, never a way for text to be lost.
// No pin means nothing is pinned and the whole table scrolls; a pin that does not fit is skipped (not squeezed); no cell is
// cut with an ellipsis once a table scrolls.
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTree } from "../src/blocks/render.ts";
import { tableBlock } from "../src/blocks/table.ts";
import { newState, type Block } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";
import { rng } from "./helpers.ts";

const NOTE = "rolling restart in progress since 14:02, owner platform-team, ticket OPS-4471";
const COLS = ["Service", "Notes", "State"];
const ROWS = [["billing-api-gateway", NOTE, "up"], ["auth", "ok", "down 8d"]];
const text = (b: Block) => rowsToLines(b.rows).join("\n");

test("no pin: nothing is pinned, the order is the one written, at every width", () => {
	for (const width of [20, 30, 40, 60, 90, 200]) {
		const t = tableBlock(COLS, ROWS, width, { minCol: 12 });
		assert.equal(t.frozen, 0, `width ${width}`);
		assert.deepEqual(t.order, [0, 1, 2]);
	}
});

test("a pin that does not fit is skipped, not squeezed: its text is not lost", () => {
	// 36 columns: half is 18, and Service needs 19 + 4 = 23
	const t = tableBlock(COLS, ROWS, 36, { minCol: 12, pin: [0] });
	assert.equal(t.frozen, 0);
	assert.ok(text(t.block).includes("billing-api-gateway"), text(t.block));
	assert.ok(!text(t.block).includes("…"));
});

test("a scrolling table cuts no cell: a long note is there whole, to be scrolled to", () => {
	for (const pin of [undefined, [], [0], [1], [2], [0, 2]]) {
		const t = tableBlock(COLS, ROWS, 40, { minCol: 12, ...(pin ? { pin } : {}) });
		assert.ok(t.block.w > 40, "it has to scroll");
		assert.ok(text(t.block).includes(NOTE), `pin ${JSON.stringify(pin)}:\n${text(t.block)}`);
		assert.ok(!text(t.block).includes("…"), `pin ${JSON.stringify(pin)}`);
	}
});

test("a cell as long as a cell can be (300 characters) is whole too", () => {
	const long = "w".repeat(300);
	// six columns: their minimums do not fit 40 columns, so the table scrolls
	const cols = ["a", "b", "c", "d", "e", "f"];
	const t = tableBlock(cols, [[long, "xxxxxxxxxxxx", "yyyyyyyyyyyy", "zzzzzzzzzzzz", "uuuuuuuuuuuu", "vvvvvvvvvvvv"]], 40, { minCol: 12 });
	assert.ok(t.block.w > 40);
	assert.ok(text(t.block).includes(long));
});

test("random tables, widths and pins: whenever it scrolls, every cell is whole in the block, and pins never exceed half", () => {
	const r = rng(23);
	for (let i = 0; i < 400; i++) {
		const n = 2 + Math.floor(r() * 8);
		const cols = Array.from({ length: n }, (_, k) => `Col${k}`);
		const rows = Array.from({ length: 1 + Math.floor(r() * 3) }, () => cols.map((_, k) => `v${k}-` + "x".repeat(Math.floor(r() * 60))));
		const width = 20 + Math.floor(r() * 100);
		const pin = r() < 0.3 ? undefined : Array.from({ length: Math.floor(r() * (n + 1)) }, () => Math.floor(r() * n));
		const t = tableBlock(cols, rows, width, { minCol: 4 + Math.floor(r() * 20), ...(pin ? { pin } : {}) });
		const label = JSON.stringify({ n, width, pin, w: t.block.w, frozen: t.frozen });
		if (pin === undefined) assert.equal(t.frozen, 0, label);
		if (t.frozen) assert.ok(t.frozen <= Math.floor(width / 2), label);
		if (t.block.w > width) {
			const all = text(t.block);
			for (const row of rows) for (const cell of row) assert.ok(all.includes(cell), `${JSON.stringify(cell)} is whole: ${label}`);
			assert.ok(!all.includes("…"), label);
		}
	}
});

const q = JSON.stringify;
const draw = (pin: string, width: number, pan: number) => {
	const c = compile(`root = Stack([t])\nt = Table(${q(COLS)}, ${q(ROWS)}, ${pin})`);
	assert.deepEqual(c.errors, [], c.errors.join("|"));
	const state = newState();
	const cfg = { settings: { tableMinCol: 12, scrollStep: 8 } };
	const first = renderTree(c.root!, width, state, cfg);
	const bar = first.block.targets.find((t) => t.kind === "pan");
	if (!bar) return { block: first.block, bar: undefined };
	state.pan[bar.scroll!.key] = pan;
	return { block: renderTree(c.root!, width, state, cfg).block, bar };
};

test("through the renderer: with no pin, or a pin that does not fit, scrolling reaches every character of the table", () => {
	for (const pin of ["null", "null, []", "null, [\"Service\"]", "null, [\"Notes\"]"]) {
		const { bar } = draw(pin, 36, 0);
		assert.ok(bar, `${pin}: it scrolls`);
		const sc = bar!.scroll!;
		const windows: string[] = [];
		for (let p = 0; p <= sc.total - sc.view; p++) windows.push(text(draw(pin, 36, p).block));
		const seen = windows.join("\n");
		for (const cell of [...ROWS.flat(), ...COLS]) {
			// a cell wider than the pane is read in pieces as it goes by: every 12-character stretch is whole in some window
			for (let i = 0; i + 12 <= Math.min(cell.length, 12 * 20); i += 6) assert.ok(seen.includes(cell.slice(i, i + 12)), `${pin}: "${cell.slice(i, i + 12)}" never appears`);
			if (cell.length <= 20) assert.ok(seen.includes(cell), `${pin}: "${cell}" is never whole`);
		}
	}
});

test("the end of the scroll is the end of the table: the last column's last cell is on screen", () => {
	const { bar } = draw("null", 36, 0);
	const sc = bar!.scroll!;
	const last = text(draw("null", 36, sc.total - sc.view).block);
	assert.ok(last.includes("down 8d"), last);
});
