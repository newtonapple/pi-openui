// Pictures inside markdown: a line that is only `![alt](path "caption")` is drawn as a picture by the same code as the Image
// component. The renderer, the validator and the picture limit must agree on which lines those are.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { markdownBlock } from "../src/blocks/markdown.ts";
import { renderTree } from "../src/blocks/render.ts";
import { newState, type Ctx, type ImageService } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { compile, LIMITS } from "../src/lang/library.ts";
import { imageLine, markdownImages } from "../src/lang/md.ts";
import { rng } from "./helpers.ts";
import { isImg, setup, skip, strip } from "./pi-setup.ts";

const q = JSON.stringify;

/** A picture service that records what it was asked to place, so a test can count pictures without a terminal. */
function fakeImages(opts: { graphics?: boolean } = {}) {
	const asked: string[] = [];
	const svc: ImageService = {
		place(src, maxCols) {
			asked.push(src);
			return opts.graphics === false ? null : { key: `k${asked.length}`, cols: Math.min(maxCols, 20), rows: 4 };
		},
		describe: (src) => `described ${src}`,
	};
	return { svc, asked };
}
const ctxWith = (svc?: ImageService): Ctx => ({ state: newState(), warnings: [], services: svc ? { images: svc } : {}, tabs: [], render: () => ({ w: 0, rows: [], targets: [] }) });

test("which lines are pictures: only a line of its own, with an optional caption and <path with spaces>", () => {
	assert.deepEqual(imageLine("![a sunset](pics/sunset.png)"), { alt: "a sunset", src: "pics/sunset.png" });
	assert.deepEqual(imageLine('  ![](x.png "A caption")  '), { alt: "", src: "x.png", caption: "A caption" });
	assert.deepEqual(imageLine("![two words](</Users/me/My Pictures/a b.png>)"), { alt: "two words", src: "/Users/me/My Pictures/a b.png" });
	assert.deepEqual(imageLine('![x](<a b.png> "cap")'), { alt: "x", src: "a b.png", caption: "cap" });
	for (const not of ["text ![a](b.png)", "![a](b.png) text", "![a](b.png)![c](d.png)", "[a](b.png)", "![a]()", "![a](< >)", "![a](b.png", "!(a)[b.png]", "> ![a](b.png)", "- ![a](b.png)", ""]) assert.equal(imageLine(not), null, JSON.stringify(not));
});

test("the pictures of a text: in order, not in code fences, not in quotes, not in the middle of a sentence", () => {
	const text = ["# T", "![one](1.png)", "text ![no](x.png) text", "```", "![code](c.png)", "```", "> ![quoted](q.png)", "", "![two](2.png)", "```js", "![also code](d.png)", "```", "![three](<3 3.png>)"].join("\n");
	assert.deepEqual(markdownImages(text).map((m) => m.src), ["1.png", "2.png", "3 3.png"]);
	assert.deepEqual(markdownImages("![a](a.png)\r\n![b](b.png)\r\n").map((m) => m.alt), ["a", "b"], "Windows newlines");
	assert.deepEqual(markdownImages(undefined), []);
	assert.deepEqual(markdownImages(42), []);
});

test("the renderer draws exactly the pictures the validator counts (random markdown, 400 texts)", () => {
	const r = rng(2024);
	const kinds = ["plain words here", "# a heading", "![pic](a.png)", '![pic](b.png "cap")', "![pic](<c d.png>)", "> quoted line", "> ![q](q.png)", "- item one", "1. numbered", "```", "```js", "| a | b |", "|---|---|", "| 1 | 2 |", "", "", "text ![mid](m.png) text", "---", "![](e.png)"];
	for (let n = 0; n < 400; n++) {
		const text = Array.from({ length: 1 + Math.floor(r() * 14) }, () => kinds[Math.floor(r() * kinds.length)]).join("\n");
		const { svc, asked } = fakeImages();
		const block = markdownBlock(text, 60, ctxWith(svc), "0.0");
		assert.equal(asked.length, markdownImages(text).length, `${q(text)}\nrendered ${asked.length}, counted ${markdownImages(text).length}`);
		assert.equal(block.targets.filter((t) => t.kind === "image").length, asked.length, "one image target for each");
	}
});

test("a picture in Markdown is a framed block between the text around it, with its caption", () => {
	const { svc, asked } = fakeImages();
	const block = markdownBlock('Before.\n\n![A sunset](pics/sunset.png "Taken at dusk")\n\nAfter.', 60, ctxWith(svc), "0.0");
	const text = rowsToLines(block.rows).join("\n");
	assert.deepEqual(asked, ["pics/sunset.png"]);
	assert.match(text, /Before\.\n\n╭─ A sunset ─+╮\n(│ +│\n)+│Taken at dusk +│\n╰─+╯\n\nAfter\./);
	const t = block.targets.find((x) => x.kind === "image")!;
	assert.equal(t.id, "image:0.0.m0");
	assert.equal(t.label, "A sunset");
	assert.deepEqual([t.rect.x, t.rect.y, t.rect.w, t.rect.h], [1, 3, 20, 4], "the area inside the frame, under the text");
	assert.deepEqual(t.image, { key: "k1", cols: 20, rows: 4 });
});

test("two pictures in one Markdown have different target ids; the alt text defaults to the file name", () => {
	const { svc } = fakeImages();
	const block = markdownBlock("![](one.png)\n\n![](two.png)", 60, ctxWith(svc), "0.1");
	const ts = block.targets.filter((t) => t.kind === "image");
	assert.deepEqual(ts.map((t) => t.id), ["image:0.1.m0", "image:0.1.m1"]);
	assert.deepEqual(ts.map((t) => t.label), ["one.png", "two.png"]);
	assert.ok(ts[1].rect.y > ts[0].rect.y + ts[0].rect.h, "the second is below the first");
});

test("without graphics the picture is the labelled frame with the file's details; with no service at all it still draws", () => {
	const none = fakeImages({ graphics: false });
	const t1 = rowsToLines(markdownBlock("![Sunset](a.png)", 60, ctxWith(none.svc), "0").rows).join("\n");
	assert.match(t1, /▒ Sunset/);
	assert.match(t1, /described a\.png/);
	const t2 = rowsToLines(markdownBlock("![Sunset](a.png)", 60, ctxWith(undefined), "0").rows).join("\n");
	assert.match(t2, /▒ Sunset/);
	assert.match(t2, /a\.png/);
});

test("without a render context, in a quote, and in a code fence the syntax stays text", () => {
	const { svc, asked } = fakeImages();
	assert.match(rowsToLines(markdownBlock("![a](b.png)", 60).rows).join("\n"), /!a \(b\.png\)/, "no context (a tooltip panel)");
	const quoted = rowsToLines(markdownBlock("> ![a](b.png)", 60, ctxWith(svc), "0").rows).join("\n");
	assert.match(quoted, /!a \(b\.png\)/);
	const fenced = rowsToLines(markdownBlock("```\n![a](b.png)\n```", 60, ctxWith(svc), "0").rows).join("\n");
	assert.match(fenced, /!\[a\]\(b\.png\)/, "code is shown as typed");
	assert.deepEqual(asked, []);
});

test("a picture in an open FAQ answer: drawn two columns in, and its target moves with it", () => {
	const { svc, asked } = fakeImages();
	const c = compile(`root = Stack([f])\nf = Faq([q], true)\nq = FaqItem("What does it look like?", "It looks like this:\\n\\n![The result](shot.png)\\n\\nThat is all.")`);
	assert.deepEqual(c.errors, []);
	const r = renderTree(c.root!, 70, newState(), { images: svc });
	assert.deepEqual(asked, ["shot.png"]);
	const t = r.block.targets.find((x) => x.kind === "image")!;
	assert.ok(t, "the picture's target reached the widget");
	assert.equal(t.rect.x, 1 + 2, "inside the frame (1), inside the answer's indent (2)");
	const lines = rowsToLines(r.block.rows);
	assert.match(lines[t.rect.y - 1], /^ {2}╭─ The result/, "the frame starts under the indent");
	// a closed question draws no picture at all
	const closed = renderTree(compile(`root = Stack([f])\nf = Faq([q])\nq = FaqItem("Q?", "![x](y.png)")`).root!, 70, newState(), { images: fakeImages().svc });
	assert.equal(closed.block.targets.filter((x) => x.kind === "image").length, 0);
});

test("the picture limit counts Image components and picture lines together", () => {
	const lines = (n: number) => Array.from({ length: n }, (_, i) => `![p${i}](p${i}.png)`).join("\\n");
	assert.deepEqual(compile(`root = Stack([x])\nx = Markdown("${lines(LIMITS.images)}")`).errors, []);
	const over = compile(`root = Stack([x])\nx = Markdown("${lines(LIMITS.images + 1)}")`);
	assert.ok(over.errors.some((e) => e.includes(`picture ${LIMITS.images + 1}`) && e.includes(`at most ${LIMITS.images}`)), over.errors.join(" | "));
	const mixed = compile(`root = Stack([a, b])\na = Markdown("${lines(LIMITS.images)}")\nb = Image("x.png")`);
	assert.ok(mixed.errors.some((e) => e.includes("picture")), "an Image after twelve lines is the thirteenth");
	const faq = compile(`root = Stack([f, m])\nf = Faq([q], true)\nq = FaqItem("Q?", "${lines(LIMITS.images)}")\nm = Markdown("![one more](z.png)")`);
	assert.ok(faq.errors.some((e) => e.includes("picture")), "FAQ answers count");
});

// ---------- through pi: the tool's checks and the real widget ----------

test("the tool checks Markdown pictures like Image: a missing file, a remote URL, and a FAQ answer all come back with a line", { skip }, async () => {
	const ext: any = await import("../src/pi/extension.ts");
	const dir = mkdtempSync(join(tmpdir(), "openui-md-"));
	try {
		const png = join(dir, "ok picture.png");
		writeFileSync(png, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from("IHDR"), Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0]), Buffer.alloc(40)]));
		const check = (md: string, faq = false) => ext.checkImages(compile(faq ? `root = Stack([f])\nf = Faq([q], true)\nq = FaqItem("Q?", ${q(md)})` : `root = Stack([m])\nm = Markdown(${q(md)})`).root);
		assert.deepEqual(check(`Text\n\n![ok](<${png}>)`), [], "an existing file, with spaces in its path");
		const missing = check(`a\n\n![gone](${dir}/nope.png)`);
		assert.equal(missing.length, 1);
		assert.match(missing[0], /^line 2: Markdown picture ".*nope\.png": file not found/);
		assert.match(check("![x](https://example.com/a.png)")[0], /Markdown picture "https:\/\/example\.com\/a\.png": remote URLs are not fetched/);
		assert.match(check("![x](nope.png)", true)[0], /^line 3: Markdown picture "nope\.png": file not found/, "an FAQ answer is checked too");
		assert.deepEqual(check("```\n![x](nope.png)\n```\n> ![y](nope2.png)\ninline ![z](nope3.png) text"), [], "text that is not a picture is not checked");
		assert.equal(check(`![a](${"x".repeat(200)}.png)`)[0].includes("..."), true, "a very long path is shortened in the message");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

async function withKitty(fn: (s: any) => Promise<void>) {
	const s = await setup();
	const before = s.tui.getCapabilities();
	s.tui.setCapabilities({ images: "kitty", trueColor: true, hyperlinks: false });
	s.tui.setCellDimensions({ widthPx: 9, heightPx: 18 });
	try {
		await fn(s);
	} finally {
		s.tui.setCapabilities(before);
	}
}
const PNG = "docs/screenshots/notes-tray.png";

test("through pi-tui: one picture command inside the Markdown, after its text, with the frame around it", { skip }, async () => {
	await withKitty(async ({ tui, make }) => {
		const lines: string[] = make(`root = Stack([m])\nm = Markdown("Before.\\n\\n![Two notes](${PNG} \\"A caption\\")\\n\\nAfter.")`).render(90);
		const at = lines.findIndex((l) => isImg(l));
		assert.ok(at > 0, "the picture is there");
		assert.equal(lines.filter((l) => isImg(l)).length, 1, "one image line: pi-tui puts the whole command on the first row");
		const text = lines.map((l) => strip(l));
		assert.ok(text[at - 1].includes("╭─ Two notes"), "the frame's top border is the row above");
		assert.ok(text.some((l) => l.includes("A caption")), "the caption");
		assert.ok(text.findIndex((l) => l.includes("After.")) > at, "text continues below");
		const ctl = /\x1b_G([^;]*);/.exec(lines[at])![1];
		assert.match(ctl, /f=100/);
		assert.ok(/(^|,)c=\d+/.test(ctl) && /(^|,)r=\d+/.test(ctl), "with a size in cells");
		const before = strip(lines[at].slice(0, lines[at].indexOf("\x1b_G")));
		assert.equal(tui.visibleWidth(before), 2 + 1, "gutter, then the frame's left border: the picture starts inside it");
		for (const l of lines) if (!isImg(l)) assert.ok(tui.visibleWidth(l) <= 90);
	});
});

test("through pi-tui: in a Card, in an open FAQ, and at narrow widths the picture stays inside its frame and the terminal", { skip }, async () => {
	await withKitty(async ({ tui, make }) => {
		const inCard = make(`root = Stack([c])\nc = Card([m], "Doc")\nm = Markdown("![Two notes](${PNG})")`).render(80);
		const a = inCard.findIndex((l) => isImg(l));
		assert.equal(tui.visibleWidth(strip(inCard[a].slice(0, inCard[a].indexOf("\x1b_G")))), 2 + 1 + 1 + 1, "gutter, card border, card padding, frame border");
		const faq = make(`root = Stack([f])\nf = Faq([q], true)\nq = FaqItem("Q?", "![Two notes](${PNG})")`).render(80);
		const b = faq.findIndex((l) => isImg(l));
		assert.equal(tui.visibleWidth(strip(faq[b].slice(0, faq[b].indexOf("\x1b_G")))), 2 + 2 + 1, "gutter, the answer's indent, frame border");
		for (const width of [30, 50]) {
			const narrow: string[] = make(`root = Stack([m])\nm = Markdown("Text.\\n\\n![Two notes](${PNG})")`).render(width);
			const at = narrow.findIndex((l) => isImg(l));
			const cols = Number(/,c=(\d+)/.exec(narrow[at])![1]);
			assert.ok(2 + 1 + cols + 1 <= width, `${cols} columns plus gutter and frame fit in ${width}`);
			for (const l of narrow) if (!isImg(l)) assert.ok(tui.visibleWidth(l) <= width, `${width}: ${strip(l)}`);
		}
	});
});

test("through pi-tui: hovering the picture lights its frame; the picture does not move or resend", { skip }, async () => {
	await withKitty(async ({ make, move, find }) => {
		const widget = make(`root = Stack([m])\nm = Markdown("Text.\\n\\n![Two notes](${PNG})")`);
		const before: string[] = widget.render(90);
		const t = find(widget, (x: any) => x.kind === "image");
		move(widget, t);
		const after: string[] = widget.render(90);
		assert.notStrictEqual(after, before, "hover changed the picture");
		const a = before.findIndex((l) => isImg(l));
		assert.equal(after.findIndex((l) => isImg(l)), a, "the picture is on the same row");
		const command = (l: string) => l.slice(l.indexOf("\x1b_G"), l.lastIndexOf("\x1b\\") + 2);
		assert.equal(command(after[a]), command(before[a]), "and its command is byte for byte the same");
		assert.notEqual(after[a], before[a], "the frame's left border on that row changed colour (the picture itself cannot be styled)");
		assert.ok(after.some((l, i) => l !== before[i] && !isImg(l)), "and so did the rest of the frame");
	});
});
