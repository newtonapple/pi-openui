// Drives the real widget (pi-tui classes, pi's dark theme) through scripted interactions and dumps the terminal output
// as JSON for scripts/render_shots.py, which paints it into PNGs with a real terminal font.
//   node --import ./test/register-pi.mjs scripts/shots.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";

process.env.COLORTERM = "truecolor";
const PI = process.env.PI_PKG_RESOLVED;
if (!PI) throw new Error("pi is not installed where test/register-pi.mjs looks for it (set PI_PKG to its package folder)");
const tui: any = await import("@earendil-works/pi-tui");
const themeMod: any = await import(`${PI}/dist/modes/interactive/theme/theme.js`);
const theme = themeMod.getThemeByName(process.env.SHOT_THEME ?? "dark");
const w: any = await import("../src/pi/widget.ts");
tui.setCapabilities({ images: "kitty", trueColor: true, hyperlinks: false });
tui.setCellDimensions({ widthPx: 9, heightPx: 18 });
w.hooks.requestRender = () => {};
w.hooks.copy = () => {};
w.hooks.sendEcho = () => {};
w.hooks.sendLive = () => {};
// the note editor answers with the text of the step that opened it
let noteText: string | undefined;
w.hooks.prompt = async () => noteText;

const GUTTER = 2;
type Step = { move: string } | { click: string } | { key: string } | { notes: true } | { write: string; text: string; shift?: boolean } | { other: string; text: string };
interface Shot {
	file: string;
	sample?: string;
	source?: string;
	width?: number;
	steps?: Step[];
}

/** Everything the docs show. `file` is the PNG name. Steps find a target by its label (or "kind:label"). */
export const SHOTS: Shot[] = [
	{ file: "dashboard", sample: "dashboard" },
	{ file: "text", sample: "text", width: 90 },
	{ file: "table", sample: "table", width: 80 },
	{ file: "table-tooltip", sample: "table", width: 80, steps: [{ move: "row:3" }] },
	{ file: "table-panel", sample: "table", width: 80, steps: [{ click: "row:3" }] },
	{ file: "tabs", sample: "tabs", width: 80 },
	{ file: "tabs-nodes", sample: "tabs", width: 80, steps: [{ click: "Nodes" }] },
	{
		file: "stack",
		width: 90,
		source: `root = Stack([title, row, wrapped])
title = Text("Stack: a row, then a wrapping row", "heading")
row = Stack([a, b, c], "row", "l")
a = Metric("Left", "1")
b = Metric("Middle", "2")
c = Metric("Right", "3")
wrapped = Stack([x1, x2, x3, x4, x5, x6], "row", "s", true)
x1 = Button("one")
x2 = Button("two")
x3 = Button("three")
x4 = Button("four")
x5 = Button("five")
x6 = Button("six")`,
	},
	{
		file: "card",
		width: 80,
		source: `root = Stack([outer])
outer = Card([intro, inner], "Release 2.3")
intro = Text("Cards group related content under an optional title.")
inner = Card([note], "Nested card")
note = Text("They nest, and they wrap long text to their own width.", "muted")`,
	},
	{
		file: "metric",
		width: 90,
		source: `root = Stack([tiles])
tiles = Stack([a, b, c, d], "row")
a = Metric("Requests", "12.4k", "+3% vs yesterday", "good")
b = Metric("p95 latency", "180 ms", "+22 ms", "warn")
c = Metric("Errors", "2.1%", "+1.4%", "bad")
d = Metric("Region", "eu-west", "unchanged", "neutral", [t])
t = Tooltip("Region", "Primary region", "Failover is us-east.")`,
	},
	{
		file: "bar",
		width: 90,
		source: `root = Stack([v, h])
v = BarChart(["spark-1", "spark-2", "spark-3", "spark-4"], [91, 84, 77, 62], "GPU load", "%", [t])
t = Tooltip("spark-3", "Rebooted on 21 Oct", "Driver update, back in service the same day.", null, null, "warn")
h = BarChart(["a very long category name", "second category name", "third"], [1200, 860, -150], "Horizontal when labels are long, or a value is negative")`,
	},
	{
		file: "callout",
		width: 80,
		source: `root = Stack([a, b, c, d], "column", "s")
a = Callout("An info callout is the default.", "info")
b = Callout("Deploy finished without errors.", "success")
c = Callout("Disk usage is above 80% on spark-3.", "warn")
d = Callout("Health check failed twice in a row.", "error")`,
	},
	{
		file: "button",
		width: 80,
		source: `root = Stack([row, link])
row = Stack([a, b, c], "row")
a = Button("Restart vllm", @ToAssistant("Restart the vllm service on dgx-spark-1"))
b = Button("Show logs")
c = Button("Drain node", Action([@ToAssistant("Drain dgx-spark-3 before the reboot")]))
link = Button("Open the runbook", @OpenUrl("https://example.com/runbook"))`,
	},
	{
		file: "choice",
		width: 90,
		source: `root = Stack([q])
q = Choice("Which model should serve chat?", ["qwen3-32b", "llama-3.3-70b", "gemma-3-27b"], "I will restart vllm with it and report back")`,
	},
	{ file: "choice-card", sample: "choice-card", width: 90, steps: [{ click: "web-2" }, { click: "Disk" }, { click: "Network" }] },
	{
		file: "choice-other",
		sample: "choice-card",
		width: 90,
		steps: [{ click: "web-2" }, { click: "Disk" }, { other: "Which checks should I run?", text: "also look at the logs" }],
	},
	{
		file: "choice-sent",
		sample: "choice-card",
		width: 90,
		steps: [{ click: "web-2" }, { click: "Disk" }, { other: "Which checks should I run?", text: "also look at the logs" }, { click: "Send answers" }],
	},
	{
		file: "faq",
		width: 90,
		source: `root = Stack([f])
f = Faq([a, b, c], true)
a = FaqItem("What does draining do?", "It stops **new** requests and lets running ones finish.\\n\\n1. queue pauses\\n2. in-flight requests complete")
b = FaqItem("How do I undo it?", "Run \`uncordon\` on the node.")
c = FaqItem("Why did spark-3 reboot?", "A driver update needed it.")`,
	},
	{ file: "interactive-picked", sample: "interactive", width: 90, steps: [{ click: "llama-3.3-70b" }, { click: "How do I undo it?" }] },
	{ file: "markdown", sample: "markdown", width: 80 },
	{ file: "code", sample: "code-langs", width: 80 },
	{ file: "line", sample: "line", width: 100 },
	{ file: "line-tooltip", sample: "line", width: 100, steps: [{ move: "Thu" }] },
	{ file: "area", sample: "area", width: 100 },
	{ file: "pie", sample: "pie", width: 100 },
	{ file: "pie-tooltip", sample: "pie", width: 100, steps: [{ move: "llama-3.3-70b" }] },
	{ file: "radar", sample: "radar", width: 90 },
	{ file: "geo", sample: "geo", width: 90 },
	{ file: "geo-tooltip", sample: "geo", width: 90, steps: [{ click: "Tokyo  35.68, 139.69" }] },
	{ file: "dag", sample: "dag", width: 90 },
	{ file: "dag-tooltip", sample: "dag", width: 90, steps: [{ click: "Lint  failed" }] },
	{ file: "erd", sample: "erd", width: 110 },
	{ file: "infra", sample: "infra", width: 110 },
	{ file: "sequence", sample: "sequence", width: 100 },
	{ file: "image", sample: "image", width: 90 },
	{ file: "image-tooltip", sample: "image", width: 90, steps: [{ move: "Sunset over the ridge" }] },
	{
		file: "markdown-image",
		width: 90,
		source: `root = Stack([page])
page = Card([doc], "README.md")
doc = Markdown("# pi-openui\\n\\nInteractive widgets for the **pi** terminal UI: tables, charts, diagrams and maps, drawn with unicode.\\n\\n> Pictures use the terminal's image protocol, so they sit between paragraphs like this.\\n\\n![Two notes pinned on a table](docs/screenshots/notes-tray.png \\"Notes pinned to a table: pins on the elements, a tray under it\\")\\n\\n## Try it\\n\\n1. Run \`/openui-gallery\`\\n2. Run \`/openui-notes\`, then click a cell\\n\\nSee [docs/interaction.md](docs/interaction.md#notes).")`,
	},
	{ file: "notes-mode", sample: "table", width: 80, steps: [{ notes: true }, { move: "Table > row 3, State" }] },
	{
		file: "notes-tray",
		sample: "table",
		width: 80,
		steps: [{ notes: true }, { write: "Table > row 3, State", text: "Why did this one reboot? Say when." }, { write: "Table > column GPU %", text: "Average over what window?" }],
	},
	{ file: "notes-dag", sample: "dag", width: 90, steps: [{ notes: true }, { write: "Dag > node Lint", text: "Which rules failed?" }] },
];

// The picture command is followed by "move right n columns" to step over the cells it covers. The painter has no cursor, so the
// move becomes n spaces: without them everything after the picture on that row (a frame's right border) lands under it.
const strip = (s: string) => s.replace(/\x1b_G[^\x1b]*\x1b\\/g, "").replace(/\x1b\[(\d+)C/g, (_, n) => " ".repeat(Number(n)));

async function run(shot: Shot, id: number) {
	const src = shot.source ?? LANG_SAMPLES.find((s) => s.key === shot.sample)?.source;
	if (!src) throw new Error(`no source for ${shot.file}`);
	const c = compile(src);
	if (!c.ok) throw new Error(`${shot.file}: ${c.errors.join("; ")}`);
	w.resetAll();
	const width = shot.width ?? 100;
	const widget = new w.OpenUIWidget(`shot${id}`, c.root, theme, "echo");
	widget.render(width);
	const find = (label: string) => {
		const block = widget.lastBlock();
		const t = block.targets.find((x: any) => x.label === label || `${x.kind}:${x.label}` === label);
		if (!t) throw new Error(`${shot.file}: no target "${label}". Have: ${block.targets.map((x: any) => x.label).join(" | ")}`);
		return t;
	};
	for (const step of shot.steps ?? []) {
		if ("move" in step) {
			const t = find(step.move);
			widget.handleMouse({ type: "move", button: "none", x: GUTTER + t.rect.x + Math.floor(t.rect.w / 2), y: t.rect.y });
		} else if ("click" in step) {
			const t = find(step.click);
			widget.handleMouse({ type: "click", button: "left", x: GUTTER + t.rect.x + Math.floor(t.rect.w / 2), y: t.rect.y });
		} else if ("notes" in step) {
			w.toggleNotesNewest();
		} else if ("write" in step) {
			const t = find(step.write);
			noteText = step.text;
			widget.handleMouse({ type: "click", button: "left", shift: !!step.shift, x: GUTTER + t.rect.x + Math.floor(t.rect.w / 2), y: t.rect.y });
			await new Promise((r) => setTimeout(r, 0)); // the editor answers on the next turn
		} else if ("other" in step) {
			// the Other row of the question with these words: the editor answers with the text of the step
			const t = widget.lastBlock().targets.find((x: any) => x.choice?.index === "other" && x.choice.of.question === step.other);
			if (!t) throw new Error(`${shot.file}: no Other row for "${step.other}"`);
			noteText = step.text;
			widget.handleMouse({ type: "click", button: "left", x: GUTTER + t.rect.x + Math.floor(t.rect.w / 2), y: t.rect.y });
			await new Promise((r) => setTimeout(r, 0));
		} else w.handleKey(step.key);
		widget.render(width);
	}
	const raw: string[] = widget.render(width);
	const images: any[] = [];
	const lines = raw.map((l, row) => {
		const m = /\x1b_G([^;]*);/.exec(l);
		if (m) {
			const ctl = Object.fromEntries(m[1].split(",").map((kv) => kv.split("=")));
			const payload = [...l.matchAll(/\x1b_G[^;]*;([^\x1b]*)\x1b\\/g)].map((x) => x[1]).join("");
			const prefix = l.slice(0, l.indexOf("\x1b_G"));
			images.push({ row, col: tui.visibleWidth(prefix), cols: Number(ctl.c), rows: Number(ctl.r), png: payload });
		}
		return strip(l);
	});
	return { file: shot.file, width, lines, images };
}

mkdirSync("docs/screenshots/.build", { recursive: true });
const only = process.argv[2];
const out = [];
for (const [i, s] of SHOTS.filter((s) => !only || s.file === only).entries()) out.push(await run(s, i));
writeFileSync("docs/screenshots/.build/shots.json", JSON.stringify(out));
console.log(`${out.length} screenshots described -> docs/screenshots/.build/shots.json`);
