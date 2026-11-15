// Pinned columns: the columns the model names stay in place while a table that is wider than the pane scrolls. They never take
// more than half the pane, so there is always something to scroll.
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTree } from "../src/blocks/render.ts";
import { PIN_SHARE, pinBudget } from "../src/blocks/pan.ts";
import { tableBlock } from "../src/blocks/table.ts";
import { newState, type Block } from "../src/blocks/types.ts";
import { rowsToLines, textWidth } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";
import { rng } from "./helpers.ts";

const COLS = ["Host", "OS", "Role", "Tailnet IP", "State"];
const ROWS = [
	["dgx-spark", "Ubuntu 24.04", "Gateway host, LiteLLM", "100.76.148.76", "up"],
	["dgx-spark2", "Ubuntu 24.04", "Cluster TP=2 node A", "100.87.121.4", "up"],
	["divi-pc-ubuntu", "Ubuntu 24.04", "RTX 5090 workstation", "100.68.119.2", "down 8d"],
	["davids-macbook", "macOS", "Control plane; llm-ctl", "100.123.55.118", "up"],
];
const q = JSON.stringify;
const tb = (width: number, pin?: number[], minCol = 12, cols = COLS, rows = ROWS) => tableBlock(cols, rows, width, { minCol, ...(pin ? { pin } : {}) });
const plain = (b: Block) => rowsToLines(b.rows);

test("the pinned share is half the pane", () => {
	assert.equal(PIN_SHARE, 0.5);
	assert.equal(pinBudget(63), 31);
	assert.equal(pinBudget(20), 10);
});

test("with no pin nothing is pinned: the model decides, and the whole table scrolls", () => {
	const t = tb(63);
	assert.deepEqual(t.order, [0, 1, 2, 3, 4]);
	assert.equal(t.frozen, 0);
	const one = tb(63, [0]);
	assert.equal(one.frozen, 18, "asked for, the first column is pinned: Host is 14 wide, plus its borders and padding");
});

test("a pinned column that is not the first is drawn first while the table scrolls", () => {
	const t = tb(63, [4]);
	assert.deepEqual(t.order, [4, 0, 1, 2, 3]);
	assert.equal(t.frozen, 11);
	assert.match(plain(t.block)[1], /^│ State +│ Host/);
});

test("two pins stay in the order they have in the table, whatever order they were listed in", () => {
	for (const pin of [[0, 4], [4, 0]]) {
		const t = tb(63, pin);
		assert.deepEqual(t.order, [0, 4, 1, 2, 3], JSON.stringify(pin));
		assert.equal(t.frozen, 1 + 14 + 3 + 7 + 3);
	}
});

test("a pin that would take more than half the pane is skipped, and a later one that fits still goes in", () => {
	// 63 columns: half is 31. Host (14) and State (7) fit together in 28; the 14-wide address does not fit after them.
	const t = tb(63, [0, 3, 4]);
	assert.deepEqual(t.order, [0, 4, 1, 2, 3]);
	assert.equal(t.frozen, 28);
	assert.ok(t.frozen <= pinBudget(63));
});

test("pins are considered in the order listed: the first one named wins the room", () => {
	const t = tb(63, [3, 0]);
	assert.deepEqual(t.order, [3, 0, 1, 2, 4], "the address is pinned, Host (which would not fit after it) is not");
	assert.equal(t.frozen, 18);
});

test("a pinned column that is too wide to pin is skipped, never squeezed: squeezed text could not be scrolled to", () => {
	// 40 columns: half is 20. Role is 22 wide (26 with its borders): it does not fit, at its natural width or any other
	const t = tb(40, [2]);
	assert.deepEqual(t.order, [0, 1, 2, 3, 4]);
	assert.equal(t.frozen, 0);
	assert.equal(t.anchors.cols[2].w, 22, "the whole column");
});

test("an empty pin pins nothing, and the order is the one written", () => {
	const t = tb(63, []);
	assert.deepEqual(t.order, [0, 1, 2, 3, 4]);
	assert.equal(t.frozen, 0);
});

test("a table that fits is drawn in the order written, whatever is pinned", () => {
	const plainTable = tb(200);
	const pinned = tb(200, [4]);
	assert.deepEqual(pinned.order, [0, 1, 2, 3, 4]);
	assert.deepEqual(plain(pinned.block), plain(plainTable.block));
	const shrunk = tb(80, [4]);
	assert.deepEqual(shrunk.order, [0, 1, 2, 3, 4], "squeezed to fit, but it fits: no reordering");
});

test("without a minimum width (the old rule that never scrolls) nothing is reordered", () => {
	const t = tableBlock(COLS, ROWS, 30, { pin: [4] });
	assert.deepEqual(t.order, [0, 1, 2, 3, 4]);
});

test("pins that are out of range or repeated are ignored", () => {
	const t = tb(63, [9, -1, 0, 0]);
	assert.deepEqual(t.order, [0, 1, 2, 3, 4]);
	assert.equal(t.frozen, 18);
});

test("every column of a table with only one cannot be pinned: there would be nothing to scroll", () => {
	const t = tableBlock(["Only"], [["x".repeat(80)]], 30, { minCol: 12, pin: [0] });
	assert.equal(t.frozen, 0);
});

const draw = (src: string, width: number, pan = 0) => {
	const c = compile(src);
	assert.deepEqual(c.errors, [], c.errors.join("|"));
	const state = newState();
	const first = renderTree(c.root!, width, state, { settings: { tableMinCol: 12, scrollStep: 8 } });
	const bar = first.block.targets.find((t) => t.kind === "pan");
	if (bar) {
		state.pan[bar.scroll!.key] = pan;
		return { ...renderTree(c.root!, width, state, { settings: { tableMinCol: 12, scrollStep: 8 } }), bar };
	}
	return { ...first, bar };
};
const src = (pin: string) => `root = Stack([t])\nt = Table(${q(COLS)}, ${q(ROWS)}, ${pin})`;

test("through the renderer: the State column stays at the left whatever the scroll, with its values", () => {
	for (const pan of [0, 10, 25, 60]) {
		const { block } = draw(src('null, ["State"]'), 63, pan);
		const lines = rowsToLines(block.rows);
		assert.match(lines[1], /^│ State +│/, `pan ${pan}: ${lines[1]}`);
		assert.match(lines[3], /^│ up +│/);
		assert.match(lines[5], /^│ down 8d +│/);
	}
});

test("tooltip targets and notes follow the column to its new place", () => {
	const s = src('[tip], ["State"]') + '\ntip = Tooltip("cell:3.State", "down since the 6th")';
	const { block } = draw(s, 63, 20);
	const t = block.targets.find((x) => x.label === "cell:3.State")!;
	assert.ok(t, "the tooltip is on the State cell of row 3");
	assert.ok(t.rect.x < 11, `it is in the pinned part: ${JSON.stringify(t.rect)}`);
	const items = block.targets.filter((x) => x.kind === "item" && x.label.endsWith("State"));
	assert.ok(items.length >= 4 && items.every((i) => i.rect.x < 11), "the notes items of the State column are pinned too");
});

test("random tables, widths and pins: pinned columns never take more than half the pane, and are always visible", () => {
	const r = rng(11);
	for (let i = 0; i < 300; i++) {
		const n = 2 + Math.floor(r() * 8);
		const cols = Array.from({ length: n }, (_, k) => `H${k}`);
		const rows = Array.from({ length: 1 + Math.floor(r() * 3) }, () => cols.map(() => "x".repeat(1 + Math.floor(r() * 30))));
		const width = 20 + Math.floor(r() * 100);
		const pin = Array.from({ length: Math.floor(r() * (n + 1)) }, () => Math.floor(r() * n));
		const t = tableBlock(cols, rows, width, { minCol: 4 + Math.floor(r() * 20), pin });
		const label = JSON.stringify({ n, width, pin, frozen: t.frozen, order: t.order });
		assert.ok(t.frozen <= pinBudget(width), label);
		assert.deepEqual([...t.order].sort((a, b) => a - b), cols.map((_, k) => k), `a permutation: ${label}`);
		for (const row of t.block.rows) assert.equal(row.length, t.block.w, label);
		if (t.frozen) {
			const k = t.anchors.cols.findIndex((c) => c.x + c.w + 2 >= t.frozen);
			assert.ok(k >= 0 && t.anchors.cols[k].x + t.anchors.cols[k].w + 2 === t.frozen, `the frozen part ends at a column border: ${label}`);
			assert.ok(t.order.slice(0, k + 1).every((o, j, a) => j === 0 || o > a[j - 1]), `pinned columns keep the table's order: ${label}`);
		}
	}
});

test("wide characters in a pinned column never leave half a cell at the seam", () => {
	const cols = ["名前", "説明", "状態", "場所", "備考"];
	const rows = [["会話履歴", "会話履歴データ", "会話履歴データ", "会話履歴データ", "会話履歴データ"]];
	const s = `root = Stack([t])\nt = Table(${q(cols)}, ${q(rows)}, null, ["状態"])`;
	for (let pan = 0; pan < 60; pan += 3) {
		const { block } = draw(s, 40, pan);
		for (const row of block.rows) {
			assert.equal(row.length, block.w);
			row.forEach((c, i) => {
				if (c.ch !== "" && textWidth(c.ch) === 2) assert.equal(row[i + 1]?.ch, "", `pan ${pan}: a wide character lost its second half at ${i}`);
			});
			assert.notEqual(row[0].ch, "");
		}
	}
});
