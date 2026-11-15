// The gesture recognizer: what a pointer does to a clipped block. Events in, actions out; no terminal.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Recognizer, type MouseIn } from "../src/blocks/gesture.ts";
import { renderTree } from "../src/blocks/render.ts";
import { newState, type Block, type Target } from "../src/blocks/types.ts";
import { compile } from "../src/lang/library.ts";

const table = (cols: number) => {
	const heads = Array.from({ length: cols }, (_, i) => `"H${i}"`).join(",");
	const row = Array.from({ length: cols }, () => `"twelve-chars"`).join(",");
	return `root = Stack([t])\nt = Table([${heads}], [[${row}],[${row}]])`;
};
function scene(width = 50) {
	const c = compile(table(16));
	assert.deepEqual(c.errors, []);
	const state = newState();
	const block: Block = renderTree(c.root!, width, state).block;
	const part = (p: string) => block.targets.find((t) => t.kind === "pan" && t.scroll!.part === p)!;
	const key = part("track").scroll!.key;
	return { block, state, key, part, r: new Recognizer(), total: part("track").scroll!.total, view: width };
}
const ev = (type: string, button: string, x: number, y: number, extra: Partial<MouseIn> = {}): MouseIn => ({ type, button, x, y, shift: false, alt: false, ...extra });
const centre = (t: Target) => ({ x: t.rect.x + Math.floor(t.rect.w / 2), y: t.rect.y });

test("a horizontal wheel over a clipped block pans by three: button none is right, button right is left", () => {
	const s = scene();
	const right = s.r.feed(ev("press", "none", 5, 1), s.block, s.state.pan);
	assert.deepEqual(right, { kind: "pan", key: s.key, to: 3 });
	s.state.pan[s.key] = 3;
	assert.deepEqual(s.r.feed(ev("press", "right", 5, 1), s.block, s.state.pan), { kind: "pan", key: s.key, to: 0 });
	assert.deepEqual(s.r.feed(ev("press", "right", 5, 1), s.block, s.state.pan), { kind: "pan", key: s.key, to: 0 }, "clamped at the start");
});

test("a horizontal wheel below the block is nothing, and does not make the next tap special", () => {
	const s = scene();
	assert.deepEqual(s.r.feed(ev("press", "none", 5, s.block.rows.length + 4), s.block, s.state.pan), { kind: "none" });
	assert.equal(s.r.stuck, false);
});

test("shift or alt with the wheel pans by three; the plain wheel is left to the transcript", () => {
	const s = scene();
	assert.deepEqual(s.r.feed(ev("wheel", "none", 5, 1, { shift: true, wheelDelta: 1 }), s.block, s.state.pan), { kind: "pan", key: s.key, to: 3 });
	assert.deepEqual(s.r.feed(ev("wheel", "none", 5, 1, { alt: true, wheelDelta: 4 }), s.block, s.state.pan), { kind: "pan", key: s.key, to: 3 });
	assert.deepEqual(s.r.feed(ev("wheel", "none", 5, 1, { shift: true, wheelDelta: -1 }), s.block, s.state.pan), { kind: "pan", key: s.key, to: 0 });
	assert.deepEqual(s.r.feed(ev("wheel", "none", 5, 1, { wheelDelta: 1 }), s.block, s.state.pan), { kind: "none" });
	assert.deepEqual(s.r.feed(ev("wheel", "none", 5, s.block.rows.length + 4, { shift: true, wheelDelta: 1 }), s.block, s.state.pan), { kind: "none" }, "not over a clipped block");
});

test("the thumb: a press on the track places it, a drag moves it, a release lets go", () => {
	const s = scene();
	const track = s.part("track").rect;
	const y = track.y;
	const down = s.r.feed(ev("press", "left", track.x, y), s.block, s.state.pan);
	assert.deepEqual(down, { kind: "pan", key: s.key, to: 0, capture: true });
	const drag = s.r.feed(ev("drag", "left", track.x + track.w - 1, y), s.block, s.state.pan);
	assert.deepEqual(drag, { kind: "pan", key: s.key, to: s.total - s.view, capture: true });
	assert.deepEqual(s.r.feed(ev("release", "left", track.x + track.w - 1, y), s.block, s.state.pan), { kind: "none" });
	assert.deepEqual(s.r.feed(ev("drag", "left", track.x, y), s.block, s.state.pan), { kind: "none" }, "after the release a drag is nothing");
});

test("a flick leaves pi with a press it never released: the next tap is recognised here, once", () => {
	const s = scene();
	assert.equal(s.r.feed(ev("press", "none", 5, 1), s.block, s.state.pan).kind, "pan");
	assert.equal(s.r.stuck, true);
	const c = centre(s.part("right"));
	assert.deepEqual(s.r.feed(ev("press", "left", c.x, c.y), s.block, s.state.pan), { kind: "none" });
	assert.deepEqual(s.r.feed(ev("release", "left", c.x, c.y), s.block, s.state.pan), { kind: "tap", x: c.x, y: c.y });
	assert.equal(s.r.stuck, false, "pi has seen a release: it is healthy again");
	assert.deepEqual(s.r.feed(ev("click", "left", c.x, c.y), s.block, s.state.pan), { kind: "swallow" }, "a click that still follows is not a second tap");
	// the same cell tapped later, after its own press, is a real click
	s.r.feed(ev("press", "left", c.x, c.y), s.block, s.state.pan);
	s.r.feed(ev("release", "left", c.x, c.y), s.block, s.state.pan);
	assert.deepEqual(s.r.feed(ev("click", "left", c.x, c.y), s.block, s.state.pan), { kind: "none" });
});

test("a press and a release on different cells after a flick is a drag, not a tap", () => {
	const s = scene();
	s.r.feed(ev("press", "none", 5, 1), s.block, s.state.pan);
	s.r.feed(ev("press", "left", 10, 1), s.block, s.state.pan);
	assert.deepEqual(s.r.feed(ev("release", "left", 20, 1), s.block, s.state.pan), { kind: "none" });
	assert.equal(s.r.stuck, false);
});

test("without a flick a tap is left to pi's click: nothing here acts", () => {
	const s = scene();
	const c = centre(s.part("right"));
	for (const e of [ev("press", "left", c.x, c.y), ev("release", "left", c.x, c.y), ev("click", "left", c.x, c.y)]) {
		assert.deepEqual(s.r.feed(e, s.block, s.state.pan), { kind: "none" }, e.type);
	}
});

test("a click clears the flick flag, and reset forgets everything", () => {
	const s = scene();
	s.r.feed(ev("press", "none", 5, 1), s.block, s.state.pan);
	assert.deepEqual(s.r.feed(ev("click", "left", 7, 1), s.block, s.state.pan), { kind: "none" });
	assert.equal(s.r.stuck, false);
	s.r.feed(ev("press", "none", 5, 1), s.block, s.state.pan);
	s.r.reset();
	assert.equal(s.r.stuck, false);
});
