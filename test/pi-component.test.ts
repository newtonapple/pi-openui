// Drives the pi component with pi's own TUI classes and pi's real theme. No model, no terminal.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";
import { GUTTER, isImg, PI, sample, setup, skip, strip } from "./pi-setup.ts";

test("every sample renders through pi-tui at several widths: no line wider than the terminal", { skip }, async () => {
	const { tui, make } = await setup();
	for (const s of LANG_SAMPLES) {
		const widget = make(s.source);
		for (const width of [40, 70, 110]) {
			const lines: string[] = widget.render(width);
			assert.ok(lines.length > 0, `${s.key}: has output`);
			for (const l of lines) assert.ok(tui.visibleWidth(l) <= width, `${s.key}@${width}: ${tui.visibleWidth(l)} > ${width}: ${strip(l)}`);
		}
	}
});

test("colours: pi's real theme styles the output, pie discs use two-colour cells", { skip }, async () => {
	const { make } = await setup();
	const out: string = make(sample("pie")).render(100).join("\n");
	assert.ok(/\x1b\[38;[25];/.test(out), "foreground colours present");
	assert.ok(/\x1b\[48;[25];/.test(out) || /\x1b\[4[0-7]m/.test(out), "background colours for half-block pixels");
	for (const sampleKey of ["dashboard", "markdown", "line", "radar", "geo", "sequence", "dag"]) {
		const text: string = make(sample(sampleKey)).render(100).join("\n");
		assert.ok(text.includes("\x1b["), `${sampleKey} is coloured`);
	}
});

test("click a tab: content swaps, the hover and focus styles appear", { skip }, async () => {
	const { make, click, move, find } = await setup();
	const widget = make(sample("tabs"));
	widget.render(100);
	assert.ok(!strip(widget.render(100).join("\n")).includes("spark-1"));
	const tab = find(widget, (t: any) => t.kind === "tab" && t.label === "Nodes");
	assert.ok(move(widget, tab)?.render, "first hover asks for a repaint");
	assert.equal(move(widget, tab), undefined, "same hover again is free");
	assert.ok(widget.render(100).join("\n").includes("\x1b[4m"), "hover underlines");
	const r = click(widget, tab);
	assert.deepEqual({ handled: r?.handled, render: r?.render }, { handled: true, render: true });
	const text = strip(widget.render(100).join("\n"));
	assert.ok(text.includes("spark-1") && !text.includes("Nodes up"), text);
	assert.ok(widget.render(100).join("\n").includes("\x1b[7m"), "the focused tab is reversed");
});

test("elements with tooltips are advertised, and the hint yields to hover", { skip }, async () => {
	const { make, move, find } = await setup();
	const widget = make(sample("table"));
	const idle = strip(widget.render(100).slice(-1)[0]);
	assert.match(idle, /◆ 2 elements have tooltips: hover one, or press Tab then Enter/);
	move(widget, find(widget, (t: any) => t.label === "row:3"));
	assert.match(strip(widget.render(100).slice(-1)[0]), /row:3.*Enter for details/);
	const plain = make(`root = Stack([t])\nt = Text("no tips here")`);
	assert.ok(!strip(plain.render(100).join("\n")).includes("ⓘ"));
});

test("hover and focus light up border cells with colour, never with underline or reverse (those draw ticks and blocks on vertical edges)", { skip }, async () => {
	const { make, move, click, find } = await setup();
	const widget = make(sample("dag"));
	widget.render(100);
	const node = find(widget, (t: any) => t.kind === "node" && t.label.startsWith("Lint"));
	move(widget, node);
	const lines: string[] = widget.render(100);
	const row = lines[node.rect.y]; // the middle of the node: its side borders and its label
	const side = row.slice(row.indexOf("│") - 40, row.indexOf("│") + 1);
	assert.ok(!/\x1b\[4m[^\x1b]*│/.test(row) && !/\x1b\[7m[^\x1b]*│/.test(row), "no underline or reverse on a border glyph");
	assert.ok(/\x1b\[1m/.test(side) || /\x1b\[1m/.test(row), "the border is bold and coloured");
	assert.ok(lines.join("").includes("\x1b[4m"), "the label still underlines");
	click(widget, node);
	const focused: string[] = widget.render(100);
	assert.ok(!/\x1b\[7m[^\x1b]*◆/.test(focused.join("")), "a tooltip badge is not reversed into a block when its element is focused");
	assert.ok(!/\x1b\[7m[^\x1b]*[│╭╮╰╯─]/.test(focused.join("")), "no reversed border glyph while focused");
});

test("clicking empty space is left to pi (text selection, scrolling)", { skip }, async () => {
	const { make } = await setup();
	const widget = make(sample("tabs"));
	widget.render(100);
	assert.equal(widget.handleMouse({ type: "click", button: "left", x: 99, y: 15 }), undefined);
	assert.equal(widget.handleMouse({ type: "click", button: "right", x: 3, y: 1 }), undefined);
});

test("buttons and choices: live widgets send a user turn, echo widgets only echo", { skip }, async () => {
	const { make, click, find, sent, echoed } = await setup();
	const live = make(sample("interactive"), "live");
	live.render(100);
	click(live, find(live, (t: any) => t.label === "Restart vllm"));
	click(live, find(live, (t: any) => t.kind === "choice" && t.label === "qwen3-32b"));
	assert.deepEqual(sent, ["Restart the vllm service on dgx-spark-1", "Which model should serve chat? — qwen3-32b"]);
	assert.deepEqual(echoed, []);
	assert.ok(strip(live.render(100).join("\n")).includes("● qwen3-32b"));
	const echo = make(sample("interactive"), "echo");
	echo.render(100);
	click(echo, find(echo, (t: any) => t.label === "Drain node"));
	assert.deepEqual(echoed, ["Drain node"]);
	assert.equal(sent.length, 2);
});

test("faq toggles with a click; the detail line explains what a hovered item does", { skip }, async () => {
	const { make, click, move, find } = await setup();
	const widget = make(sample("interactive"));
	widget.render(100);
	const q = find(widget, (t: any) => t.kind === "faq" && t.label.startsWith("How do I undo"));
	click(widget, q);
	assert.ok(strip(widget.render(100).join("\n")).includes("uncordon"));
	move(widget, find(widget, (t: any) => t.label === "Restart vllm"));
	const last = strip(widget.render(100).slice(-1)[0]);
	assert.match(last, /▸ \[Restart vllm\]\s+·\s+sends "Restart the vllm service/);
});

test("copy: OSC 52 payload is the exact code, and the button reports it", { skip }, async () => {
	const { make, click, find, copied } = await setup();
	const widget = make(`root = Stack([c])\nc = CodeBlock("print(1)\\nprint(2)", "python")`);
	widget.render(100);
	click(widget, find(widget, (t: any) => t.kind === "copy"));
	assert.deepEqual(copied, ["print(1)\nprint(2)"]);
	assert.ok(strip(widget.render(100).join("\n")).includes("✓ copied"));
});

test("tooltips: click opens the panel through the component, Esc closes it before leaving", { skip }, async () => {
	const { make, click, find, w } = await setup();
	const widget = make(sample("table"));
	widget.render(100);
	const row = find(widget, (t: any) => t.label === "row:3");
	click(widget, row);
	let text = strip(widget.render(100).join("\n"));
	assert.ok(text.includes("The node was drained first") && text.includes("sudo systemctl restart vllm"), text);
	assert.equal(w.active.id !== null, true, "clicking arms the keyboard");
	assert.equal(w.handleKey("\x1b"), true);
	text = strip(widget.render(100).join("\n"));
	assert.ok(!text.includes("The node was drained first"), "first Esc closes the panel");
	assert.notEqual(w.active.id, null, "still armed");
	assert.equal(w.handleKey("\x1b"), true);
	assert.equal(w.active.id, null, "second Esc leaves");
	assert.equal(w.handleKey("\t"), false, "keys pass through when not armed");
});

test("keyboard: Tab, Shift+Tab, arrows and Enter drive the widget", { skip }, async () => {
	const { make, click, find, w, sent } = await setup();
	const widget = make(sample("interactive"), "live");
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "Restart vllm")); // arms and focuses the first button
	sent.length = 0;
	const focus = () => w.entryOf(w.active.id).state.focus;
	assert.equal(w.handleKey("\t"), true);
	assert.match(focus(), /btn:.*\.1$|btn:/);
	assert.equal(w.handleKey("\x1b[Z"), true);
	assert.match(focus(), /btn:/);
	w.handleKey("\x1b[B"); // down: the choice row
	assert.match(focus(), /^choice:/);
	w.handleKey("\x1b[C"); // right: next option
	assert.match(focus(), /choice:.*:1$/);
	w.handleKey("\r"); // Enter activates it
	assert.deepEqual(sent, ["Which model should serve chat? — llama-3.3-70b"]);
	w.handleKey("\x1b[B"); // down to the faq
	assert.match(focus(), /^faq:/);
	const before = strip(widget.render(100).join("\n")).includes("stops new requests");
	w.handleKey("\r"); // Enter toggles
	assert.notEqual(strip(widget.render(100).join("\n")).includes("stops new requests"), before);
	assert.equal(w.handleKey("x"), false, "typing is not swallowed");
	// (typing also drops the armed state: see the next test)
});

test("typing disarms the widget so Enter sends the message instead of re-firing a button (regression)", { skip }, async () => {
	const { make, click, find, w, sent } = await setup();
	const widget = make(sample("interactive"), "live");
	widget.render(100);
	click(widget, find(widget, (t: any) => t.label === "Restart vllm")); // arms, and the click itself sends once
	assert.equal(sent.length, 1);
	assert.notEqual(w.active.id, null);
	// the user now types a message: letters and spaces go to the editor and disarm the widget
	assert.equal(w.handleKey("h"), false);
	assert.equal(w.active.id, null, "armed state dropped as soon as typing starts");
	assert.equal(w.handleKey("\r"), false, "Enter belongs to the editor now");
	assert.equal(sent.length, 1, "no second send");
	assert.ok(!widget.render(100)[0].includes("▎"), "edge marker gone");
	// Space never activates anything, armed or not
	click(widget, find(widget, (t: any) => t.label === "Drain node"));
	sent.length = 0;
	assert.equal(w.handleKey(" "), false);
	assert.equal(sent.length, 0);
	assert.equal(w.active.id, null, "a space is typing too");
	// a pasted block counts as typing
	click(widget, find(widget, (t: any) => t.label === "Restart vllm"));
	assert.equal(w.handleKey("pasted text"), false);
	assert.equal(w.active.id, null);
	// control keys that are not ours do not disarm
	click(widget, find(widget, (t: any) => t.label === "Restart vllm"));
	assert.equal(w.handleKey("\x03"), false);
	assert.notEqual(w.active.id, null);
});

test("a stale pointer hover does not override keyboard focus in the detail line (regression)", { skip }, async () => {
	const { make, move, click, find, w } = await setup();
	const widget = make(sample("interactive"));
	widget.render(100);
	const btn = find(widget, (t: any) => t.label === "Restart vllm");
	move(widget, btn);
	click(widget, btn);
	w.handleKey("\x1b[B"); // down to the choices
	const last = strip(widget.render(100).slice(-1)[0]);
	assert.match(last, /choose to answer/, last);
});

test("/openui-focus arms the newest widget and focuses its first target", { skip }, async () => {
	const { make, w } = await setup();
	const widget = make(sample("interactive"));
	widget.render(100);
	assert.equal(w.armNewest() !== null, true);
	assert.match(w.entryOf(w.active.id).state.focus, /^btn:/);
	assert.ok(widget.render(100)[0].includes("▎"), "armed edge marker");
});

test("wide diagrams: keyboard focus pans the view and nothing overflows", { skip }, async () => {
	const { tui, make, click, find, w } = await setup();
	const src = `root = Stack([d])
d = Dag([a, b, c, d2, e, f], [["a","b"],["b","c"],["c","d"],["d","e"],["e","f"]], "LR")
a = DagNode("a", "A very long step name one")
b = DagNode("b", "A very long step name two")
c = DagNode("c", "A very long step name three")
d2 = DagNode("d", "A very long step name four")
e = DagNode("e", "A very long step name five")
f = DagNode("f", "A very long step name six")`;
	const widget = make(src);
	for (const l of widget.render(60)) assert.ok(tui.visibleWidth(l) <= 60);
	click(widget, find(widget, (t: any) => t.kind === "node" && t.label.includes("one")));
	for (let i = 0; i < 5; i++) w.handleKey("\t");
	const text = strip(widget.render(60).join("\n"));
	assert.ok(text.includes("six"), `the last node is scrolled into view:\n${text}`);
	for (const l of widget.render(60)) assert.ok(tui.visibleWidth(l) <= 60);
});

test("the render_widget tool: reference, validation errors, success, and rendering of the result", { skip }, async () => {
	const { make, theme, w } = await setup();
	void make;
	const ext: any = await import("../src/pi/extension.ts");
	const tools: any[] = [];
	const stub: any = { registerTool: (t: any) => tools.push(t), registerMessageRenderer() {}, registerCommand() {}, on() {}, sendUserMessage() {}, sendMessage() {} };
	ext.default(stub);
	const tool = tools.find((t) => t.name === "render_widget");
	assert.ok(tool, "registered");
	assert.equal(tool.renderShell, "self");
	assert.ok(tool.promptGuidelines.some((g: string) => g.includes("reference=true")));
	const ref = await tool.execute("id", { reference: true });
	assert.ok(ref.content[0].text.includes("Stack(children") && ref.content[0].text.includes("SequenceDiagram("));
	await assert.rejects(() => tool.execute("id", { source: `root = Stack([a])\na = Metric("x", "y", delta: "+1")` }), /not drawn.*named argument/s);
	await assert.rejects(() => tool.execute("id", { source: `root = Stack([a])` }), /"a" is used but never defined/);
	const ok = await tool.execute("id", { source: `root = Stack([a])\na = Text("hi", "title")` });
	assert.equal(ok.details.kind, "widget");
	assert.match(ok.content[0].text, /do not repeat/);
	const comp = tool.renderResult(ok, {}, theme, { toolCallId: "call-1", isError: false });
	assert.ok(comp instanceof w.OpenUIWidget);
	assert.ok(comp.render(80).join("\n").includes("hi"));
	const err = tool.renderResult({ content: [{ text: "boom\n- line 3: Metric is missing the required argument \"value\"" }] }, {}, theme, { toolCallId: "x", isError: true });
	const errText = strip(err.render(100).join("\n"));
	assert.ok(errText.includes("boom") && errText.includes('missing the required argument "value"'), "the full error list is visible to a person");
	const call = tool.renderCall({ source: "root = a\na = b" }, theme, {});
	assert.ok(strip(call.render(80).join("\n")).includes("2 lines of OpenUI"));
});

test("hover bubble: the tooltip hint appears next to the element, and the widget keeps its height", { skip }, async () => {
	const { make, move, find, w } = await setup();
	const widget = make(sample("table"));
	const idle: string[] = widget.render(100);
	assert.ok(!strip(idle.join("\n")).includes("◆ Rebooted"));
	const row = find(widget, (t: any) => t.label === "row:3");
	move(widget, row);
	const hot: string[] = widget.render(100);
	assert.equal(hot.length, idle.length, "no layout jump");
	const at = hot.findIndex((l) => strip(l).includes("◆ Rebooted 21 Oct after a driver update"));
	assert.ok(at >= 0, strip(hot.join("\n")));
	assert.ok(Math.abs(at - (row.rect.y)) <= 1, "the bubble is on the row above or below the element");
	assert.ok(hot[at].includes("\x1b["), "the bubble is styled with the theme");
	// keyboard focus gets the same bubble
	move(widget, find(widget, (t: any) => t.label === "col:GPU %")); // hover moves away...
	w.handleKey("\t");
	assert.ok(strip(widget.render(100).join("\n")).includes("◆ "), "a bubble or badge is visible");
});

test("the hover bubble stays inside the widget at the top edge and never splits a wide character", { skip }, async () => {
	const { make, move, find } = await setup();
	const widget = make(`root = Stack([m])\nm = Metric("温度センサー", "21°", null, null, [t])\nt = Tooltip("温度センサー", "これは非常に長いヒントです。端末の幅に収まるように切り詰められます。これは非常に長いヒントです。")`);
	widget.render(40);
	move(widget, find(widget, (t: any) => !!t.tip));
	const lines: string[] = widget.render(40);
	for (const l of lines) assert.ok(widget.constructor && l.length > 0);
	const tui: any = await import("@earendil-works/pi-tui");
	for (const l of lines) assert.ok(tui.visibleWidth(l) <= 40, `${tui.visibleWidth(l)} columns: ${strip(l)}`);
});

// ---------- pictures ----------

async function withKitty<T>(f: (ctx: Awaited<ReturnType<typeof setup>>) => Promise<T>): Promise<T> {
	const s = await setup();
	s.tui.setCapabilities({ images: "kitty", trueColor: true, hyperlinks: false });
	s.tui.setCellDimensions({ widthPx: 9, heightPx: 18 });
	try {
		return await f(s);
	} finally {
		s.tui.resetCapabilitiesCache();
		s.tui.setImageTranscoder(undefined);
	}
}

test("pictures: a Kitty terminal gets the real image, placed inside the frame, one image line per picture", { skip }, async () => {
	await withKitty(async ({ tui, make }) => {
		const widget = make(sample("image"));
		const lines: string[] = widget.render(100);
		const at = lines.findIndex((l) => isImg(l));
		assert.ok(at > 0, strip(lines.join("\n")));
		assert.equal(lines.filter((l) => isImg(l)).length, 1, "exactly one image command");
		const m = /\x1b_G([^;]*);/.exec(lines[at])!;
		const ctl = Object.fromEntries(m[1].split(",").map((kv) => kv.split("=")));
		assert.equal(ctl.a, "T");
		assert.equal(ctl.f, "100", "PNG");
		assert.equal(ctl.C, "1", "the cursor does not move");
		const cols = Number(ctl.c);
		const rows = Number(ctl.r);
		assert.ok(cols >= 8 && rows >= 3, `size ${cols}x${rows}`);
		assert.ok(Math.abs((cols * 9) / (rows * 18) - 192 / 108) < 0.25, `aspect ratio kept: ${cols}x${rows} cells for 192x108`);
		assert.ok(Number(ctl.i) > 0, "has an image id, so pi can crop and re-place it while scrolling");
		// text before the command is the gutter and the frame's left border: 2 + 1 columns
		const before = strip(lines[at].slice(0, lines[at].indexOf("\x1b_G")));
		assert.equal(tui.visibleWidth(before), 3);
		assert.ok(before.endsWith("│"));
		// after the command the cursor steps over the picture, then the right border follows
		assert.ok(lines[at].includes(`\x1b[${cols}C`));
		assert.ok(strip(lines[at].slice(lines[at].lastIndexOf(`${cols}C`))).endsWith("│"));
		// the frame: a titled top border with the tooltip badge, side borders on every reserved row, a closing border
		assert.match(strip(lines[at - 1]), /^\s*╭─ Sunset over the ridge ─+◆╮$/);
		for (let k = 1; k < rows; k++) assert.match(strip(lines[at + k]), /^\s*│ +│$/, `row ${k} of the picture`);
		assert.match(strip(lines[at + rows]), /^\s*│Generated test picture, 192x108\s*│$/);
		assert.match(strip(lines[at + rows + 1]), /^\s*╰─+╯$/);
		// widths
		for (const [i, l] of lines.entries()) if (!isImg(l)) assert.ok(tui.visibleWidth(l) <= 100, `line ${i}`);
	});
});

test("pictures: hover lights up the frame, click and Tab open the tooltip, the picture never moves", { skip }, async () => {
	await withKitty(async ({ tui, make, move, click, find, w }) => {
		const widget = make(sample("image"));
		const before: string[] = widget.render(100);
		const t = find(widget, (x: any) => x.kind === "image");
		assert.ok(t.tip && t.image, "the image target carries the tooltip and the placement");
		move(widget, t);
		const hot: string[] = widget.render(100);
		const at = hot.findIndex((l) => isImg(l));
		assert.ok(hot[at - 1].includes("\x1b[1m") && !hot[at - 1].includes("\x1b[4m"), "the frame turns bold and accent-coloured while hovered (no underline ticks)");
		assert.notEqual(hot[at - 1], before[at - 1], "and differs from the idle frame");
		assert.equal(hot.findIndex((l) => isImg(l)), before.findIndex((l) => isImg(l)), "same row");
		assert.ok(strip(hot.join("\n")).includes("◆ Test picture, drawn by the extension"), "bubble");
		click(widget, t);
		const open: string[] = widget.render(100);
		assert.ok(strip(open.join("\n")).includes("Pictures use the terminal's image protocol"), "panel under the picture");
		assert.equal(open.filter((l) => isImg(l)).length, 1);
		assert.equal(w.handleKey("\x1b"), true);
		assert.ok(!strip(widget.render(100).join("\n")).includes("Pictures use the terminal's image protocol"));
	});
});

test("pictures: inside a card the image command is offset by the card padding", { skip }, async () => {
	await withKitty(async ({ tui, make }) => {
		const src = sample("image").replace("root = Stack([img])", "root = Stack([card])\ncard = Card([img], \"Photo\")");
		const lines: string[] = make(src).render(100);
		const at = lines.findIndex((l) => isImg(l));
		const before = strip(lines[at].slice(0, lines[at].indexOf("\x1b_G")));
		assert.equal(tui.visibleWidth(before), 2 + 1 + 1 + 1, "gutter, card border, card padding, frame border");
		assert.match(before, /│ │$/);
		const ctl = /\x1b_G([^;]*);/.exec(lines[at])![1];
		assert.ok(/(^|,)c=\d+/.test(ctl));
		for (const l of lines) if (!isImg(l)) assert.ok(tui.visibleWidth(l) <= 100);
	});
});

test("pictures: narrow terminals shrink the picture to fit", { skip }, async () => {
	await withKitty(async ({ tui, make }) => {
		const lines: string[] = make(sample("image")).render(30);
		const at = lines.findIndex((l) => isImg(l));
		const cols = Number(/,c=(\d+)/.exec(lines[at])![1]);
		assert.ok(cols + 3 + 1 <= 30, `${cols} columns plus frame fits in 30`);
		for (const l of lines) if (!isImg(l)) assert.ok(tui.visibleWidth(l) <= 30);
	});
});

test("pictures: without a graphics terminal the frame says what the picture is", { skip }, async () => {
	const { tui, make } = await setup();
	tui.setCapabilities({ images: null, trueColor: true, hyperlinks: false });
	try {
		const lines: string[] = make(sample("image")).render(100);
		const text = strip(lines.join("\n"));
		assert.ok(!lines.some((l) => isImg(l)), "no image command");
		assert.match(text, /▒ Sunset over the ridge/);
		assert.match(text, /inline\.png · 192×108 · png · \d+ KB/);
		assert.match(text, /◆╮/, "the tooltip badge is on the frame");
	} finally {
		tui.resetCapabilitiesCache();
	}
});

test("pictures: JPEG waits for pi's converter, then is drawn; the frame never lies in between", { skip }, async () => {
	await withKitty(async ({ tui, make }) => {
		const jpeg = Buffer.alloc(40);
		jpeg[0] = 0xff; jpeg[1] = 0xd8; jpeg[2] = 0xff; jpeg[3] = 0xc0;
		jpeg.writeUInt16BE(17, 4); jpeg[6] = 8; jpeg.writeUInt16BE(80, 7); jpeg.writeUInt16BE(120, 9);
		const src = `root = Stack([i])\ni = Image("data:image/jpeg;base64,${jpeg.toString("base64")}", "A photo")`;
		const before = strip(make(src).render(100).join("\n"));
		assert.match(before, /▒ A photo/);
		assert.match(before, /inline\.jpeg · 120×80 · jpeg/);
		const png = (await import("../src/data/sample-image.ts")).samplePng(120, 80).toString("base64");
		tui.setImageTranscoder((_b64: string, mime: string) => (mime === "image/jpeg" ? png : null));
		const w2: any = await import("../src/pi/widget.ts");
		w2.resetAll();
		const lines: string[] = make(src).render(100);
		assert.ok(lines.some((l) => isImg(l)), "drawn once the converter exists");
	});
});

test("pictures: image problems reach the model as errors it can fix", { skip }, async () => {
	const ext: any = await import("../src/pi/extension.ts");
	const { writeFileSync, mkdtempSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const dir = mkdtempSync(join(tmpdir(), "oui-img-"));
	writeFileSync(join(dir, "pic.svg"), `<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>`);
	writeFileSync(join(dir, "notes.png"), "this is not a picture");
	writeFileSync(join(dir, "ok.png"), (await import("../src/data/sample-image.ts")).samplePng(16, 9));
	const check = (path: string) => ext.checkImages(compile(`root = Stack([i])\ni = Image("${path}")`).root);
	assert.match(check("/definitely/missing.png")[0], /file not found: \/definitely\/missing\.png/);
	assert.match(check(join(dir, "pic.svg"))[0], /SVG cannot be drawn in a terminal/);
	assert.match(check(join(dir, "notes.png"))[0], /not a png, jpg, gif or webp picture/);
	assert.match(check("https://example.com/a.png")[0], /remote URLs are not fetched/);
	assert.match(check("data:image/png,AAAA")[0], /must be base64/);
	assert.deepEqual(check(join(dir, "ok.png")), []);
	assert.deepEqual(check(`~/../../${dir.replace(/^\//, "")}/ok.png`.replace("~/../..", "")), [], "absolute path with odd leading characters is fine");
	// the tool surfaces them as a failed call
	const tools: any[] = [];
	ext.default({ registerTool: (t: any) => tools.push(t), registerMessageRenderer() {}, registerCommand() {}, on() {}, sendUserMessage() {}, sendMessage() {} });
	const tool = tools.find((t) => t.name === "render_widget");
	await assert.rejects(() => tool.execute("id", { source: `root = Stack([i])\ni = Image("/definitely/missing.png", "x")` }), /line 2: Image "\/definitely\/missing\.png": file not found/);
	const good = await tool.execute("id", { source: `root = Stack([i])\ni = Image("${join(dir, "ok.png")}", "x")` });
	assert.equal(good.details.kind, "widget");
});
