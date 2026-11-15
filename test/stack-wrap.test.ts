// A row of fixed-size children (Metric tiles, Buttons, short Text) that does not fit the pane wraps onto more rows. It used to
// squeeze every child until its label was cut with an ellipsis.
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTree } from "../src/blocks/render.ts";
import { newState } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";

const draw = (src: string, width: number) => {
	const c = compile(src);
	assert.deepEqual(c.errors, []);
	const { block } = renderTree(c.root!, width, newState());
	return { block, text: rowsToLines(block.rows).join("\n") };
};
const METRICS = `root = Stack([a,b,c,d], "row", "m")
a = Metric("Requests per second","1,234,567","+12%","good")
b = Metric("p99 latency","842 ms","-3%","bad")
c = Metric("Error budget remaining","99.95 %")
d = Metric("Queue depth","12,345,678")`;
const BUTTONS = `root = Stack([a,b,c,d,e], "row", "s")
a = Button("Restart the vllm service")
b = Button("Drain node")
c = Button("Show logs for 1h")
d = Button("Cancel")
e = Button("Escalate to on-call")`;

test("metric tiles that do not fit side by side wrap: every label is whole", () => {
	for (const width of [30, 40, 60, 80]) {
		const { text } = draw(METRICS, width);
		assert.ok(!text.includes("…"), `${width}: nothing is cut\n${text}`);
		for (const label of ["Requests per second", "p99 latency", "Error budget remaining", "Queue depth", "1,234,567", "12,345,678"]) assert.ok(text.includes(label), `${width}: ${label}`);
	}
});

test("a row that fits stays one row, exactly as before", () => {
	const one = draw(`root = Stack([a], "row")\na = Metric("Requests per second","1,234,567","+12%","good")`, 140);
	const row = draw(METRICS, 140);
	assert.equal(row.block.rows.length, one.block.rows.length, "four tiles in one line at 140 columns");
	const narrow = draw(METRICS, 40);
	assert.ok(narrow.block.rows.length > row.block.rows.length, "and more rows when narrow");
});

test("buttons wrap onto more rows instead of being cut", () => {
	const { text, block } = draw(BUTTONS, 36);
	assert.ok(!text.includes("…"), text);
	for (const label of ["Restart the vllm service", "Drain node", "Show logs for 1h", "Cancel", "Escalate to on-call"]) assert.ok(text.includes(label), label);
	assert.equal(block.targets.filter((t) => t.kind === "button").length, 5, "all five are still buttons");
	for (const t of block.targets) assert.ok(t.rect.x >= 0 && t.rect.x + t.rect.w <= 36, `${t.label} is inside the pane`);
});

test("a row with a child that shares the space keeps the old behaviour: side by side", () => {
	const src = `root = Stack([a, b], "row")\na = Card([t1], "one")\nb = Card([t2], "two")\nt1 = Text("first card")\nt2 = Text("second card")`;
	const { text } = draw(src, 40);
	const lines = text.split("\n");
	assert.ok(lines[0].includes("one") && lines[0].includes("two"), `both cards on the first line:\n${text}`);
});

test("wrap: true behaves as it did", () => {
	const src = `root = Stack([a,b,c], "row", "m", true)\na = Button("one")\nb = Button("two")\nc = Button("three")`;
	const { text } = draw(src, 60);
	assert.equal(text.split("\n").length, 1, text);
});
