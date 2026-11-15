// Tables on a narrow pane: a minimum column width (the user's setting), then the table scrolls sideways instead of squeezing
// every column to a few characters.
import assert from "node:assert/strict";
import { test } from "node:test";
import { activate, targetAt, type Env } from "../src/blocks/interact.ts";
import { renderTree } from "../src/blocks/render.ts";
import { tableBlock } from "../src/blocks/table.ts";
import { newState, type Block, type Target } from "../src/blocks/types.ts";
import { rowsToLines, textWidth } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";

const FLEET_COLS = ["Host", "OS", "Role", "Address", "State"];
const FLEET_ROWS = [
	["gpu-box-a", "Ubuntu 24.04", "Gateway host, HAProxy", "198.51.100.76", "up"],
	["gpu-box-a2", "Ubuntu 24.04", "Worker pool, node A", "198.51.100.4", "up"],
	["work-pc-ubuntu", "Ubuntu 24.04", "Build runner, CI #12", "198.51.100.2", "down 8d"],
	["laptop-primary", "macOS", "Control plane; ops-ctl", "198.51.100.118", "up"],
];
const q = (v: string) => JSON.stringify(v);
/** `Host` pinned: the 4th argument, with no tooltips before it */
const PIN_HOST = `, null, ["Host"]`;
const fleetSource = (extra = "") => `root = Stack([t])\nt = Table([${FLEET_COLS.map(q).join(",")}], [${FLEET_ROWS.map((r) => `[${r.map(q).join(",")}]`).join(",")}]${extra})`;
const natural = FLEET_COLS.map((h, i) => Math.max(h.length, ...FLEET_ROWS.map((r) => r[i].length)));

class Scene {
	state = newState();
	block!: Block;
	root;
	width: number;
	minCol: number | undefined;
	constructor(source: string, width: number, minCol: number | undefined) {
		this.width = width;
		this.minCol = minCol;
		const c = compile(source);
		assert.deepEqual(c.errors, []);
		this.root = c.root!;
		this.draw();
	}
	draw() {
		this.block = renderTree(this.root, this.width, this.state, this.minCol === undefined ? {} : { settings: { tableMinCol: this.minCol } }).block;
	}
	get text() {
		return rowsToLines(this.block.rows).join("\n");
	}
	get key() {
		return this.block.targets.find((t) => t.kind === "pan")?.scroll?.key ?? "";
	}
	get bar(): Target | undefined {
		return this.block.targets.find((t) => t.kind === "pan");
	}
	panTo(n: number) {
		this.state.pan[this.key] = n;
		this.draw();
	}
	find(pred: (t: Target) => boolean) {
		const t = this.block.targets.find(pred);
		assert.ok(t, `no such target; have ${this.block.targets.map((x) => `${x.kind}:${x.label}`).join(" | ")}`);
		return t!;
	}
	click(t: Target) {
		const env: Env = { send() {}, copy() {}, note() {} };
		const hit = targetAt(this.block, t.rect.x + Math.floor(t.rect.w / 2), t.rect.y);
		assert.ok(hit);
		if (activate(hit!, this.state, env)) this.draw();
	}
}

test("a table that fits at its natural width is untouched, whatever the minimum", () => {
	const small = `root = Stack([t])\nt = Table(["A","B"],[["one","two"],["three","four"]])`;
	for (const min of [undefined, 4, 12, 40]) {
		const s = new Scene(small, 60, min);
		assert.ok(!s.text.includes("‹"), "no bar");
		assert.ok(s.text.includes("│ one   │ two  │"), s.text);
	}
});

test("a markdown table keeps the old squeeze: no minimum is given, so it never grows past the pane", () => {
	const t = tableBlock(FLEET_COLS, FLEET_ROWS, 40);
	assert.ok(t.block.w <= 40, `${t.block.w}`);
	const many = tableBlock(Array.from({ length: 16 }, (_, i) => `H${i}`), [Array.from({ length: 16 }, () => "twelve-chars")], 50);
	assert.equal(many.block.w, 97, "16 columns at the old floor of three: as wide as ever, no wider");
});

test("the fleet table at 63 columns with a minimum of 12 scrolls: no column is narrower than 12 (or its own width)", () => {
	const s = new Scene(fleetSource(), 63, 12);
	assert.ok(s.bar, "the floors (12,12,12,12,7 and 16 of borders) do not fit 63 columns, so there is a bar");
	const cols = tableBlock(FLEET_COLS, FLEET_ROWS, 63, { minCol: 12 }).anchors.cols;
	cols.forEach((c, i) => assert.ok(c.w >= Math.min(natural[i], 12), `column ${i} is ${c.w} wide`));
	assert.ok(tableBlock(FLEET_COLS, FLEET_ROWS, 63, { minCol: 12 }).block.w > 63);
	assert.ok(s.block.rows.every((r) => r.length === s.block.w) && s.block.w === 63);
	assert.ok(!s.text.includes("198.51.100.76"), "at the left edge the address is out of view");
	// scroll to the IP column: the address is whole
	s.panTo(tableBlock(FLEET_COLS, FLEET_ROWS, 63, { minCol: 12 }).edges[3]); // the IP column's border: nothing is pinned, the whole table scrolls
	assert.ok(s.text.includes("198.51.100.76") && s.text.includes("198.51.100.118"), s.text);
});

test("with a minimum of 10 the same table at 63 columns fits and shows no bar", () => {
	const s = new Scene(fleetSource(), 63, 10);
	assert.ok(!s.bar, s.text);
	const cols = tableBlock(FLEET_COLS, FLEET_ROWS, 63, { minCol: 10 }).anchors.cols;
	cols.forEach((c, i) => assert.ok(c.w >= Math.min(natural[i], 10)));
	assert.ok(cols.every((c) => c.w >= 7));
});

test("a table that scrolls cuts no cell, however long: the minimum only decides when it starts to scroll", () => {
	const long = "x".repeat(60);
	const src = `root = Stack([t])\nt = Table(["Name","Note"],[["a","${long}"]])`;
	const s = new Scene(src, 30, 40);
	const t = tableBlock(["Name", "Note"], [["a", long]], 30, { minCol: 40 });
	assert.equal(t.anchors.cols[1].w, 60, "the whole cell");
	assert.ok(t.block.w > 30);
	assert.ok(!rowsToLines(t.block.rows).join("\n").includes("…"));
	assert.ok(s.bar);
	const small = tableBlock(["Name", "Note"], [["a", long]], 20, { minCol: 12 }); // the minimums do not fit 20 columns
	assert.equal(small.anchors.cols[1].w, 60, "at any minimum");
	const squeezed = tableBlock(["Name", "Note"], [["a", long]], 80, { minCol: 12 }); // 60 + 4 fits 80 only by cutting it a little: it fits without scrolling
	assert.ok(squeezed.block.w <= 80);
});

test("a minimum of 4 never squeezes a column under 4", () => {
	const t = tableBlock(["Alpha", "Beta", "Gamma"], [["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"]], 30, { minCol: 4 });
	assert.ok(t.anchors.cols.every((c) => c.w >= 4));
	assert.ok(t.block.w <= 30);
});

test("edges: the left border of every column, in block cells, so a tap can land on one", () => {
	const t = tableBlock(FLEET_COLS, FLEET_ROWS, 63, { minCol: 12 });
	assert.equal(t.edges.length, FLEET_COLS.length);
	assert.equal(t.edges[0], 0);
	t.edges.forEach((e, i) => assert.equal(rowsToLines([t.block.rows[1]])[0].replace(/\x1b\[[0-9;]*m/g, "")[e], "│", `column ${i} starts at a border`));
});

test("a tap on the page arrow lands on a column edge, and on the fine arrow it does not have to", () => {
	const fine = new Scene(fleetSource(), 63, 12);
	fine.click(fine.find((t) => t.kind === "pan" && t.scroll!.part === "right"));
	assert.equal(fine.state.pan[fine.key], 8, "a fine step is a few cells wherever they fall");
	const s = new Scene(fleetSource(), 63, 12);
	s.click(s.find((t) => t.kind === "pan" && t.scroll!.part === "pageright"));
	const edges = s.bar!.scroll!.edges!;
	const at = s.state.pan[s.key];
	assert.ok(edges.includes(at) || at === s.bar!.scroll!.total - s.bar!.scroll!.view, `${at} is one of ${edges}, or the end`);
});

test("tooltip targets follow the columns when the table scrolls", () => {
	const src = fleetSource(`, [tip]`) + `\ntip = Tooltip("cell:2.Address", "the address", "Reachable over the VPN only.")`;
	const s = new Scene(src, 63, 12);
	s.panTo(tableBlock(FLEET_COLS, FLEET_ROWS, 63, { minCol: 12 }).edges[3]);
	const cell = s.find((t) => t.label === "cell:2.Address");
	assert.ok(cell.rect.x >= 0 && cell.rect.x + cell.rect.w <= 63, `${JSON.stringify(cell.rect)}`);
	s.click(cell);
	assert.ok(s.text.includes("Reachable over the VPN only."), s.text);
});

test("wide characters at the crop edge never leave half a cell", () => {
	const src = `root = Stack([t])\nt = Table(["名前","説明","状態","場所","備考","種類"],[["会話履歴データ","会話履歴データ","会話履歴データ","会話履歴データ","会話履歴データ","会話履歴データ"]])`;
	const s = new Scene(src, 40, 12);
	assert.ok(s.bar);
	const max = s.bar!.scroll!.total - s.bar!.scroll!.view;
	for (let pan = 0; pan <= max; pan++) {
		s.panTo(pan);
		for (const row of s.block.rows) {
			assert.equal(row.length, s.block.w);
			assert.notEqual(row[0].ch, "", `pan ${pan}: a row starts with half a character`);
			row.forEach((c, i) => {
				if (c.ch !== "" && textWidth(c.ch) === 2) assert.equal(row[i + 1]?.ch, "", `pan ${pan}: a wide character lost its second half`);
			});
		}
	}
});

// ---- the first column stays while the rest scrolls

import { panBlock } from "../src/blocks/diagrams.ts";
import { reveal } from "../src/blocks/interact.ts";
import { cell } from "../src/blocks/util.ts";

const plain = (row: Block["rows"][number]) => rowsToLines([row])[0];
const rowsOf = (b: Block) => b.rows.map(plain);

test("pinned column: the pinned column stays, the rest is what was at that offset", () => {
	const s = new Scene(fleetSource(PIN_HOST), 63, 12);
	const full = tableBlock(FLEET_COLS, FLEET_ROWS, 63, { minCol: 12, pin: [0] });
	const F = full.frozen;
	assert.equal(F, 18, "the first column (14) plus its borders and padding");
	const fullRows = rowsOf(full.block);
	for (const pan of [0, 7, 20]) {
		s.panTo(pan);
		const shown = rowsOf(s.block);
		fullRows.forEach((want, y) => {
			const expected = Array.from(want).slice(0, F).join("") + Array.from(want).slice(F + pan, pan + 63).join("");
			assert.equal(shown[y].trimEnd(), expected.trimEnd(), `row ${y} at pan ${pan}`);
		});
	}
	s.panTo(20);
	assert.ok(s.text.split("\n")[1].startsWith("│ Host           │"), s.text);
	assert.ok(s.text.split("\n")[6].startsWith("│ laptop-primary │"), s.text);
});

test("pinned column: at the start the picture is the plain crop", () => {
	const s = new Scene(fleetSource(PIN_HOST), 63, 12);
	const full = tableBlock(FLEET_COLS, FLEET_ROWS, 63, { minCol: 12, pin: [0] });
	s.panTo(0);
	rowsOf(full.block).forEach((want, y) => assert.equal(rowsOf(s.block)[y].trimEnd(), Array.from(want).slice(0, 63).join("").trimEnd()));
});

test("pinned column: a pin wider than half the view is skipped, and the whole table scrolls", () => {
	const src = `root = Stack([t])\nt = Table(["Name","A","B","C"],[["${"n".repeat(30)}","a","b","c"]], null, ["Name"])`;
	const s = new Scene(src, 63, 20);
	const full = tableBlock(["Name", "A", "B", "C"], [["n".repeat(30), "a", "b", "c"]], 63, { minCol: 20, pin: [0] });
	assert.equal(full.frozen, 0, "34 cells of 63 is more than half");
	if (!s.bar) return; // it fitted: nothing to pin
	s.panTo(5);
	const want = rowsOf(full.block).map((r) => Array.from(r).slice(5, 5 + 63).join("").trimEnd());
	assert.deepEqual(rowsOf(s.block).slice(0, want.length).map((r) => r.trimEnd()), want);
});

test("pinned column: targets and badges follow the columns and never sit on the pinned one", () => {
	const src = fleetSource(`, [t1, t2, t3], ["Host"]`) + `\nt1 = Tooltip("cell:1.Host", "first column")\nt2 = Tooltip("cell:1.Role", "partly hidden")\nt3 = Tooltip("cell:1.Address", "an address")`;
	const s = new Scene(src, 63, 12);
	const F = 18;
	s.panTo(20);
	const host = s.find((t) => t.label === "cell:1.Host");
	assert.equal(host.rect.x, 2, "the frozen column's target has not moved");
	const role = s.find((t) => t.label === "cell:1.Role");
	assert.equal(role.rect.x, F, "the part of Role that is still visible starts at the frozen edge");
	assert.ok(role.rect.x + role.rect.w > F);
	assert.equal(targetAt(s.block, 20, 3)?.label, "cell:1.Role", "under the pointer: the visible part of Role");
	assert.notEqual(targetAt(s.block, 10, 3)?.label, "cell:1.Role");
	const ip = s.find((t) => t.label === "cell:1.Address");
	const ipX = tableBlock(FLEET_COLS, FLEET_ROWS, 63, { minCol: 12 }).anchors.cols[3].x;
	assert.equal(ip.rect.x, ipX - 20, "a column right of the edge moves by exactly the pan");
	// the frozen column's text is intact: no badge was drawn over it
	assert.ok(rowsOf(s.block)[3].startsWith("│ gpu-box-a"), rowsOf(s.block)[3]);
	s.panTo(0);
	s.draw();
	const hostText = rowsOf(s.block)[3].slice(0, F);
	assert.ok(hostText.includes("gpu-box-a"));
});

test("pinned column: a notes item for a hidden cell is not offered, one for a visible cell moves with its column", () => {
	const s = new Scene(fleetSource(PIN_HOST), 63, 12);
	const items = () => s.block.targets.filter((t) => t.kind === "item" && /row 1, /.test(t.label));
	s.panTo(0);
	const at0 = items().map((t) => t.label);
	s.panTo(20);
	const at20 = items();
	const host = at20.find((t) => t.label.endsWith("Host"))!;
	assert.equal(host.rect.x, 2, "the frozen column's item stays put");
	const state = at20.map((t) => t.label);
	assert.ok(!state.some((l) => l.endsWith("OS")), `OS is entirely behind the frozen column: ${state}`);
	assert.ok(at0.some((l) => l.endsWith("OS")), `and was there at the start: ${at0}`);
	const ip = at20.find((t) => t.label.endsWith("Address"))!;
	assert.equal(ip.rect.x, tableBlock(FLEET_COLS, FLEET_ROWS, 63, { minCol: 12 }).anchors.cols[3].x - 20);
});

test("pinned column: a block with its own targets (panBlock on its own)", () => {
	const rows = Array.from({ length: 3 }, () => Array.from({ length: 100 }, (_, i) => cell(String(i % 10))));
	const inner: Block = {
		w: 100,
		rows,
		targets: [
			{ id: "a", kind: "tip", rect: { x: 2, y: 0, w: 5, h: 1 }, label: "a" },
			{ id: "row", kind: "tip", rect: { x: 0, y: 1, w: 100, h: 1 }, label: "row" },
			{ id: "m", kind: "tip", rect: { x: 60, y: 0, w: 10, h: 1 }, label: "m" },
		],
	};
	const state = newState();
	const ctx: any = { state, warnings: [], services: {}, tabs: [], render: () => inner };
	const at = (pan: number) => {
		state.pan.k = pan;
		return panBlock(inner, 40, "k", ctx, { frozen: 10 });
	};
	let b = at(0);
	assert.equal(b.targets.find((t) => t.id === "a")!.rect.x, 2);
	assert.equal(b.targets.find((t) => t.id === "a")!.pan, undefined, "always visible: nothing to reveal");
	assert.equal(b.targets.find((t) => t.id === "row")!.rect.x, 0, "a row across the frozen part stays");
	assert.equal(b.targets.find((t) => t.id === "m")!.pan!.min, 10);
	b = at(55);
	const m = b.targets.find((t) => t.id === "m")!;
	assert.equal(m.rect.x, 5, "60 - 55");
	assert.equal(targetAt(b, 4, 0)?.id, "a", "the frozen target is where it was");
	assert.equal(targetAt(b, 7, 0), null, "x=7 is behind the frozen columns: nothing there, not the hidden half of m");
	assert.equal(targetAt(b, 12, 0)?.id, "m", "the visible part can");
	// revealing a target on the right, and one hidden on the left
	state.pan.k = 0;
	b = at(0);
	assert.equal(reveal(b.targets.find((t) => t.id === "m")!, state), true);
	assert.equal(state.pan.k, 32, "70 - 40 + 2");
	b = at(55);
	assert.equal(reveal(b.targets.find((t) => t.id === "m")!, state), true);
	assert.equal(state.pan.k, 48, "60 - 10 - 2: just right of the frozen columns");
});

test("pinned column: wide characters at the seam and at the edge never leave half a cell", () => {
	const src = `root = Stack([t])\nt = Table(["名","説明","状態","場所","備考"],[["会話","会話履歴データ","会話履歴データ","会話履歴データ","会話履歴データ"]], null, ["名"])`;
	const s = new Scene(src, 40, 12);
	assert.ok(s.bar);
	const max = s.bar!.scroll!.total - s.bar!.scroll!.view;
	for (let pan = 0; pan <= max; pan++) {
		s.panTo(pan);
		for (const row of s.block.rows) {
			assert.equal(row.length, s.block.w);
			assert.notEqual(row[0].ch, "");
			row.forEach((c, i) => {
				if (c.ch !== "" && textWidth(c.ch) === 2) assert.equal(row[i + 1]?.ch, "", `pan ${pan}: a wide character lost its second half at ${i}`);
			});
		}
	}
});

test("pinned column: a tap lands with a column border right after the frozen column, not in the middle of a column", () => {
	// 8 columns of twelve characters: 121 cells at a 60-column pane, so one step does not run into the end
	const heads = Array.from({ length: 8 }, (_, i) => `"Col${i}"`).join(",");
	const row = Array.from({ length: 8 }, () => `"twelve-chars"`).join(",");
	const s = new Scene(`root = Stack([t])\nt = Table([${heads}], [[${row}]], null, ["Col0"])`, 60, 12);
	assert.ok(s.bar);
	const F = tableBlock(Array.from({ length: 8 }, (_, i) => `Col${i}`), [Array.from({ length: 8 }, () => "twelve-chars")], 60, { minCol: 12, pin: [0] }).frozen;
	assert.equal(F, 16);
	const max = s.bar!.scroll!.total - s.bar!.scroll!.view;
	let pan = 0;
	for (let i = 0; i < 4; i++) {
		s.click(s.find((t) => t.kind === "pan" && t.scroll!.part === "pageright"));
		const at = s.state.pan[s.key];
		if (at === pan || at === max) break; // the end (or stuck): nothing to check
		pan = at;
		const header = Array.from(rowsOf(s.block)[1]);
		assert.equal(header[F], "│", `after a tap at pan ${at} the first cell right of the frozen column is ${JSON.stringify(header[F])}:\n${s.text}`);
	}
	assert.ok(pan > 0, "it did scroll");
});

test("scrolling through the fleet table shows every cell whole: nothing is cut on the way", () => {
	const s = new Scene(fleetSource(), 63, 12);
	const seen = new Set<string>();
	const max = s.bar!.scroll!.total - s.bar!.scroll!.view;
	for (let pan = 0; pan <= max; pan++) {
		s.panTo(pan);
		for (const row of rowsOf(s.block)) seen.add(row);
	}
	const all = [...seen].join("\n");
	for (const r of FLEET_ROWS) for (const cell of r) assert.ok(all.includes(cell), `"${cell}" is whole somewhere in the scroll`);
	assert.ok(!all.includes("…"), "no cell was cut");
});
