// Width: every row of a widget must be as wide in the terminal as in our grid. If our idea of a character's width differs
// from the terminal's, everything to its right on that row slides one cell and the right border (and a group's border) is
// drawn out of line. pi measures with its own function (visibleWidth), so that is the oracle here: these tests skip when
// pi is not installed.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { renderTree } from "../src/blocks/render.ts";
import { newState } from "../src/blocks/types.ts";
import { textWidth } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";
import { skip, strip } from "./pi-setup.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const sources = (dir: string): string[] =>
	readdirSync(dir).flatMap((f) => {
		const p = join(dir, f);
		return statSync(p).isDirectory() ? sources(p) : p.endsWith(".ts") ? [p] : [];
	});

/** Runs of consecutive code points, as "u+2630-2637 u+2705". */
function ranges(cps: number[]): string {
	if (!cps.length) return "";
	const out: string[] = [];
	let start = cps[0];
	let prev = cps[0];
	for (const cp of [...cps.slice(1), -1]) {
		if (cp !== prev + 1) {
			out.push(start === prev ? `U+${start.toString(16)}` : `U+${start.toString(16)}-${prev.toString(16)}`);
			start = cp;
		}
		prev = cp;
	}
	return out.join(" ");
}

test("every glyph this extension draws is one cell wide in pi (a wide icon pushes the rest of its row out of line)", { skip }, async () => {
	const tui: any = await import("@earendil-works/pi-tui");
	const bad = new Map<string, string[]>();
	const files = sources(join(ROOT, "src"));
	assert.ok(files.length > 30, `found the source files (${files.length})`);
	for (const file of files) {
		for (const ch of new Set(readFileSync(file, "utf8"))) {
			if (ch.charCodeAt(0) < 0x80) continue;
			if (tui.visibleWidth(ch) !== 1) (bad.get(ch) ?? bad.set(ch, []).get(ch)!).push(file.slice(ROOT.length));
		}
	}
	const found = [...bad].map(([ch, files]) => `${ch} U+${ch.codePointAt(0)!.toString(16)} is ${tui.visibleWidth(ch)} cells wide in pi, in ${files.join(", ")}`);
	assert.equal(found.length, 0, `${found.join("\n")}\nUse a glyph that is one cell wide in pi and is in the terminal font (test/font.test.ts). In a comment, name it by code point.`);
});

test("our width agrees with pi's on which characters take two cells (✅ ❌ ⚡ 🚀 ☰ and the rest of the wide set)", { skip }, async () => {
	const tui: any = await import("@earendil-works/pi-tui");
	const weWrong: number[] = []; // pi draws two cells, we count fewer
	const weExtra: number[] = []; // we count two cells, pi draws one
	for (let cp = 0x20; cp <= 0x3ffff; cp++) {
		if (cp >= 0xd800 && cp <= 0xdfff) continue;
		const ch = String.fromCodePoint(cp);
		const pi = tui.visibleWidth(ch);
		if (pi === 0) continue; // combining marks and the like: inside a cluster they add nothing in either measure
		const ours = textWidth(ch);
		if (pi === 2 && ours !== 2) weWrong.push(cp);
		if (pi !== 2 && ours === 2) weExtra.push(cp);
	}
	const regenerate = "src/diagram/wide.ts is out of date with the installed pi: run `npm run width` (it is generated, do not edit it).";
	assert.equal(weWrong.length, 0, `${weWrong.length} characters pi draws two cells wide that we count as one: ${ranges(weWrong).slice(0, 300)}\n${regenerate}`);
	assert.equal(weExtra.length, 0, `${weExtra.length} characters we count as two cells that pi draws as one: ${ranges(weExtra).slice(0, 300)}\n${regenerate}`);
});

const WIDE = `✅ ❌ ⚡ ⭐ ☕ 🚀 ⏰ ☰ 日本語 🔥 ✔️`;

/** Every component that lays text out in columns, with wide characters in every place a model puts text. */
const SOURCES: Record<string, string> = {
	table: `root = Stack([t])\nt = Table(["Check", "Result"], [["lint ${WIDE}", "✅ pass"], ["build", "❌ fail ⚡"], ["日本語", "🚀"]])`,
	card: `root = Stack([c])\nc = Card([Text("${WIDE}"), Callout("${WIDE}", "info")], "Card ${WIDE}")`,
	metric: `root = Stack([m])\nm = Metric("Uptime ✅", "99.9% ⭐", "+0.1 ⚡", "good")`,
	bars: `root = Stack([c])\nc = BarChart(["✅ ok", "❌ bad", "🚀 fast"], [3, 2, 5])`,
	faq: `root = Stack([f])\nf = Faq([a])\na = FaqItem("Why ✅?", "Because ❌ and ⚡ and 🚀 and 日本語.")`,
	infra: `root = Stack([m])\nm = InfraMap([z], [InfraLink("a", "b", "✅ link")])\nz = InfraZone("Zone ⚡", [a, b], "warn")\na = InfraNode("a", "node ✅", "storage", "up", "disk ☰")\nb = InfraNode("b", "日本語 🚀", "storage", "down", null)`,
	dag: `root = Stack([d])\nd = Dag([a, b], [["a", "b"]], null, "CI ⚡ ✅")\na = DagNode("a", "build ✅", "done")\nb = DagNode("b", "deploy 🚀 日本語", "failed")`,
	sequence: `root = Stack([s])\ns = SequenceDiagram([p, q], [m, r], "Wake ⚡ 日本語", true)\np = SeqParticipant("p", "Mac ✅", "actor")\nq = SeqParticipant("q", "Node 🚀", "service")\nm = SeqMessage("p", "q", "wake ⚡ ☕")\nr = SeqMessage("q", "p", "ack ✔️ ❌", "return")`,
};

test("every row of a widget is as wide in pi as the grid we drew, with wide characters in text, labels, titles and icons", { skip }, async () => {
	const tui: any = await import("@earendil-works/pi-tui");
	let checked = 0;
	for (const [name, src] of Object.entries(SOURCES)) {
		const c = compile(src);
		if (c.errors.length) assert.fail(`${name}: the test source does not compile: ${c.errors.join("; ")}`);
		for (const width of [50, 80, 120]) {
			const { block } = renderTree(c.root!, width, newState());
			for (const [y, row] of block.rows.entries()) {
				const text = row.map((cell) => cell.ch).join("");
				assert.equal(tui.visibleWidth(text), block.w, `${name}@${width} row ${y} is ${tui.visibleWidth(text)} wide in pi, ${block.w} in our grid: ${text}`);
				checked++;
			}
		}
	}
	assert.ok(checked > 150, `checked ${checked} rows: the sources compile and render`);
});

test("the same holds for every sample: each row is as wide in pi as the block it belongs to", { skip }, async () => {
	const tui: any = await import("@earendil-works/pi-tui");
	for (const s of LANG_SAMPLES) {
		const c = compile(s.source);
		for (const width of [50, 100]) {
			const { block } = renderTree(c.root!, width, newState());
			for (const [y, row] of block.rows.entries()) {
				const text = strip(row.map((cell) => cell.ch).join(""));
				if (text.includes("\x1b")) continue;
				assert.equal(tui.visibleWidth(text), block.w, `${s.key}@${width} row ${y}: ${text}`);
			}
		}
	}
});
