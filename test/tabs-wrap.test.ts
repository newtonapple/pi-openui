// A tab bar that does not fit the pane wraps onto more rows. It used to cut every label shorter until it fit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { activate, targetAt, type Env } from "../src/blocks/interact.ts";
import { renderTree } from "../src/blocks/render.ts";
import { newState } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";

const SRC = `root = Stack([t])
t = Tabs([a,b,c,d,e,f])
a = TabItem("Infrastructure map", [x1])
b = TabItem("Inventory table", [x2])
c = TabItem("Services and ports", [x3])
d = TabItem("Alerts", [x4])
e = TabItem("Deployments history", [x5])
f = TabItem("Settings", [x6])
x1 = Text("content one")
x2 = Text("content two")
x3 = Text("content three")
x4 = Text("content four")
x5 = Text("content five")
x6 = Text("content six")`;
const LABELS = ["Infrastructure map", "Inventory table", "Services and ports", "Alerts", "Deployments history", "Settings"];
class Scene {
	state = newState();
	root;
	block!: ReturnType<typeof renderTree>["block"];
	width: number;
	constructor(width: number) {
		this.width = width;
		const c = compile(SRC);
		assert.deepEqual(c.errors, []);
		this.root = c.root!;
		this.draw();
	}
	draw() {
		this.block = renderTree(this.root, this.width, this.state).block;
	}
	get text() {
		return rowsToLines(this.block.rows).join("\n");
	}
}

test("tabs that do not fit wrap onto more rows: every label is whole", () => {
	for (const width of [24, 30, 40, 60]) {
		const s = new Scene(width);
		assert.ok(!s.text.includes("…"), `${width}: nothing is cut\n${s.text}`);
		for (const l of LABELS) assert.ok(s.text.includes(l), `${width}: ${l}`);
		assert.ok(s.text.includes("content one"), "the content of the first tab is under the bar");
	}
});

test("when the bar fits it is the one bar it always was", () => {
	const wide = new Scene(140);
	const tabs = wide.block.targets.filter((t) => t.kind === "tab");
	assert.equal(new Set(tabs.map((t) => t.rect.y)).size, 1, "all tabs on one row");
	assert.ok(wide.text.split("\n")[1].includes("Infrastructure map") && wide.text.split("\n")[1].includes("Settings"), wide.text);
});

test("wrapped tabs are still tabs: every one is a target inside the pane, and a tap selects it", () => {
	const s = new Scene(34);
	const tabs = s.block.targets.filter((t) => t.kind === "tab");
	assert.equal(tabs.length, 6);
	assert.ok(new Set(tabs.map((t) => t.rect.y)).size > 1, "on more than one row");
	for (const t of tabs) assert.ok(t.rect.x >= 0 && t.rect.x + t.rect.w <= 34, `${t.label} is inside: ${JSON.stringify(t.rect)}`);
	const last = tabs.find((t) => t.label === "Settings")!;
	const env: Env = { send() {}, copy() {}, note() {} };
	const hit = targetAt(s.block, last.rect.x + 1, last.rect.y)!;
	assert.equal(hit.label, "Settings");
	assert.ok(activate(hit, s.state, env));
	s.draw();
	assert.ok(s.text.includes("content six"), s.text);
	assert.ok(!s.text.includes("content one"));
});

test("a single label wider than the pane is the only thing that is cut", () => {
	const src = `root = Stack([t])\nt = Tabs([a,b])\na = TabItem("A label that is much much wider than this narrow pane", [x])\nb = TabItem("B", [x])\nx = Text("hi")`;
	const c = compile(src);
	const { block } = renderTree(c.root!, 24, newState());
	for (const row of block.rows) assert.ok(row.length <= 24);
	assert.ok(block.targets.filter((t) => t.kind === "tab").every((t) => t.rect.x + t.rect.w <= 24));
});
