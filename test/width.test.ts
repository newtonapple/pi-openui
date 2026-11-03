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
import { setWide, textWidth } from "../src/diagram/canvas.ts";
import { WIDE as TABLE } from "../src/diagram/wide.ts";
import { PROBE_SPANS } from "../src/diagram/widefix.ts";
import { syncWidths } from "../src/pi/widths.ts";
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

/** Every code point where pi and we disagree about being two cells wide: [pi draws two, we count fewer] and [we count two, pi draws one]. */
async function disagreements() {
	const tui: any = await import("@earendil-works/pi-tui");
	const weWrong: number[] = [];
	const weExtra: number[] = [];
	for (let cp = 0x20; cp <= 0x3ffff; cp++) {
		if (cp >= 0xd800 && cp <= 0xdfff) continue;
		const ch = String.fromCodePoint(cp);
		const pi = tui.visibleWidth(ch);
		if (pi === 0) continue; // combining marks and the like: inside a cluster they add nothing in either measure
		const ours = textWidth(ch);
		if (pi === 2 && ours !== 2) weWrong.push(cp);
		if (pi !== 2 && ours === 2) weExtra.push(cp);
	}
	return { weWrong, weExtra };
}
const inSpans = (cp: number) => PROBE_SPANS.some(([a, b]) => cp >= a && cp <= b);

test("the committed table of two-cell characters is right outside the blocks the extension re-checks, and a stale part inside them is reported, not failed", { skip }, async (t) => {
	const { weWrong, weExtra } = await disagreements();
	const regenerate = "src/diagram/wide.ts is out of date with the installed pi: run `npm run width` (it is generated, do not edit it).";
	// CJK, Hangul and the like change rarely and nothing corrects them at run time: a difference there is a real failure
	assert.deepEqual(weWrong.filter((cp) => !inSpans(cp)).slice(0, 50), [], `characters pi draws two cells wide that we count as one, outside the re-checked blocks\n${regenerate}`);
	assert.deepEqual(weExtra.filter((cp) => !inSpans(cp)).slice(0, 50), [], `characters we count as two cells that pi draws as one, outside the re-checked blocks\n${regenerate}`);
	// the symbol and emoji blocks grow with every Unicode release; the extension asks pi about them when it loads (the test after
	// this one proves that), so a table that is a release behind costs nothing at run time and must not fail anyone's tests
	const behind = [...weWrong, ...weExtra].filter(inSpans);
	if (behind.length) t.diagnostic(`src/diagram/wide.ts is ${behind.length} characters behind pi (${ranges(weWrong.filter(inSpans))} wide in pi${weExtra.some(inSpans) ? `; ${ranges(weExtra.filter(inSpans))} narrow in pi` : ""}). The extension corrects this when it loads. To update the file: npm run width`);
});

test("after the extension corrects its table when it loads, we agree with pi on every character of Unicode", { skip }, async () => {
	try {
		syncWidths();
		const { weWrong, weExtra } = await disagreements();
		assert.deepEqual([weWrong.length, weExtra.length], [0, 0], `pi draws two cells, we count fewer: ${ranges(weWrong).slice(0, 300)}\nwe count two cells, pi draws one: ${ranges(weExtra).slice(0, 300)}`);
	} finally {
		setWide(TABLE);
	}
});

test("loading the extension corrects a table that is behind pi", { skip }, async () => {
	const { default: extension } = await import("../src/pi/extension.ts");
	try {
		setWide([]); // a table that knows no wide character at all
		assert.equal(textWidth("🚀"), 1, "the stale table is stale");
		extension({ registerTool() {}, registerMessageRenderer() {}, registerCommand() {}, on() {} } as any);
		assert.equal(textWidth("🚀"), 2, "loading the extension asked pi");
		assert.equal(textWidth("✅ ❌ ⚡"), 8, "three two-cell characters and two spaces");
	} finally {
		setWide(TABLE);
	}
});

test("a stale table misaligns a row with emoji in pi, and the correction made when the extension loads fixes it", { skip }, async () => {
	const tui: any = await import("@earendil-works/pi-tui");
	const { default: extension } = await import("../src/pi/extension.ts");
	const c = compile(`root = Stack([t])\nt = Table(["Check", "Result"], [["deploy 🚀", "✅ pass"], ["lint", "⚡ fast"]])`);
	const misaligned = () => {
		const { block } = renderTree(c.root!, 60, newState());
		return block.rows.filter((row) => tui.visibleWidth(row.map((cell) => cell.ch).join("")) !== block.w).length;
	};
	try {
		setWide([]); // a table that is behind pi: it counts every emoji as one cell
		assert.ok(misaligned() > 0, "with the stale table, rows with emoji are a different width in pi than in our grid, so their borders slide");
		extension({ registerTool() {}, registerMessageRenderer() {}, registerCommand() {}, on() {} } as any);
		assert.equal(misaligned(), 0, "after the extension has asked pi, every row is as wide in pi as in our grid");
	} finally {
		setWide(TABLE);
	}
});

const WIDE = `✅ ❌ ⚡ ⭐ ☕ 🚀 ⏰ ☰ 日本語 🔥 ✔️`;

/** Every component that lays text out in columns, with wide characters in every place a model puts text. */
const SOURCES: Record<string, string> = {
	table: `root = Stack([t])\nt = Table(["Check", "Result"], [["lint ${WIDE}", "✅ pass"], ["build", "❌ fail ⚡"], ["日本語", "🚀"]])`,
	card: `root = Stack([c])\nc = Card([Text("${WIDE}"), Callout("${WIDE}", "info")], "Card ${WIDE}")`,
	metric: `root = Stack([m])\nm = Metric("Uptime ✅", "99.9% ⭐", "+0.1 ⚡", "good")`,
	bars: `root = Stack([c])\nc = BarChart(["✅ ok", "❌ bad", "🚀 fast"], [3, 2, 5])`,
	choice: `root = Stack([c])\nc = Choice("Deploy ✅ ⚡?", ["日本語 🚀", "build ❌ and a long option ${WIDE} that wraps under its indicator", "x"], "hint 🚀", true)`,
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
