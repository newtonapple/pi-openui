// `/openui-gallery wide` draws the examples that do not fit a phone. Each one must show, at about 60 columns, the thing its title
// says: that is what makes the gallery a way to look at small-screen behavior, not just more samples.
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTree } from "../src/blocks/render.ts";
import { newState, type Block } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";

const WIDE = LANG_SAMPLES.filter((s) => s.key.startsWith("wide-"));
const draw = (key: string, width = 57) => {
	const s = LANG_SAMPLES.find((x) => x.key === key)!;
	assert.ok(s, key);
	const c = compile(s.source);
	assert.deepEqual(c.errors, [], `${key}: ${c.errors.join("|")}`);
	const r = renderTree(c.root!, width, newState(), { settings: { tableMinCol: 12, scrollStep: 8 } });
	return { block: r.block, text: rowsToLines(r.block.rows).join("\n"), warnings: r.warnings };
};
const bars = (b: Block) => b.targets.filter((t) => t.kind === "pan" && t.scroll!.part === "track").length;

test("the small-screen set is there: twelve examples, all under one prefix", () => {
	assert.equal(WIDE.length, 12);
	assert.deepEqual(WIDE.map((s) => s.key), ["wide-table", "wide-table-cut", "wide-code", "wide-tabs", "wide-tiles", "wide-infra-map", "wide-dag", "wide-graph", "wide-erd", "wide-sequence", "wide-markdown", "wide-card"]);
	assert.ok(WIDE.every((s) => s.title.length > 10), "each says what to look at");
});

test("at the width of a phone, none of them is wider than the pane and none draws a warning", () => {
	for (const s of WIDE) {
		const { block, warnings } = draw(s.key);
		assert.ok(block.w <= 57 && block.rows.every((r) => r.length <= 57), `${s.key}: ${block.w}`);
		assert.deepEqual(warnings, [], s.key);
	}
});

test("wide-table: it scrolls, and Host stays put", () => {
	const { block, text } = draw("wide-table");
	assert.equal(bars(block), 1);
	assert.match(text, /│ Host +│/);
});

test("wide-table-cut: cut cells end in an ellipsis and each can be read whole", () => {
	const { block, text } = draw("wide-table-cut");
	assert.ok(text.includes("…") && bars(block) === 0);
	const full = block.targets.filter((t) => t.kind === "tip" && t.tip?.full !== undefined);
	assert.equal(full.length, 2);
	assert.ok(full.some((t) => t.tip!.full!.includes("OPS-4471")) && full.some((t) => t.tip!.full!.includes("extended at 02:51")));
});

test("wide-code: the long line scrolls inside its box", () => {
	const { block, text } = draw("wide-code");
	assert.equal(bars(block), 1);
	assert.ok(!text.includes("…") && text.includes("[copy]"));
});

test("wide-tabs: the strip wraps, every label whole", () => {
	const { block, text } = draw("wide-tabs");
	assert.ok(new Set(block.targets.filter((t) => t.kind === "tab").map((t) => t.rect.y)).size > 1);
	for (const l of ["Infrastructure map", "Inventory table", "Services and ports", "Deployments history"]) assert.ok(text.includes(l), l);
	assert.ok(!text.includes("…"));
});

test("wide-tiles: tiles and buttons wrap, nothing is cut", () => {
	const { text } = draw("wide-tiles");
	assert.ok(!text.includes("…"));
	for (const l of ["Requests per second", "Error budget remaining", "Restart the vllm service", "Show logs for the last hour"]) assert.ok(text.includes(l), l);
});

test("the diagrams that cannot shrink enough scroll, with whole labels", () => {
	for (const key of ["wide-infra-map", "wide-dag", "wide-graph", "wide-sequence"]) {
		const { block, text } = draw(key);
		assert.equal(bars(block), 1, `${key} scrolls`);
		assert.ok(!text.includes("…"), `${key} is not cut`);
	}
});

test("wide-erd: the entities are shrunk to fit the pane (and say so with an ellipsis), not scrolled", () => {
	const { block, text } = draw("wide-erd");
	assert.equal(bars(block), 0);
	assert.ok(text.includes("…"));
	assert.ok(text.includes("order_line_items_with_a_long_name"), "entity names are whole");
});

test("wide-markdown: the code fence and the table each scroll, and a long word is broken", () => {
	const { block, text } = draw("wide-markdown");
	assert.equal(bars(block), 2);
	assert.ok(text.includes("abcdefghij"));
});

test("wide-card: the long title moves inside the card, whole", () => {
	const { text } = draw("wide-card");
	assert.ok(!text.includes("…"), text);
	assert.ok(text.replace(/[│╭╮╰╯─\s]/g, "").includes("Acardtitlethatismuchlongerthanaphoneiswide"), text);
});

test("/openui-gallery wide draws the small-screen set and only that; /openui-gallery table is still just the table", async () => {
	const ext: any = await import("../src/pi/extension.ts");
	const sent: any[] = [];
	const commands: Record<string, any> = {};
	ext.default({ registerTool() {}, registerMessageRenderer() {}, registerCommand: (n: string, c: any) => (commands[n] = c), on() {}, sendUserMessage() {}, sendMessage: (m: any) => sent.push(m) });
	const notes: string[] = [];
	const ctx = { ui: { notify: (m: string) => notes.push(m) } };
	await commands["openui-gallery"].handler("wide", ctx);
	assert.equal(sent.length, WIDE.length);
	sent.length = 0;
	await commands["openui-gallery"].handler("table", ctx);
	assert.equal(sent.length, 1, "only the table sample starts with table");
	assert.match(commands["openui-gallery"].description, /wide/, "the command says how to get them");
});
