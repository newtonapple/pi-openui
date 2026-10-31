// What the widget costs pi. pi calls render() on every widget in the transcript on every frame, and again for each mouse event, so
// the cost of an unchanged widget must be near nothing; memory must not grow with use; and nothing a model writes may make a
// frame slow, wide, or throw. No model, no terminal.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cell } from "../src/diagram/canvas.ts";
import { work } from "../src/diagram/router.ts";
import { compile, LIMITS } from "../src/lang/library.ts";
import { MAX_ROWS } from "../src/blocks/render.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";
import { imageCacheStats, loadImage } from "../src/pi/images.ts";
import { GUTTER, isImg, sample, setup, skip, strip } from "./pi-setup.ts";

const R = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));
const q = JSON.stringify;

test("an unchanged widget answers from its cache: the same lines, no work", { skip }, async () => {
	const { make, move, find } = await setup();
	const widget = make(sample("table"));
	const a = widget.render(100);
	assert.strictEqual(widget.render(100), a, "same lines, same array");
	const block = widget.lastBlock();
	const t = find(widget, (x: any) => x.kind !== "item");
	move(widget, t);
	const hovered = widget.render(100);
	assert.notStrictEqual(hovered, a, "the pointer moved: the picture changed");
	assert.strictEqual(widget.lastBlock(), block, "but the layout was not redone");
	assert.strictEqual(widget.render(100), hovered, "and the new picture is cached too");
	const wider = widget.render(120);
	assert.notStrictEqual(wider, hovered, "another width is another picture");
	widget.invalidate();
	assert.notStrictEqual(widget.render(120), wider, "pi's invalidate() (a theme change) drops the cache");
});

test("a frame over a long transcript costs next to nothing when nothing changed", { skip }, async () => {
	const { make } = await setup();
	const widgets = R(120, (i) => make(LANG_SAMPLES[i % LANG_SAMPLES.length].source));
	for (const w of widgets) w.render(110);
	const t0 = performance.now();
	for (let f = 0; f < 20; f++) for (const w of widgets) w.render(110);
	const perFrame = (performance.now() - t0) / 20;
	// measured: about 0.03 ms. 8 ms is half of a 60 fps frame and what redrawing every widget cost before the cache.
	assert.ok(perFrame < 4, `120 widgets, unchanged: ${perFrame.toFixed(2)} ms a frame`);
});

test("cells are shared and frozen: nothing can restyle another widget's cells", { skip }, async () => {
	const { make } = await setup();
	assert.strictEqual(cell("a", "x"), cell("a", "x"), "equal cells are one object");
	assert.ok(Object.isFrozen(cell("a", "x")));
	assert.throws(() => ((cell("a", "x") as any).role = "y"), TypeError);
	for (const s of LANG_SAMPLES) {
		const widget = make(s.source);
		for (const width of [50, 110]) {
			widget.render(width);
			for (const row of widget.lastBlock().rows) for (const c of row) assert.ok(Object.isFrozen(c), `${s.key}@${width}: a cell is not frozen: ${JSON.stringify(c)}`);
		}
	}
});

test("a note, a tab or a click does not route a diagram's wires again", { skip }, async () => {
	const { make, w, find, click } = await setup();
	w.hooks.prompt = async () => "a note";
	const widget = make(sample("infra"));
	widget.render(100);
	assert.ok(work.spent > 0, "the first layout routes the links");
	work.spent = -1; // a sentinel: any new routing resets it
	w.toggleNotesNewest();
	const node = find(widget, (t: any) => t.kind === "item" && t.item.key === "api");
	click(widget, node);
	await new Promise((r) => setTimeout(r, 10));
	assert.equal(w.entryOf(widget.id).state.notes.length, 1, "the note was saved");
	widget.render(100);
	assert.equal(work.spent, -1, "and drawn without routing again");
	widget.render(90); // another width does need a new layout
	assert.ok(work.spent > 0, "(a new width does route)");
});

test("widgets at every limit draw within bounds at narrow and wide terminals", { skip }, async () => {
	const { tui, make } = await setup();
	const big: Record<string, string> = {
		table: `root = Stack([x])\nx = Table(${q(R(LIMITS.tableCols, (i) => "column " + i))}, ${q(R(LIMITS.tableRows, (r) => R(LIMITS.tableCols, (c) => `value ${r}-${c}`)))})`,
		dag: `root = Stack([x])\nx = Dag([${R(LIMITS.dagNodes, (i) => "n" + i).join(",")}], ${q(R(LIMITS.dagEdges, (i) => ["n" + ((i * 5) % LIMITS.dagNodes), "n" + ((i * 7 + 3) % LIMITS.dagNodes)]).filter(([a, b]) => a !== b))})\n${R(LIMITS.dagNodes, (i) => `n${i} = DagNode("n${i}", "Task number ${i}", "done")`).join("\n")}`,
		erd: `root = Stack([x])\nx = Erd([${R(LIMITS.entities, (i) => "t" + i).join(",")}], [${R(LIMITS.relations, (i) => "r" + i).join(",")}])\n${R(LIMITS.entities, (i) => `t${i} = Entity("table_${i}", ${q(R(LIMITS.fields, (c) => `column_${c} text`))})`).join("\n")}\n${R(LIMITS.relations, (i) => `r${i} = Relation("table_${i % LIMITS.entities}", "table_${(i * 5 + 1) % LIMITS.entities}", "1:N", "rel ${i}")`).join("\n")}`,
		infra: `root = Stack([x])\nx = InfraMap([z0, z1, z2], [${R(LIMITS.infraLinks, (i) => "l" + i).join(",")}])\n${R(3, (z) => `z${z} = InfraZone("Zone ${z}", [${R(10, (i) => `n${z}_${i}`).join(",")}])`).join("\n")}\n${R(3, (z) => R(10, (i) => `n${z}_${i} = InfraNode("n${z}_${i}", "Node ${z}-${i}", "service", "up", "detail")`).join("\n")).join("\n")}\n${R(LIMITS.infraLinks, (i) => `l${i} = InfraLink("n${i % 3}_${i % 10}", "n${(i + 1) % 3}_${(i * 3) % 10}", "link ${i}")`).join("\n")}`,
		sequence: `root = Stack([x])\nx = SequenceDiagram([a, b, c], [${R(LIMITS.steps, (i) => "m" + i).join(",")}])\na = SeqParticipant("a", "A")\nb = SeqParticipant("b", "B")\nc = SeqParticipant("c", "C")\n${R(LIMITS.steps, (i) => `m${i} = SeqMessage("${"abc"[i % 3]}", "${"bca"[i % 3]}", "message number ${i}")`).join("\n")}`,
		line: `root = Stack([x])\nx = LineChart(${q(R(LIMITS.points, (i) => "p" + i))}, [${R(LIMITS.series, (s) => "s" + s).join(",")}])\n${R(LIMITS.series, (s) => `s${s} = Series("series ${s}", ${q(R(LIMITS.points, (i) => Math.round(50 + 40 * Math.sin(i / 7 + s))))})`).join("\n")}`,
		geo: `root = Stack([x])\nx = GeoMap([${R(LIMITS.geoPoints, (i) => "p" + i).join(",")}])\n${R(LIMITS.geoPoints, (i) => `p${i} = GeoPoint("P${i}", ${(i * 7) % 160 - 80}, ${(i * 13) % 340 - 170})`).join("\n")}`,
		markdown: `root = Stack([x])\nx = Markdown(${q(R(240, (i) => `## Heading ${i}\n\nSome **bold** and *italic* and \`code\` text in paragraph ${i}.\n\n- one\n- two\n`).join("\n"))})`,
		text: `root = Stack([x])\nx = Text(${q("word ".repeat(LIMITS.text / 5 - 1))})`,
		code: `root = Stack([x])\nx = CodeBlock(${q(R(LIMITS.codeLines, (i) => `def f${i}(x): return x + ${i}  # comment`).join("\n"))}, "python")`,
		faq: `root = Stack([x])\nx = Faq([${R(LIMITS.faq, (i) => "q" + i).join(",")}], true)\n${R(LIMITS.faq, (i) => `q${i} = FaqItem("Question ${i}?", ${q("An answer with some words. ".repeat(20))})`).join("\n")}`,
	};
	for (const [name, src] of Object.entries(big)) {
		const c = compile(src);
		assert.deepEqual(c.errors, [], `${name} at its limit is valid`);
		const widget = make(src);
		for (const width of [24, 60, 120, 250]) {
			const t0 = performance.now();
			const lines: string[] = widget.render(width);
			const ms = performance.now() - t0;
			assert.ok(ms < 5000, `${name}@${width}: ${Math.round(ms)} ms for the first draw`);
			assert.ok(lines.length <= MAX_ROWS + 8, `${name}@${width}: ${lines.length} lines`);
			for (const l of lines) assert.ok(tui.visibleWidth(l) <= width, `${name}@${width}: a line is ${tui.visibleWidth(l)} wide`);
			const t1 = performance.now();
			widget.render(width);
			assert.ok(performance.now() - t1 < 5, `${name}@${width}: the second draw is from the cache`);
		}
	}
});

test("a widget taller than the row cap is cut, and says so", { skip }, async () => {
	const { tui, make, w } = await setup();
	const src = `root = Stack([x])\nx = Markdown(${q(R(LIMITS.faq * 8, (i) => `## Heading ${i}\n\nline\n\n- one\n- two\n`).join("\n"))})`;
	const c = compile(src);
	assert.deepEqual(c.errors, []);
	const widget = make(src);
	const lines: string[] = widget.render(100);
	assert.equal(widget.lastBlock().rows.length, MAX_ROWS, "cut at the cap");
	assert.ok(lines.some((l) => l.includes("more rows are not drawn")), "the reader is told");
	for (const l of lines) assert.ok(tui.visibleWidth(l) <= 100);
	void w;
});

test("render and input never throw into pi", { skip }, async () => {
	const { theme, w, tui } = await setup();
	// a broken tree: the layout throws, the widget answers with one line
	const broken = new w.OpenUIWidget("broken", null as any, theme, "echo");
	let lines: string[] = [];
	assert.doesNotThrow(() => (lines = broken.render(80)));
	assert.equal(lines.length, 1);
	assert.ok(lines[0].includes("could not be drawn"));
	assert.ok(tui.visibleWidth(lines[0]) <= 80);
	assert.doesNotThrow(() => broken.render(1));
	assert.equal(broken.handleMouse({ type: "move", button: "none", x: 3, y: 0 }), undefined);
	// a render hook that throws does not escape the key handler either
	const c = compile(sample("interactive"));
	const ok = new w.OpenUIWidget("ok", c.root, theme, "echo");
	ok.render(100);
	w.armNewest();
	w.hooks.requestRender = () => {
		throw new Error("boom");
	};
	assert.doesNotThrow(() => w.handleKey("\t"));
	assert.equal(w.handleKey("\t"), false);
	w.hooks.requestRender = () => {};
	assert.doesNotThrow(() => ok.handleMouse(null as any));
});

test("a session's widgets are forgotten at shutdown, and a widget still on screen comes back clean", { skip }, async () => {
	const { make, w } = await setup();
	const widget = make(sample("table"));
	const lines = widget.render(100);
	assert.ok(w.entryOf(widget.id));
	// the extension's shutdown handler
	const ext: any = await import("../src/pi/extension.ts");
	const handlers: Record<string, Function> = {};
	ext.default({ registerTool() {}, registerMessageRenderer() {}, registerCommand() {}, on: (n: string, f: Function) => (handlers[n] = f), sendUserMessage() {}, sendMessage() {} });
	await handlers.session_shutdown();
	assert.equal(w.entryOf(widget.id), undefined, "the state is gone");
	assert.deepEqual(widget.render(100).length, lines.length, "a widget that is still drawn makes its state again");
	assert.ok(w.entryOf(widget.id));
});

test("the compile cache keeps small programs and never keeps an oversized one", { skip }, async () => {
	const ext: any = await import("../src/pi/extension.ts");
	const small = 'root = Stack([t])\nt = Text("cached")';
	assert.strictEqual(ext.compileCached(small), ext.compileCached(small), "a small program is compiled once");
	const huge = 'root = Stack([t])\nt = Text("' + "a".repeat(LIMITS.source) + '")';
	const a = ext.compileCached(huge);
	assert.equal(a.ok, false);
	assert.notStrictEqual(ext.compileCached(huge), a, "a refused source is not kept as a cache key");
	for (let i = 0; i < 200; i++) ext.compileCached(`root = Stack([t])\nt = Text("${i}")`); // many distinct sources: the cache is bounded
	assert.ok(ext.compileCached(small).ok);
	void GUTTER;
});

test("the picture cache is bounded by bytes: many large files cannot pin gigabytes", { skip }, async () => {
	// a file that sniffs as a PNG with a real IHDR, then filler: loadImage reads the header and keeps the base64
	const png = (bytes: number) => {
		const head = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 0, 0, 13]), Buffer.from("IHDR"), Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]), Buffer.from([0, 0, 0, 0])]);
		return Buffer.concat([head, Buffer.alloc(bytes - head.length, 7)]);
	};
	const dir = mkdtempSync(join(tmpdir(), "openui-img-"));
	try {
		const before = imageCacheStats();
		for (let i = 0; i < 24; i++) {
			const file = join(dir, `big${i}.png`);
			writeFileSync(file, png(4 * 1024 * 1024)); // 5.6 MB as base64: 24 of them is 134 MB
			const img = loadImage(file);
			assert.ok(!("error" in img), `big${i}: ${JSON.stringify(img).slice(0, 80)}`);
			const st = imageCacheStats();
			assert.ok(st.bytes <= st.budget, `after ${i + 1} pictures the cache holds ${Math.round(st.bytes / 1048576)} MB (budget ${Math.round(st.budget / 1048576)} MB)`);
		}
		const st = imageCacheStats();
		assert.ok(st.entries < 24 && st.entries >= 1, `old pictures were dropped (${st.entries} kept)`);
		assert.ok(!("error" in loadImage(join(dir, "big23.png"))), "the newest is still there");
		void before;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the last column of every line stays empty: pi's scrollbar is drawn over it", { skip }, async () => {
	const { tui, make, w, click, find } = await setup();
	w.hooks.prompt = async () => "a note";
	for (const s of LANG_SAMPLES) {
		const widget = make(s.source);
		for (const width of [40, 70, 110, 250]) {
			for (const l of widget.render(width)) if (!isImg(l)) assert.ok(tui.visibleWidth(l) <= width - 1, `${s.key}@${width}: a line reaches column ${tui.visibleWidth(l)} of ${width}: ${strip(l)}`);
		}
	}
	// the notes chip is at the right edge of what is drawn, and whole: a scrollbar over the last column would not touch it
	const table = make(sample("table"));
	for (const width of [60, 120, 300]) {
		const last = strip(table.render(width).at(-1)!);
		assert.ok(last.endsWith("[ notes ]"), `${width}: ${JSON.stringify(last)}`);
		assert.equal(tui.visibleWidth(last), width - 1, "right-aligned to the last column but one");
		const covered = last.slice(0, width - 1) + "│"; // what pi's scrollbar does to the line
		assert.ok(covered.includes("[ notes ]"), "the chip survives the scrollbar");
	}
	// and with notes on: the tray's right border and the chip
	w.toggleNotesNewest();
	table.render(100);
	click(table, find(table, (t: any) => t.kind === "item" && t.item.key === "cell:1.Node"));
	await new Promise((r) => setTimeout(r, 0));
	const lines: string[] = table.render(100);
	assert.ok(lines.some((l) => strip(l).includes("Notes (1)")), "the tray is drawn");
	for (const l of lines) assert.ok(tui.visibleWidth(l) <= 99, strip(l));
	assert.ok(strip(lines.at(-1)!).endsWith("[ notes: on ]"));
});
