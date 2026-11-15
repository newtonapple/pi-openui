// Code is exactly what you need to read to the end of: a long command line is not cut, the code scrolls inside its box. The same
// for the code fences and the tables of a Markdown.
import assert from "node:assert/strict";
import { test } from "node:test";
import { activate, panAreaAt, type Env } from "../src/blocks/interact.ts";
import { renderTree } from "../src/blocks/render.ts";
import { newState, type Block, type Target } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";

const CURL = "curl -X POST https://api.example.com/v1/chat/completions -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' -d @body.json";
class Scene {
	state = newState();
	root;
	block!: Block;
	width: number;
	constructor(src: string, width: number) {
		this.width = width;
		const c = compile(src);
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
	get bar(): Target | undefined {
		return this.block.targets.find((t) => t.kind === "pan" && t.scroll!.part === "right");
	}
	panTo(n: number) {
		this.state.pan[this.bar!.scroll!.key] = n;
		this.draw();
	}
	/** every window of the scroll, joined: what a reader can see by scrolling to the end */
	scrolled(): string {
		const sc = this.bar!.scroll!;
		const seen: string[] = [];
		for (let p = 0; p <= sc.total - sc.view; p += Math.max(1, Math.floor(sc.view / 4))) {
			this.panTo(p);
			seen.push(this.text);
		}
		this.panTo(sc.total - sc.view);
		seen.push(this.text);
		return seen.join("\n");
	}
}
const CODE = `root = Stack([c])\nc = CodeBlock(${JSON.stringify(CURL + "\nshort")}, "bash", "request")`;

test("a code line wider than the pane is not cut: the code scrolls inside its box, with a bar", () => {
	const s = new Scene(CODE, 40);
	assert.ok(s.bar, `a pan bar:\n${s.text}`);
	assert.ok(!s.text.includes("…"), s.text);
	const lines = s.text.split("\n");
	assert.ok(lines[0].startsWith("╭") && lines[0].includes("[copy]"), "the box and its copy button are where they were");
	s.panTo(0);
	assert.ok(s.text.includes("curl -X POST"), s.text);
	assert.ok(!s.text.includes("body.json"), "the end is off screen at the start");
	assert.ok(s.scrolled().includes("@body.json"), "and reachable by scrolling");
});

test("every stretch of the line is there, whole, in some window of the scroll", () => {
	const s = new Scene(CODE, 40);
	const all = s.scrolled();
	for (let i = 0; i + 20 <= CURL.length; i += 10) assert.ok(all.includes(CURL.slice(i, i + 20)), `"${CURL.slice(i, i + 20)}" (characters ${i} to ${i + 20}) is whole in some window`);
});

test("the copy button still copies the whole code", () => {
	const s = new Scene(CODE, 40);
	const copy = s.block.targets.find((t) => t.kind === "copy")!;
	assert.equal(copy.copy, CURL + "\nshort");
	assert.ok(copy.rect.x + copy.rect.w <= 40);
});

test("code that fits is untouched: no bar", () => {
	const s = new Scene(`root = Stack([c])\nc = CodeBlock("echo hi\\nls -la", "bash")`, 40);
	assert.ok(!s.bar);
});

test("a click on the bar's arrow scrolls the code; a wheel or drag over the code is a pan area", () => {
	const s = new Scene(CODE, 40);
	const right = s.bar!;
	const env: Env = { send() {}, copy() {}, note() {} };
	assert.ok(activate(right, s.state, env));
	s.draw();
	assert.ok(s.state.pan[right.scroll!.key] > 0);
	assert.ok(panAreaAt(s.block, 5, 2), "over the code");
});

const MD = (body: string) => `root = Stack([m])\nm = Markdown(${JSON.stringify(body)})`;

test("Markdown: a code fence with a long line scrolls", () => {
	const s = new Scene(MD("Run this:\n\n```bash\n" + CURL + "\n```\n\nThen wait."), 40);
	assert.ok(s.bar, s.text);
	assert.ok(!s.text.includes("…"), s.text);
	assert.ok(s.text.includes("Run this:") && s.text.includes("Then wait."));
	assert.ok(s.scrolled().includes("@body.json"));
});

test("Markdown: a table with many columns pans instead of squeezing every column", () => {
	const t = "| name | status | region | owner | notes | updated |\n|---|---|---|---|---|---|\n| alpha service | running | us-east-1 | platform team | rolling restart in progress | 2026-11-14 |\n| beta | stopped | eu-west-2 | data | | 2026-11-13 |";
	const s = new Scene(MD(t), 60); // the first column stays: 43 of the 60 cells scroll, wider than any cell here
	assert.ok(s.bar, s.text);
	assert.ok(!s.text.includes("…"), s.text);
	const all = s.scrolled();
	for (const w of ["alpha service", "us-east-1", "platform team", "rolling restart in progress", "2026-11-14", "eu-west-2"]) assert.ok(all.includes(w), `${w} is whole somewhere in the scroll`);
});

test("Markdown: text and short code around a wide one are untouched; a Markdown that fits has no bar", () => {
	const s = new Scene(MD("# Title\n\nSome *text* and `code`.\n\n```\nshort\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |"), 60);
	assert.ok(!s.bar, s.text);
});

test("two wide blocks in one Markdown scroll on their own", () => {
	const s = new Scene(MD("```\n" + CURL + "\n```\n\n```\n" + CURL.replace("curl", "wget") + "\n```"), 40);
	const bars = s.block.targets.filter((t) => t.kind === "pan" && t.scroll!.part === "right");
	assert.equal(bars.length, 2);
	assert.notEqual(bars[0].scroll!.key, bars[1].scroll!.key);
});
