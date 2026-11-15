// The pan maths and the bar row (src/blocks/pan.ts). Pure: no widget, no terminal.
import assert from "node:assert/strict";
import { test } from "node:test";
import { barLayout, barRow, clampPan, panFromTrack, panStep, stepPan, thumbCells } from "../src/blocks/pan.ts";
import { rng } from "./helpers.ts";

const text = (cells: Array<{ ch: string }>) => cells.map((c) => c.ch).join("");

test("a step is three quarters of the view, at least one column", () => {
	assert.equal(panStep(63), 47);
	assert.equal(panStep(1), 1);
	assert.equal(panStep(0), 1);
});

test("the pan offset is kept inside 0..total-view", () => {
	assert.equal(clampPan(-5, 175, 63), 0);
	assert.equal(clampPan(500, 175, 63), 112);
	assert.equal(clampPan(3, 50, 63), 0, "a block that fits has nothing to pan");
});

test("the thumb is as long as the view is of the whole, and ends where the track ends", () => {
	assert.deepEqual(thumbCells(20, 0, 175, 63), { start: 0, len: 7 });
	const end = thumbCells(20, 112, 175, 63);
	assert.equal(end.start + end.len, 20);
	assert.equal(thumbCells(20, 0, 1_000_000, 10).len, 1, "never vanishes");
});

test("a click on the track centres the thumb there", () => {
	const track = { x: 3, w: 20 };
	assert.equal(panFromTrack(track.x, track, 175, 63), 0);
	assert.equal(panFromTrack(track.x + track.w - 1, track, 175, 63), 112);
	assert.ok(Math.abs(panFromTrack(track.x + 10, track, 175, 63) - 56) <= 8, "the middle is about the middle");
});

test("a step moves by three quarters of the view, or to a column edge when there are edges", () => {
	assert.equal(stepPan(0, 1, 175, 63), 47);
	assert.equal(stepPan(150, 1, 175, 63), 112);
	assert.equal(stepPan(10, -1, 175, 63), 0);
	const edges = [0, 15, 30, 45, 60, 75];
	assert.equal(stepPan(0, 1, 200, 40, edges), 30);
	assert.equal(stepPan(30, 1, 200, 40, edges), 60);
	assert.equal(stepPan(60, -1, 200, 40, edges), 30, "the farthest edge within the step, so a left tap undoes a right tap");
	assert.equal(stepPan(20, 1, 200, 40, [0]), 50, "no edge in range: the plain step");
});

test("the bar is one row exactly as wide as asked, with both arrows and the range", () => {
	const row = barRow(60, 0, 175, 59);
	assert.equal(row.length, 60);
	const s = text(row);
	assert.ok(s.includes("‹") && s.includes("›"), s);
	assert.ok(s.includes("1–59/175"), s);
	assert.equal(barRow(24, 0, 100, 22).length, 24);
	const l = barLayout(60, 0, 175, 59);
	assert.deepEqual([l.pageLeft!.x, l.left.x, l.left.w, l.right.x, l.right.w, l.pageRight!.x], [0, 3, 3, 54, 3, 57]);
	assert.ok(l.track.x >= 6 && l.track.x + l.track.w <= 54);
});

test("an arrow that cannot move is dim, the other is a button", () => {
	const atStart = barRow(60, 0, 175, 59);
	assert.equal(atStart[4].role, "text.muted", "the fine ‹");
	assert.equal(atStart[55].role, "btn", "the fine ›");
	const atEnd = barRow(60, 116, 175, 59);
	assert.equal(atEnd[55].role, "text.muted");
	assert.equal(atEnd[4].role, "btn");
});

test("a narrow bar drops the label before it drops the track", () => {
	const l = barLayout(20, 0, 100, 18);
	assert.equal(l.label, "");
	assert.ok(l.track.w >= 6);
});

test("random offsets: the thumb stays in the track and clamping is idempotent", () => {
	const r = rng(7);
	for (let i = 0; i < 500; i++) {
		const view = 1 + Math.floor(r() * 120);
		const total = view + Math.floor(r() * 400);
		const pan = Math.floor(r() * 600) - 100;
		const track = 4 + Math.floor(r() * 60);
		const p = clampPan(pan, total, view);
		assert.equal(clampPan(p, total, view), p);
		const t = thumbCells(track, p, total, view);
		assert.ok(t.start >= 0 && t.len >= 1 && t.start + t.len <= track, `${JSON.stringify({ track, p, total, view, t })}`);
		const s = stepPan(p, 1, total, view);
		assert.ok(s >= p && s <= Math.max(0, total - view));
	}
});

test("the bar never throws and is always as wide as asked, whatever the width (a table inside a narrow card)", () => {
	for (let width = 1; width <= 40; width++) {
		for (const [pan, total, view] of [[0, 100, width], [10, 100, width], [0, width + 1, width], [3, 5000, width]] as const) {
			const row = barRow(width, pan, total, view);
			assert.equal(row.length, width, `width ${width}`);
			const l = barLayout(width, pan, total, view);
			assert.ok(l.track.w >= 0);
		}
	}
});
