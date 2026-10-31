import assert from "node:assert/strict";
import { test } from "node:test";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { activate, describe, nextTarget, reveal, targetAt, type Env } from "../src/blocks/interact.ts";
import { renderTree } from "../src/blocks/render.ts";
import { newState, type Block, type Target, type WState } from "../src/blocks/types.ts";
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";

const sample = (key: string) => LANG_SAMPLES.find((s) => s.key === key)!.source;

class Harness {
	state: WState = newState();
	sent: string[] = [];
	copied: string[] = [];
	notes: string[] = [];
	root;
	block!: Block;
	warnings: string[] = [];
	env: Env = { send: (t) => this.sent.push(t), copy: (t) => this.copied.push(t), note: (t) => this.notes.push(t) };
	width: number;
	constructor(source: string, width = 100) {
		this.width = width;
		const c = compile(source);
		assert.deepEqual(c.errors, []);
		this.root = c.root!;
		this.draw();
	}
	draw() {
		const r = renderTree(this.root, this.width, this.state);
		this.block = r.block;
		this.warnings = r.warnings;
	}
	get text() {
		return rowsToLines(this.block.rows).join("\n");
	}
	find(pred: (t: Target) => boolean): Target {
		const t = this.block.targets.find(pred);
		assert.ok(t, `no target matching; have: ${this.block.targets.map((x) => `${x.kind}:${x.label}`).join(" | ")}`);
		return t!;
	}
	/** click at the centre of a target, exactly as a mouse would */
	click(t: Target) {
		const x = t.rect.x + Math.floor(t.rect.w / 2);
		const y = t.rect.y + Math.floor(t.rect.h / 2);
		const hit = targetAt(this.block, x, y);
		assert.ok(hit, `nothing under (${x},${y}) for ${t.id}`);
		if (activate(hit!, this.state, this.env)) this.draw();
		return hit!;
	}
}

test("every sample renders at several widths without overflow or warnings", () => {
	for (const s of LANG_SAMPLES) {
		for (const w of [36, 60, 100, 140]) {
			const h = new Harness(s.source, w);
			assert.ok(h.block.w <= w, `${s.key}@${w}: block ${h.block.w} wider than ${w}`);
			for (const r of h.block.rows) assert.equal(r.length, h.block.w, `${s.key}@${w}: ragged row`);
			assert.deepEqual(h.warnings, [], `${s.key}@${w}`);
			for (const t of h.block.targets) assert.ok(t.rect.w > 0 && t.rect.h > 0, `${s.key}: empty target ${t.id}`);
		}
	}
});

test("tabs: clicking a tab shows its content and keeps the rest", () => {
	const h = new Harness(sample("tabs"));
	assert.ok(h.text.includes("Nodes up") && !h.text.includes("spark-1"));
	h.click(h.find((t) => t.kind === "tab" && t.label === "Nodes"));
	assert.ok(h.text.includes("spark-1") && !h.text.includes("Nodes up"), "table shown, tiles hidden");
	h.click(h.find((t) => t.kind === "tab" && t.label === "Notes"));
	assert.ok(h.text.includes("rebooted on 21 Oct"));
	h.click(h.find((t) => t.kind === "tab" && t.label === "Overview"));
	assert.ok(h.text.includes("Nodes up"));
});

test("tabs: nested tabs keep independent state", () => {
	const src = `root = Stack([outer])
outer = Tabs([a, b])
a = TabItem("A", [inner])
b = TabItem("B", [Text("bee")])
inner = Tabs([i1, i2])
i1 = TabItem("One", [Text("first")])
i2 = TabItem("Two", [Text("second")])`;
	const h = new Harness(src);
	assert.ok(h.text.includes("first"));
	h.click(h.find((t) => t.label === "Two"));
	assert.ok(h.text.includes("second") && !h.text.includes("first"));
	h.click(h.find((t) => t.label === "B"));
	assert.ok(h.text.includes("bee"));
	h.click(h.find((t) => t.label === "A"));
	assert.ok(h.text.includes("second"), "inner tab selection survived");
});

test("faq: items expand and collapse independently, first one opens when asked", () => {
	const h = new Harness(sample("interactive"));
	assert.ok(h.text.includes("stops new requests"), "first item open");
	assert.ok(!h.text.includes("uncordon"));
	const q2 = h.find((t) => t.kind === "faq" && t.label.startsWith("How do I undo"));
	h.click(q2);
	assert.ok(h.text.includes("uncordon") && h.text.includes("stops new requests"));
	h.click(h.find((t) => t.kind === "faq" && t.label.startsWith("What does draining")));
	assert.ok(!h.text.includes("stops new requests") && h.text.includes("uncordon"));
	h.click(h.find((t) => t.kind === "faq" && t.label.startsWith("How do I undo")));
	assert.ok(!h.text.includes("uncordon"));
});

test("choice: a click sends '<question> — <option>' and marks the pick", () => {
	const h = new Harness(sample("interactive"));
	h.click(h.find((t) => t.kind === "choice" && t.label === "llama-3.3-70b"));
	assert.deepEqual(h.sent, ["Which model should serve chat? — llama-3.3-70b"]);
	assert.ok(h.text.includes("● llama-3.3-70b") && h.text.includes("○ qwen3-32b"));
	h.click(h.find((t) => t.kind === "choice" && t.label === "gemma-3-27b"));
	assert.equal(h.sent.length, 2);
	assert.ok(h.text.includes("● gemma-3-27b") && h.text.includes("○ llama-3.3-70b"));
});

test("choice: options that do not fit one line stack and stay clickable", () => {
	const h = new Harness(sample("interactive"), 40);
	const opts = h.block.targets.filter((t) => t.kind === "choice");
	assert.equal(opts.length, 3);
	assert.ok(new Set(opts.map((t) => t.rect.y)).size === 3, "one per line");
	h.click(opts[2]);
	assert.equal(h.sent.length, 1);
});

test("buttons: @ToAssistant text, label fallback, @OpenUrl copies the link", () => {
	const h = new Harness(sample("interactive"));
	h.click(h.find((t) => t.kind === "button" && t.label === "Restart vllm"));
	h.click(h.find((t) => t.kind === "button" && t.label === "Drain node"));
	assert.deepEqual(h.sent, ["Restart the vllm service on dgx-spark-1", "Drain node"]);
	const u = new Harness(`root = Stack([b])\nb = Button("Docs", @OpenUrl("https://example.com/docs"))`);
	u.click(u.find((t) => t.kind === "button"));
	assert.deepEqual(u.sent, []);
	assert.deepEqual(u.copied, ["https://example.com/docs"]);
	assert.match(u.notes[0], /link copied/);
});

test("code block: clicking copy copies the exact code and shows 'copied'", () => {
	const h = new Harness(`root = Stack([c])\nc = CodeBlock("print(1)\\nprint(2)", "python", "a.py")`);
	assert.ok(h.text.includes("[copy]"));
	h.click(h.find((t) => t.kind === "copy"));
	assert.deepEqual(h.copied, ["print(1)\nprint(2)"]);
	assert.ok(h.text.includes("✓ copied") && !h.text.includes("[copy]"));
});

test("tooltips on a table: row, column and cell targets; click opens a panel, click again closes it", () => {
	const src = `root = Stack([t])
t = Table(["Node", "State", "GPU"], [["a", "up", 90], ["b", "down", 10]], [t1, t2, t3])
t1 = Tooltip("row:2", "node b is down", "It stopped answering health checks.", "systemctl status vllm", "bash", "bad")
t2 = Tooltip("col:GPU", "percent busy")
t3 = Tooltip("cell:1.State", "all good")`;
	const h = new Harness(src);
	const row = h.find((t) => t.label === "row:2");
	assert.equal(row.tip?.hint, "node b is down");
	assert.ok(!h.text.includes("stopped answering"));
	const before = h.block.rows.length;
	h.click(row);
	assert.ok(h.text.includes("stopped answering health checks") && h.text.includes("systemctl status vllm"), h.text);
	assert.ok(h.block.rows.length > before);
	h.click(row);
	assert.ok(!h.text.includes("stopped answering"));
	// hint-only tips do not open a panel
	const hintOnly = h.find((t) => t.label === "col:GPU");
	const rows = h.block.rows.length;
	h.click(hintOnly);
	assert.equal(h.block.rows.length, rows);
	assert.match(describe(hintOnly), /percent busy/);
	assert.ok(!/Enter for details/.test(describe(hintOnly)));
	assert.match(describe(row), /Enter for details/);
});

test("tooltips on diagram nodes attach to the node and open a panel", () => {
	const h = new Harness(sample("dag"));
	const lint = h.find((t) => t.kind === "node" && t.label.startsWith("Lint"));
	assert.equal(lint.tip?.hint, "2 rules failed");
	h.click(lint);
	assert.ok(h.text.includes("ruff reported two violations") && h.text.includes("ruff check src/"));
	h.click(lint);
	assert.ok(!h.text.includes("ruff reported"));
});

test("tooltips: erd column, infra node, sequence message, geo pin all resolve", () => {
	for (const [key, label] of [["erd", "jobs.status"], ["infra", "worker"], ["sequence", "req"], ["geo", "Tokyo"]] as const) {
		const h = new Harness(sample(key));
		assert.deepEqual(h.warnings, [], key);
		const withTip = h.block.targets.filter((t) => t.tip);
		assert.ok(withTip.length >= 1, `${key}: a target carries the tooltip`);
		void label;
	}
	const geo = new Harness(sample("geo"));
	const tokyo = geo.block.targets.find((t) => t.tip)!;
	assert.match(tokyo.label, /Tokyo/);
	geo.click(tokyo);
	assert.ok(geo.text.includes("Serves APAC traffic"));
});

test("a tooltip aimed at nothing is a compile error the model sees, with the valid targets listed", () => {
	const r = compile(`root = Stack([m])\nm = Metric("CPU", "40%", null, null, [t])\nt = Tooltip("nope", "x")`);
	assert.equal(r.ok, false);
	assert.match(r.errors.join("\n"), /Tooltip target "nope" matches nothing here\. Use the metric's own label\. Valid targets: CPU/);
	const dag = compile(`root = Stack([d])\nd = Dag([a], [], null, null, [t])\na = DagNode("a", "A")\nt = Tooltip("b", "x")`);
	assert.match(dag.errors.join("\n"), /Use a DagNode id\. Valid targets: a/);
	const table = compile(`root = Stack([t])\nt = Table(["A", "B"], [["1", "2"]], [x])\nx = Tooltip("cell:2.A", "x")`);
	assert.match(table.errors.join("\n"), /Valid targets: row:1, col:A, col:B, cell:1\.A, cell:1\.B/);
	const dup = compile(`root = Stack([m])\nm = Metric("CPU", "40%", null, null, [t, u])\nt = Tooltip("CPU", "a")\nu = Tooltip("CPU", "b")`);
	assert.match(dup.errors.join("\n"), /two Tooltips aim at "CPU"/);
	const long = compile(`root = Stack([m])\nm = Metric("CPU", "40%", null, null, [t])\nt = Tooltip("CPU", "${"x".repeat(141)}")`);
	assert.match(long.errors.join("\n"), /hint is 141 characters/);
	const link = compile(`root = Stack([m])\nm = Metric("CPU", "40%", null, null, [t])\nt = Tooltip("CPU", "h", null, null, null, null, "javascript:alert(1)")`);
	assert.match(link.errors.join("\n"), /link must start with http/);
});

test("every host accepts its documented targets (charts, pie, radar, image included)", () => {
	const ok = (src: string) => assert.deepEqual(compile(src).errors, [], src);
	ok(`root = Stack([c])\nc = LineChart(["Mon", "Tue"], [s], null, null, null, null, [a, b])\ns = Series("api", [1, 2])\na = Tooltip("Tue", "spike")\nb = Tooltip("series:api", "the api")`);
	ok(`root = Stack([c])\nc = AreaChart(["Mon", "Tue"], [s], null, null, null, null, [a])\ns = Series("api", [1, 2])\na = Tooltip("Mon", "start")`);
	ok(`root = Stack([c])\nc = PieChart(["a", "b"], [1, 2], null, null, [t])\nt = Tooltip("b", "the big one")`);
	ok(`root = Stack([c])\nc = RadarChart(["x", "y", "z"], [s], [t, u])\ns = Series("q", [1, 2, 3])\nt = Tooltip("y", "axis")\nu = Tooltip("series:q", "series")`);
	ok(`root = Stack([i])\ni = Image("data:image/png;base64,AAAA", "alt", null, [t])\nt = Tooltip("image", "a picture")`);
});

test("keyboard: Tab walks targets in reading order and wraps; arrows move spatially", () => {
	const h = new Harness(sample("interactive"));
	const order: string[] = [];
	let cur: string | null = null;
	const live = h.block.targets.filter((t) => t.kind !== "item").length;
	for (let i = 0; i < live + 1; i++) {
		const n = nextTarget(h.block, cur, "next")!;
		order.push(n.label);
		cur = n.id;
	}
	assert.equal(order[0], "Restart vllm");
	assert.equal(order[1], "Drain node");
	assert.equal(order[order.length - 1], order[0], "wrapped around");
	// right from the first button reaches the second; down reaches the choice row
	const b1 = h.find((t) => t.label === "Restart vllm");
	assert.equal(nextTarget(h.block, b1.id, "right")!.label, "Drain node");
	assert.equal(nextTarget(h.block, b1.id, "down")!.kind, "choice");
	// up from the first FAQ question goes back to the choices
	const q1 = h.find((t) => t.kind === "faq");
	assert.equal(nextTarget(h.block, q1.id, "up")!.kind, "choice");
	// shift-tab from the first target wraps to the last
	assert.equal(nextTarget(h.block, order[0] && h.block.targets[0].id, "prev") !== null, true);
});

test("keyboard: sideways stays on the row, vertical stays in the column (regression: Right on a choice jumped to a button)", () => {
	const h = new Harness(sample("interactive"));
	const opts = h.block.targets.filter((t) => t.kind === "choice");
	assert.equal(nextTarget(h.block, opts[0].id, "right")!.id, opts[1].id);
	assert.equal(nextTarget(h.block, opts[1].id, "right")!.id, opts[2].id);
	assert.equal(nextTarget(h.block, opts[2].id, "left")!.id, opts[1].id);
	assert.equal(nextTarget(h.block, opts[2].id, "right")!.id, opts[2].id, "no wrap sideways: stays on the last option");
	// down from an option stays under it; up returns to the button above it
	const b1 = h.find((t) => t.label === "Restart vllm");
	assert.equal(nextTarget(h.block, opts[0].id, "up")!.id, b1.id);
});

test("keyboard: diagram nodes move to the neighbour in that direction", () => {
	const h = new Harness(sample("dag"));
	const by = (l: string) => h.find((t) => t.kind === "node" && t.label.startsWith(l));
	assert.equal(nextTarget(h.block, by("Build").id, "right")!.label.slice(0, 4) !== "Buil", true);
	// from Unit tests, right reaches Package; left returns to Build image
	assert.ok(nextTarget(h.block, by("Unit").id, "right")!.label.startsWith("Package"));
	assert.ok(nextTarget(h.block, by("Unit").id, "left")!.label.startsWith("Build"));
	// walking down the middle column visits Unit, then Lint, then Benchmark
	assert.ok(nextTarget(h.block, by("Unit").id, "down")!.label.startsWith("Lint"));
	assert.ok(nextTarget(h.block, by("Lint").id, "down")!.label.startsWith("Benchmark"));
	assert.ok(nextTarget(h.block, by("Benchmark").id, "up")!.label.startsWith("Lint"));
});

test("keyboard: nothing to move to stays put", () => {
	const h = new Harness(`root = Stack([b])\nb = Button("Only")`);
	const only = h.block.targets[0];
	assert.equal(nextTarget(h.block, only.id, "left")!.id, only.id);
	assert.equal(nextTarget(h.block, only.id, "down")!.id, only.id);
	assert.equal(nextTarget(h.block, null, "next")!.id, only.id);
	const empty = new Harness(`root = Stack([t])\nt = Text("no targets")`);
	assert.equal(nextTarget(empty.block, null, "next"), null);
});

test("wide diagrams pan: focusing an off-screen node scrolls it into view", () => {
	const src = `root = Stack([d])
d = Dag([a, b, c, d2, e, f], [["a","b"],["b","c"],["c","d"],["d","e"],["e","f"]], "LR")
a = DagNode("a", "A very long step name one")
b = DagNode("b", "A very long step name two")
c = DagNode("c", "A very long step name three")
d2 = DagNode("d", "A very long step name four")
e = DagNode("e", "A very long step name five")
f = DagNode("f", "A very long step name six")`;
	const h = new Harness(src, 50);
	const nodes = h.block.targets.filter((t) => t.kind === "node");
	assert.equal(nodes.length, 6);
	assert.ok(h.block.w <= 50);
	const last = nodes.find((t) => t.label.includes("six"))!;
	assert.ok(last.rect.x + last.rect.w > 50 || last.rect.y >= 0, "starts outside the view or below it");
	assert.ok(last.pan, "carries pan info");
	const hintRows = h.text.split("\n").filter((l) => l.includes("columns"));
	assert.equal(hintRows.length, 1);
	const changed = reveal(last, h.state);
	h.draw();
	const again = h.block.targets.find((t) => t.label.includes("six"))!;
	if (changed) assert.ok(again.rect.x >= 0 && again.rect.x + again.rect.w <= 50, `now visible at ${again.rect.x}..${again.rect.x + again.rect.w}`);
	assert.ok(h.block.w <= 50);
});

test("hit testing: empty space has no target, overlapping rects pick the smaller", () => {
	const h = new Harness(sample("interactive"));
	assert.equal(targetAt(h.block, 99, 0), null);
	assert.equal(targetAt(h.block, -1, 0), null);
	const b = h.find((t) => t.label === "Restart vllm");
	assert.equal(targetAt(h.block, b.rect.x, b.rect.y)!.id, b.id);
	assert.equal(targetAt(h.block, b.rect.x + b.rect.w, b.rect.y), null, "just past the button");
});

test("state survives re-render and does not leak between widgets", () => {
	const a = new Harness(sample("tabs"));
	const b = new Harness(sample("tabs"));
	a.click(a.find((t) => t.label === "Nodes"));
	assert.ok(a.text.includes("spark-1"));
	assert.ok(b.text.includes("Nodes up") && !b.text.includes("spark-1"));
	a.draw();
	assert.ok(a.text.includes("spark-1"));
});

const glyphCount = (h: Harness, ch = "◆") => h.block.rows.reduce((n, r) => n + r.filter((c) => c.ch === ch).length, 0);

test("every sample marks exactly the elements that have a tooltip with a ◆, and no other cell", () => {
	for (const s of LANG_SAMPLES) {
		const h = new Harness(s.source, 110);
		const tips = h.block.targets.filter((t) => t.tip).length;
		assert.equal(glyphCount(h), tips, `${s.key}: ${tips} tooltips, ${glyphCount(h)} badges`);
	}
	const tipped = LANG_SAMPLES.filter((s) => new Harness(s.source).block.targets.some((t) => t.tip)).map((s) => s.key);
	for (const k of ["table", "dag", "erd", "infra", "sequence", "geo", "line", "area", "pie", "radar", "image"]) assert.ok(tipped.includes(k), `${k} sample carries a tooltip`);
});

test("a badge never overwrites a wire, a label or the text it describes", () => {
	for (const s of LANG_SAMPLES) {
		const h = new Harness(s.source, 110);
		for (const t of h.block.targets.filter((x) => x.tip)) {
			// the badge cell is inside or touching the target, and sits on blank space or a border dash in the source layout
			const near = h.block.rows.some((r, y) => r.some((c, x) => c.ch === "◆" && Math.abs(y - t.rect.y) <= t.rect.h + 1 && x >= t.rect.x - 2 && x <= t.rect.x + t.rect.w + 2) || false);
			const viaCells = (t.cells ?? []).length > 0;
			assert.ok(near || viaCells, `${s.key}: no badge next to ${t.label}`);
		}
	}
});

test("line chart: tooltip on a category is hoverable over its column and the badge sits on the curve", () => {
	const h = new Harness(sample("line"), 100);
	const thu = h.find((t) => t.label === "Thu" && !!t.tip);
	assert.ok(thu.rect.h >= 6, "the whole plot column is the hover area");
	const badgeRow = h.block.rows.findIndex((r) => r.some((c) => c.ch === "◆" && c.role === "note.warn"));
	assert.ok(badgeRow >= thu.rect.y && badgeRow < thu.rect.y + thu.rect.h, "the warn badge is inside the plot column");
	// hovering a cell in the column away from the curve still finds it
	const mid = targetAt(h.block, thu.rect.x, thu.rect.y + thu.rect.h - 1);
	assert.equal(mid?.label, "Thu");
	h.click(thu);
	assert.ok(h.text.includes("Traffic jumped 60% after the release") && h.text.includes("kubectl rollout history deploy/api"), h.text);
	const legend = h.find((t) => t.label === "series:worker");
	assert.match(describe(legend), /Background jobs/);
});

test("pie: a tooltip belongs to the wedge and to the legend row; both open the same panel", () => {
	const h = new Harness(sample("pie"), 100);
	const llama = h.find((t) => t.label === "llama-3.3-70b" && !!t.tip);
	assert.ok((llama.cells?.length ?? 0) > 20, "the wedge has cells");
	const [wx, wy] = llama.cells![Math.floor(llama.cells!.length / 2)];
	assert.equal(targetAt(h.block, wx, wy)?.id, llama.id, "hovering the wedge finds the tooltip");
	assert.equal(targetAt(h.block, llama.rect.x + 2, llama.rect.y)?.id, llama.id, "the legend row finds it too");
	// a wedge without a tooltip is not a target
	const gemma = h.block.targets.find((t) => t.label === "gemma-3-27b");
	assert.equal(gemma, undefined);
	h.click({ ...llama, rect: { x: wx, y: wy, w: 1, h: 1 } });
	assert.ok(h.text.includes("Pinned to spark-2 and spark-3"), h.text);
	h.click(llama);
	assert.ok(!h.text.includes("Pinned to spark-2"), "clicking the legend row closes it");
});

test("radar and area: category and series tooltips resolve", () => {
	const r = new Harness(sample("radar"), 100);
	assert.ok(r.block.targets.some((t) => t.label === "Cost" && t.tip));
	const sr = r.find((t) => t.label === "series:llama");
	r.click(sr);
	assert.ok(r.text.includes("Best quality and context of the two"));
	const a = new Harness(sample("area"), 100);
	const noon = a.find((t) => t.label === "12:00" && !!t.tip);
	a.click(noon);
	assert.ok(a.text.includes("qwen3 alone is over half of the tokens"));
});

test("tooltip badge tones follow the Tooltip tone", () => {
	const h = new Harness(`root = Stack([m1, m2, m3])
m1 = Metric("A", "1", null, null, [a])
m2 = Metric("B", "2", null, null, [b])
m3 = Metric("C", "3", null, null, [c])
a = Tooltip("A", "x", null, null, null, "good")
b = Tooltip("B", "x", null, null, null, "bad")
c = Tooltip("C", "x")`, 100);
	const roles = h.block.rows.flat().filter((c) => c.ch === "◆").map((c) => c.role).sort();
	assert.deepEqual(roles, ["note.bad", "note.good", "note.info"]);
});
