// healWide: keep the committed table of two-cell characters, but let the running pi decide the ranges where Unicode keeps adding
// emoji. Pure: the probe is any function from a code point to a width, so none of this needs pi.
import assert from "node:assert/strict";
import { test } from "node:test";
import { healWide, PROBE_SPANS } from "../src/diagram/widefix.ts";

/** A probe that says two cells for exactly these inclusive ranges, and counts what it was asked. */
function probeOf(...wide: Array<[number, number]>) {
	const asked: number[] = [];
	const probe = (cp: number) => {
		asked.push(cp);
		return wide.some(([a, b]) => cp >= a && cp <= b) ? 2 : 1;
	};
	return { probe, asked };
}
const SPANS = [[0x100, 0x1ff]] as const;

test("a range that is wide in the probe and missing from the table is added", () => {
	const { probe } = probeOf([0x150, 0x15f]);
	assert.deepEqual(healWide([0x4e00, 0x9fff], probe, SPANS), [0x150, 0x15f, 0x4e00, 0x9fff]);
});

test("a range the table has and the probe calls narrow is removed", () => {
	const { probe } = probeOf();
	assert.deepEqual(healWide([0x150, 0x15f, 0x4e00, 0x9fff], probe, SPANS), [0x4e00, 0x9fff]);
});

test("outside the spans the table is trusted: the probe is never asked, even where it would disagree", () => {
	const { probe, asked } = probeOf([0x4e00, 0x4e10]); // would add a range outside the span if it were asked
	const out = healWide([0x2000, 0x20ff, 0x9000, 0x9fff], probe, SPANS);
	assert.deepEqual(out, [0x2000, 0x20ff, 0x9000, 0x9fff]);
	assert.ok(asked.every((cp) => cp >= 0x100 && cp <= 0x1ff), "only code points inside the span were probed");
	assert.equal(asked.length, 0x100);
});

test("a table range that crosses the edge of a span keeps its outer part and re-decides its inner part", () => {
	const { probe } = probeOf([0x1f0, 0x1ff]);
	// the table says 0x1c0..0x220 is wide; the probe agrees about 0x1f0..0x1ff only, so 0x1c0..0x1ef goes and 0x200..0x220 stays
	assert.deepEqual(healWide([0x1c0, 0x220], probe, SPANS), [0x1f0, 0x220]);
	const { probe: probe2 } = probeOf([0x100, 0x1ff]);
	assert.deepEqual(healWide([0x1c0, 0x220], probe2, SPANS), [0x100, 0x220], "and runs that touch are one range");
});

test("the result is sorted, merged where ranges touch, and healing twice changes nothing", () => {
	const { probe } = probeOf([0x120, 0x12f], [0x130, 0x13f], [0x180, 0x180]);
	const once = healWide([0x9000, 0x9fff, 0x20, 0x2f], probe, SPANS);
	assert.deepEqual(once, [0x20, 0x2f, 0x120, 0x13f, 0x180, 0x180, 0x9000, 0x9fff]);
	assert.deepEqual(healWide(once, probe, SPANS), once);
});

test("the real spans cover the blocks where emoji are added, and nothing is probed outside them", () => {
	const inSpans = (cp: number) => PROBE_SPANS.some(([a, b]) => cp >= a && cp <= b);
	for (const cp of [0x1f680, 0x1f6d9, 0x1fa8b, 0x1faf9, 0x2705, 0x26a1, 0x2b50]) assert.ok(inSpans(cp), `U+${cp.toString(16)} is covered`);
	const { probe, asked } = probeOf();
	healWide([0x4e00, 0x9fff], probe);
	assert.ok(asked.length < 8000, `${asked.length} probes: cheap enough to run when the extension loads`);
	assert.ok(asked.every(inSpans));
});
