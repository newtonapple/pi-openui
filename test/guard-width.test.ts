// The net under every component: whatever draws a block wider than its pane gets the pan bar. Today nothing does (each component
// shortens itself or scrolls on its own), but a component added tomorrow must not be cut silently by the widget.
import assert from "node:assert/strict";
import { test } from "node:test";
import { guardWidth } from "../src/blocks/render.ts";
import { newState, type Block, type Ctx } from "../src/blocks/types.ts";
import { cell } from "../src/blocks/util.ts";

const wide = (w: number): Block => ({ w, rows: [Array.from({ length: w }, (_, i) => cell(String(i % 10)))], targets: [{ id: "x", kind: "tip", rect: { x: 60, y: 0, w: 5, h: 1 }, label: "x" }] });
const ctx = (): Ctx => ({ state: newState(), warnings: [], services: {}, tabs: [], render: () => wide(1) });

test("a block that fits is returned as it is", () => {
	const b = wide(40);
	assert.equal(guardWidth(b, 40, "0.1", ctx()), b);
});

test("a block wider than its pane is cropped to it and gets a bar; its targets move with the scroll", () => {
	const c = ctx();
	const g = guardWidth(wide(100), 40, "0.1", c);
	assert.equal(g.w, 40);
	assert.ok(g.targets.some((t) => t.kind === "pan" && t.scroll!.part === "right"), "a bar");
	const x = g.targets.find((t) => t.id === "x")!;
	assert.equal(x.rect.x, 60, "60 at the start of the scroll");
	c.state.pan[g.targets.find((t) => t.kind === "pan")!.scroll!.key] = 30;
	const g2 = guardWidth(wide(100), 40, "0.1", c);
	assert.equal(g2.targets.find((t) => t.id === "x")!.rect.x, 30, "60 - 30");
});

test("two guarded blocks in different places scroll independently", () => {
	const c = ctx();
	const a = guardWidth(wide(100), 40, "0.1", c);
	const b = guardWidth(wide(100), 40, "0.2", c);
	assert.notEqual(a.targets.find((t) => t.kind === "pan")!.scroll!.key, b.targets.find((t) => t.kind === "pan")!.scroll!.key);
});
