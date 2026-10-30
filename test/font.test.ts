// Every glyph a widget draws must exist in the terminal font. A missing glyph is drawn from a fallback font, which can
// look different or misalign. The font is read directly: set PI_OPENUI_FONT, or the default JetBrains Mono Nerd Font Mono
// that this project was tuned for is used. Skips when no font file is found.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { test } from "node:test";
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";

const FONT = process.env.PI_OPENUI_FONT ?? `${homedir()}/Library/Fonts/JetBrainsMonoNerdFontMono-Regular.ttf`;
const PI = process.env.PI_PKG_RESOLVED;
const skip = !existsSync(FONT) || !PI || !existsSync(`${PI}/dist/modes/interactive/theme/theme.js`);

/** The set of code points a TrueType font maps (cmap formats 4 and 12). */
export function fontCodePoints(path: string): Set<number> {
	const b = readFileSync(path);
	const tables = b.readUInt16BE(4);
	let cmapAt = -1;
	for (let i = 0; i < tables; i++) if (b.toString("ascii", 12 + i * 16, 16 + i * 16) === "cmap") cmapAt = b.readUInt32BE(20 + i * 16);
	assert.ok(cmapAt >= 0, "font has a cmap table");
	const n = b.readUInt16BE(cmapAt + 2);
	const out = new Set<number>();
	for (let i = 0; i < n; i++) {
		const at = cmapAt + b.readUInt32BE(cmapAt + 4 + i * 8 + 4);
		const format = b.readUInt16BE(at);
		if (format === 4) {
			const segX2 = b.readUInt16BE(at + 6);
			const seg = segX2 / 2;
			const ends = at + 14;
			const starts = ends + segX2 + 2;
			const deltas = starts + segX2;
			const rangeOffsets = deltas + segX2;
			for (let sgm = 0; sgm < seg; sgm++) {
				const end = b.readUInt16BE(ends + sgm * 2);
				const start = b.readUInt16BE(starts + sgm * 2);
				const delta = b.readUInt16BE(deltas + sgm * 2);
				const ro = b.readUInt16BE(rangeOffsets + sgm * 2);
				if (start === 0xffff) continue;
				for (let c = start; c <= end; c++) {
					let gid: number;
					if (ro === 0) gid = (c + delta) & 0xffff;
					else {
						gid = b.readUInt16BE(rangeOffsets + sgm * 2 + ro + 2 * (c - start));
						if (gid !== 0) gid = (gid + delta) & 0xffff;
					}
					if (gid !== 0) out.add(c); // glyph 0 is .notdef, the tofu box: the character is NOT in the font
				}
			}
		} else if (format === 12) {
			const groups = b.readUInt32BE(at + 12);
			for (let g = 0; g < groups; g++) {
				const start = b.readUInt32BE(at + 16 + g * 12);
				const end = b.readUInt32BE(at + 20 + g * 12);
				const gid0 = b.readUInt32BE(at + 24 + g * 12);
				for (let c = start; c <= end && c - start < 70000; c++) if (gid0 + (c - start) !== 0) out.add(c);
			}
		}
	}
	return out;
}

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*[mC]/g, "").replace(/\x1b_G[^\x1b]*\x1b\\/g, "");

const EVERYTHING = `root = Stack([c1, c2, c3, c4, im, seq, dag, inf])
c1 = Callout("info", "info")
c2 = Callout("success", "success")
c3 = Callout("warn", "warn")
c4 = Callout("error", "error")
im = Image("data:image/png;base64,AAAA", "no picture")
seq = SequenceDiagram([a1, a2, a3, a4, a5], [m, self, n], "kinds", true)
a1 = SeqParticipant("a1", "actor", "actor")
a2 = SeqParticipant("a2", "service", "service")
a3 = SeqParticipant("a3", "db", "database")
a4 = SeqParticipant("a4", "queue", "queue")
a5 = SeqParticipant("a5", "ext", "external")
m = SeqMessage("a1", "a2", "sync", "sync")
self = SeqMessage("a2", "a2", "self", "async")
n = SeqMessage("a2", "a1", "back", "return")
dag = Dag([d1, d2, d3, d4, d5], [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "a"], ["a", "a"]], "TB")
d1 = DagNode("a", "one", "done")
d2 = DagNode("b", "two", "running")
d3 = DagNode("c", "three", "failed")
d4 = DagNode("d", "four", "pending")
d5 = DagNode("e", "five", "skipped")
inf = InfraMap([z], [l], null, "LR")
z = InfraZone("kinds", [n1, n2, n3, n4, n5, n6, n7, n8, n9])
n1 = InfraNode("client", "client", "client", "up")
n2 = InfraNode("gateway", "gateway", "gateway", "degraded")
n3 = InfraNode("service", "service", "service", "down")
n4 = InfraNode("gpu", "gpu", "gpu", "unknown")
n5 = InfraNode("database", "database", "database")
n6 = InfraNode("storage", "storage", "storage")
n7 = InfraNode("queue", "queue", "queue")
n8 = InfraNode("cloud", "cloud", "cloud")
n9 = InfraNode("plain", "plain")
l = InfraLink("client", "cloud", "x", "dashed")`;

test("every glyph the widgets draw exists in the terminal font", { skip }, async () => {
	const have = fontCodePoints(FONT);
	const tui: any = await import("@earendil-works/pi-tui");
	const themeMod: any = await import(`${PI}/dist/modes/interactive/theme/theme.js`);
	const theme = themeMod.getThemeByName("dark");
	const w: any = await import("../src/pi/widget.ts");
	w.resetAll();
	w.hooks.requestRender = () => {};
	const seen = new Map<string, string>();
	const collect = (lines: string[], where: string) => {
		for (const l of lines)
			for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(strip(l))) {
				for (const ch of segment) {
					const cp = ch.codePointAt(0)!;
					if (cp < 0x7f || (cp >= 0x2800 && cp <= 0x28ff) || cp === 0xfe0f) continue;
					if (!seen.has(ch)) seen.set(ch, where);
				}
			}
	};
	let n = 0;
	const sources = [...LANG_SAMPLES.map((s) => ({ key: s.key, src: s.source })), { key: "everything", src: EVERYTHING }];
	for (const { key, src } of sources) {
		const c = compile(src);
		assert.deepEqual(c.errors, [], key);
		for (const width of [60, 110]) {
			const widget = new w.OpenUIWidget(`font${++n}`, c.root, theme, "echo");
			collect(widget.render(width), `${key}@${width}`);
			const block = widget.lastBlock();
			for (const t of block.targets) {
				widget.handleMouse({ type: "move", button: "none", x: 2 + t.rect.x, y: t.rect.y });
				collect(widget.render(width), `${key}@${width} hover ${t.kind}:${t.label}`);
			}
			w.active.id = widget.id;
			for (let i = 0; i < block.targets.length && i < 12; i++) {
				w.handleKey("\t");
				w.handleKey("\r");
				collect(widget.render(width), `${key}@${width} focus+activate`);
			}
			w.active.id = null;
		}
	}
	void tui;
	const missing = [...seen].filter(([ch]) => !have.has(ch.codePointAt(0)!));
	assert.deepEqual(
		missing.map(([ch, where]) => `${ch} U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} (first seen in ${where})`),
		[],
		`these glyphs are not in ${FONT.split("/").pop()} and would come from a fallback font`,
	);
	assert.ok(seen.size > 60, `audited ${seen.size} distinct glyphs`);
});

test("the font reader tells a real glyph from the tofu box (regression: .notdef counted as present)", { skip: !existsSync(FONT) }, () => {
	const have = fontCodePoints(FONT);
	for (const cp of [0x25c6, 0x2713, 0x251c, 0x2524, 0x39b, 0x3c, 0x2800, 0x28ff]) assert.ok(have.has(cp), `U+${cp.toString(16)} should be present`);
	// these were in the first version of the widgets and are absent from JetBrains Mono Nerd Font Mono
	if (/JetBrainsMonoNerdFontMono/.test(FONT)) for (const cp of [0x2714, 0x2716, 0x2139, 0x29c9, 0x263a, 0x25a8, 0x21cc, 0x24d8]) assert.ok(!have.has(cp), `U+${cp.toString(16)} should be absent`);
});
