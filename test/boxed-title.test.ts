// A title sits in the top border of a box. When it does not fit there it moves inside as a wrapped heading, instead of being cut.
import assert from "node:assert/strict";
import { test } from "node:test";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { boxed, fromRows, textCells } from "../src/blocks/util.ts";
import type { Block } from "../src/blocks/types.ts";

const body = (): Block => fromRows(20, [textCells("content line", "")], [{ id: "t", kind: "tip", rect: { x: 0, y: 0, w: 5, h: 1 }, label: "t" }]);

test("a title that fits stays in the border, as it always was", () => {
	const b = boxed(body(), { role: "box", title: "short title" });
	const lines = rowsToLines(b.rows);
	assert.match(lines[0], /^╭─ short title ─+╮$/);
	assert.equal(b.rows.length, 3);
});

test("a title that does not fit moves inside, whole, wrapped; the border is plain", () => {
	const title = "a card title that is much longer than the box is wide";
	const b = boxed(body(), { role: "box", title });
	const lines = rowsToLines(b.rows);
	assert.match(lines[0], /^╭─+╮$/, "no title in the border");
	assert.ok(!lines.join("\n").includes("…"), lines.join("\n"));
	const flat = lines.slice(1, -1).map((l) => l.replace(/^│ ?| ?│$/g, "")).join(" ").replace(/\s+/g, " ");
	assert.ok(flat.includes(title), `the whole title is inside: ${flat}`);
	assert.ok(lines.some((l) => l.includes("content line")));
});

test("targets of the body move down by the rows the title took", () => {
	const plain = boxed(body(), { role: "box" });
	const moved = boxed(body(), { role: "box", title: "a card title that is much longer than the box is wide" });
	const dy = moved.targets[0].rect.y - plain.targets[0].rect.y;
	assert.ok(dy >= 2, `moved by ${dy}`);
	assert.equal(moved.rows.length - plain.rows.length, dy);
});

test("a tag (the copy button) keeps its place in the border either way", () => {
	const b = boxed(body(), { role: "box", title: "a code title that is much longer than the box is wide", tag: "[copy]" });
	assert.match(rowsToLines(b.rows)[0], /\[copy\]/);
});
