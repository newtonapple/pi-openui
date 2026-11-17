// A focused or hovered target must stay visible when it is drawn in block or braille glyphs: reversing a full block paints it
// in the terminal's background colour (the bar vanishes), and underlining draws a line under every cell.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LANG_SAMPLES } from "../src/lang/samples.ts";
import { sample, setup, skip, strip } from "./pi-setup.ts";

/** block elements (▀ █ ▁..▇ ▌ ░ ▒ ▓ quadrants) and braille: glyphs that are the ink itself */
const INK = /[\u2580-\u259f\u2800-\u28ff]/;
/** the text between reverse video (7) or underline (4) being switched on and off again */
const REVERSED = /\x1b\[7m((?:(?!\x1b\[27m)[^])*)\x1b\[27m/g;
const UNDERLINED = /\x1b\[4m((?:(?!\x1b\[24m)[^])*)\x1b\[24m/g;

/** every glyph of ink that sits inside a reverse or underline span */
function inkInSpans(lines: string[]): string[] {
	const found: string[] = [];
	for (const line of lines) for (const re of [REVERSED, UNDERLINED]) for (const m of line.matchAll(re)) for (const ch of strip(m[1])) if (INK.test(ch)) found.push(ch);
	return found;
}

/** Every visible character of a line with the foreground colour (the last 38/39 code) it is drawn in. */
function paint(line: string): Array<{ ch: string; fg: string }> {
	const out: Array<{ ch: string; fg: string }> = [];
	let fg = "";
	for (const m of line.matchAll(/\x1b\[([0-9;]*)m|([^\x1b])/g)) {
		if (m[2] !== undefined) out.push({ ch: m[2], fg });
		else if (m[1] === "39" || m[1] === "0") fg = "";
		else if (m[1].startsWith("38;")) fg = m[1];
	}
	return out;
}

/** The ink cells that look different in `after` than in `before`: where they were, and what colour they had and have. */
function changedInk(before: string[], after: string[]): Array<{ was: string; now: string }> {
	const changed: Array<{ was: string; now: string }> = [];
	before.forEach((line, y) => {
		const a = paint(line);
		const b = paint(after[y] ?? "");
		a.forEach((c, x) => {
			if (INK.test(c.ch) && b[x]?.ch === c.ch && b[x].fg !== c.fg) changed.push({ was: c.fg, now: b[x].fg });
		});
	});
	return changed;
}

const BARS = `root = Stack([chart])
chart = BarChart(["north", "south", "east", "west"], [91, 84, 40, 62], "Load", "%", [t1])
t1 = Tooltip("east", "Lowest of the four", "East is draining.")`;

const HORIZONTAL_BARS = `root = Stack([chart])
chart = BarChart(["north", "south", "east", "west", "centre", "coast", "inland", "islands", "uplands", "lowlands", "river", "delta"], [91, 84, 40, 62, 12, 5, 77, 31, 20, 19, 18, 17], "Load", "%", [t1])
t1 = Tooltip("east", "Lowest of the four", "East is draining.")`;

test("a focused bar keeps its colour: its blocks are lit in the text colour, and its label still reverses", { skip }, async () => {
	const { theme, make, click, find } = await setup();
	const lit: string = theme.fg("text", "X").split("X")[0];
	const widget = make(BARS);
	widget.render(100);
	const bar = find(widget, (t: any) => t.kind === "tip" && t.label === "east");
	const idle: string[] = widget.render(100);
	assert.ok(idle.join("").includes("█"), "the bars are drawn");
	assert.ok(!idle.join("").includes(`\x1b[1m${lit}█`), "nothing is lit while nothing is focused");
	assert.ok(!idle.join("").includes("\x1b[7m"), "nothing is reversed while nothing is focused");
	click(widget, bar);
	const lines: string[] = widget.render(100);
	assert.deepEqual(inkInSpans(lines), [], "no block glyph inside reverse video or underline");
	assert.ok(lines.join("").includes(`\x1b[1m${lit}█`), "the focused bar's blocks are bold and in the text colour");
	assert.ok(lines.join("").includes(`\x1b[1m${lit}▄`) || lines.join("").includes(`\x1b[1m${lit}▅`) || lines.join("").includes(`\x1b[1m${lit}▆`) || lines.join("").includes(`\x1b[1m${lit}▇`) || lines.join("").includes(`\x1b[1m${lit}▃`), "so is its partial block at the top");
	const reversed = lines.filter((l) => l.includes("\x1b[7m")).map(strip).join("\n");
	assert.match(reversed, /east/, "the label is reversed");
	assert.match(reversed, /40%/, "the value is reversed");
});

test("a hovered bar keeps its blocks in the text colour, and its label still underlines", { skip }, async () => {
	const { theme, make, move, find } = await setup();
	const lit: string = theme.fg("text", "X").split("X")[0];
	const widget = make(BARS);
	widget.render(100);
	const bar = find(widget, (t: any) => t.kind === "tip" && t.label === "east");
	move(widget, bar);
	const lines: string[] = widget.render(100);
	assert.deepEqual(inkInSpans(lines), [], "no block glyph inside reverse video or underline");
	assert.ok(lines.join("").includes(`\x1b[1m${lit}█`), "the hovered bar is bold and in the text colour");
	const underlined = lines.filter((l) => l.includes("\x1b[4m")).map(strip).join("\n");
	assert.match(underlined, /east/, "the label underlines");
});

test("a focused horizontal bar keeps its blocks", { skip }, async () => {
	const { make, click, move, find } = await setup();
	const widget = make(HORIZONTAL_BARS);
	widget.render(60);
	const bar = find(widget, (t: any) => t.kind === "tip" && t.label === "east");
	move(widget, bar);
	assert.deepEqual(inkInSpans(widget.render(60)), []);
	click(widget, bar);
	const lines: string[] = widget.render(60);
	assert.deepEqual(inkInSpans(lines), []);
	assert.ok(lines.join("").includes("\x1b[7m"), "its label still reverses");
});

test("no component draws ink inside reverse video or underline when hovered or focused", { skip }, async () => {
	const { w, make, click, move } = await setup();
	let checked = 0;
	const bad = new Set<string>();
	for (const s of LANG_SAMPLES) {
		for (const width of [100, 57]) {
			const probe = make(s.source);
			probe.render(width);
			const targets: any[] = probe.lastBlock().targets;
			for (let i = 0; i < targets.length; i++) {
				for (const act of [move, click]) {
					w.resetAll(); // a click can open a dialog or arm a widget, and that would swallow the next widget's mouse events
					const widget = make(s.source);
					widget.render(width);
					const t = widget.lastBlock().targets[i];
					act(widget, t);
					const lines: string[] = widget.render(width);
					const what = act === move ? "hover" : "focus";
					if (inkInSpans(lines).length) bad.add(`${s.key}: ${what} on ${t.kind} ${t.label}`);
					checked++;
				}
			}
		}
	}
	assert.deepEqual([...bad], [], "hover or focus reverses or underlines ink");
	assert.ok(checked > 100, `checked ${checked} targets`);
});

for (const how of ["focus", "hover"] as const) {
	test(`${how}: lit ink is drawn in the text colour, not in the colour of the series it belongs to`, { skip }, async () => {
		const { theme, make, click, move, find } = await setup();
		const act = how === "focus" ? click : move;
		const text = /\x1b\[(38;[0-9;]+)m/.exec(theme.fg("text", "X"))![1];
		const series = (i: number) => /\x1b\[(38;[0-9;]+)m/.exec(theme.fg(["accent", "success"][i], "X"))![1];
		assert.notEqual(text, series(0));
		assert.notEqual(text, series(1));

		// a bar chart has one series, series 0: the selected bar must differ from the others
		const bars = make(BARS);
		bars.render(100);
		const idleBars: string[] = bars.render(100);
		act(bars, find(bars, (t: any) => t.kind === "tip" && t.label === "east"));
		const litBars = changedInk(idleBars, bars.render(100));
		assert.ok(litBars.length > 0, "the selected bar changed");
		assert.ok(litBars.every((c) => c.was === series(0) && c.now === text), `bar ink goes from series 0 to the text colour: ${JSON.stringify(litBars[0])}`);

		// a line chart with two series: the selected column changes in both
		const line = make(sample("line"));
		line.render(100);
		const idleLine: string[] = line.render(100);
		act(line, find(line, (t: any) => t.kind === "tip" && t.label === "Thu"));
		const litLine = changedInk(idleLine, line.render(100));
		assert.ok(litLine.every((c) => c.now === text), "line ink in the selected column is the text colour");
		assert.ok(litLine.some((c) => c.was === series(0)) && litLine.some((c) => c.was === series(1)), "series 0 and series 1 both changed colour");
	});
}
