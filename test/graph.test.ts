// Graph: a directed graph that may have loops. The layout (src/diagram/graph.ts, loops.ts and the loop pass in layeredDiagram.ts)
// places the nodes from the edges that go forward, draws an edge that goes back as an arc in a lane outside the body, and an
// edge from a node to itself as a loop on the node.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeDirected } from "../src/diagram/decode.ts";
import { graph, normalizeGraph, END_GLYPH, START_GLYPH } from "../src/diagram/graph.ts";
import { toLines } from "../src/diagram/render.ts";
import { checkStructure, rng } from "./helpers.ts";

const N = (id: string, label?: string, kind?: string, status?: string) => ({ id, label: label ?? id, kind, status });
const E = (from: string, to: string, label?: string, style?: string) => ({ from, to, label, style });
const pic = (res: ReturnType<typeof graph>) => toLines(res, { legend: false }).join("\n");
type Res = ReturnType<typeof graph>;
const rectOf = (res: Res, id: string) => res.nodes.find((n) => n.id === id)!.rect;
const edgeOf = (res: Res, from: string, to: string, at = 0) => res.edges.filter((e) => e.from === from && e.to === to)[at]!;
const inside = (c: [number, number], r: { x: number; y: number; w: number; h: number }) => c[0] >= r.x && c[0] < r.x + r.w && c[1] >= r.y && c[1] < r.y + r.h;

const review = () => ({
	nodes: [N("s", "task", "start"), N("impl", "Implementer", null as any, "running"), N("rev", "Reviewer"), N("e", "merged", "end")],
	edges: [E("s", "impl"), E("impl", "rev", "ready for review"), E("rev", "impl", "changes requested (up to 3x)"), E("rev", "e", "approved")],
});

test("empty and garbage input do not throw", () => {
	assert.equal(graph([], []).nodes.length, 0);
	assert.ok(graph([], []).warnings.length > 0);
	for (const bad of [undefined, null, 5, "x", {}, [null], [1, 2], [{}], [{ id: "a" }, null]]) assert.doesNotThrow(() => graph(bad, bad));
	assert.doesNotThrow(() => graph([N("a")], [null, 3, ["a", "a"], { from: "a" }, { from: "zz", to: "a" }]));
});

test("an implementer and a reviewer: the arrow back is an arc below the nodes, with its label, ending in an arrowhead", () => {
	const { nodes, edges } = review();
	const res = graph(nodes, edges, { direction: "LR", maxWidth: 200 });
	checkStructure(res);
	assert.deepEqual(res.warnings, []);
	assert.deepEqual(res.footnotes, [], "every label found its place");
	const back = edgeOf(res, "rev", "impl");
	assert.equal(back.kind, "back");
	const bottom = Math.max(...res.nodes.map((n) => n.rect.y + n.rect.h));
	assert.ok(Math.max(...back.cells.map((c) => c[1])) > bottom, "the lane is below every node");
	for (const e of res.edges.filter((x) => x !== back)) assert.ok(e.cells.every((c) => c[1] < bottom), `${e.from}>${e.to} stays in the body`);
	for (const n of res.nodes) assert.ok(!back.cells.some((c) => inside(c, n.rect)), "the arc does not touch a node");
	const last = back.cells[back.cells.length - 1];
	assert.equal(res.rows[last[1]][last[0]].ch, "▲", "it comes up into the implementer");
	assert.ok(last[1] === rectOf(res, "impl").y + rectOf(res, "impl").h && last[0] > rectOf(res, "impl").x && last[0] < rectOf(res, "impl").x + rectOf(res, "impl").w - 1);
	assert.ok(pic(res).includes("changes requested (up to 3x)") && pic(res).includes("ready for review"));
	assert.ok(pic(res).includes(START_GLYPH) && pic(res).includes(END_GLYPH), "a start dot and an end ring");
	assert.equal(edgeOf(res, "impl", "rev").kind, "forward");
});

test("top to bottom the lane is to the right of every node, and the arrow comes in from the right", () => {
	const { nodes, edges } = review();
	const res = graph(nodes, edges, { direction: "TB", maxWidth: 200 });
	checkStructure(res);
	const back = edgeOf(res, "rev", "impl");
	const right = Math.max(...res.nodes.map((n) => n.rect.x + n.rect.w));
	assert.ok(Math.max(...back.cells.map((c) => c[0])) > right);
	const last = back.cells[back.cells.length - 1];
	assert.equal(res.rows[last[1]][last[0]].ch, "◀");
	assert.ok(pic(res).includes("changes requested (up to 3x)"));
	assert.deepEqual(res.footnotes, []);
});

test("a self-loop sits above its node (to its left when top to bottom), with its label", () => {
	const nodes = [N("a", "Queued"), N("b", "Running"), N("c", "Done")];
	const edges = [E("a", "b", "start"), E("b", "b", "heartbeat"), E("b", "c", "exit 0")];
	const lr = graph(nodes, edges, { direction: "LR", maxWidth: 200 });
	checkStructure(lr);
	const loopLR = edgeOf(lr, "b", "b");
	assert.equal(loopLR.kind, "self");
	assert.ok(loopLR.cells.every((c) => c[1] < rectOf(lr, "b").y), "above");
	assert.ok(pic(lr).includes("heartbeat"));
	const tb = graph(nodes, edges, { direction: "TB", maxWidth: 200 });
	checkStructure(tb);
	assert.ok(edgeOf(tb, "b", "b").cells.every((c) => c[0] < rectOf(tb, "b").x), "to the left");
	assert.ok(pic(tb).includes("heartbeat"));
	assert.deepEqual([lr.footnotes, tb.footnotes], [[], []]);
});

test("a self-loop on the first node of a layer does not run off the picture", () => {
	for (const direction of ["LR", "TB"] as const) {
		const res = graph([N("a", "Only"), N("b", "Second")], [E("a", "a", "again and again"), E("a", "b"), E("b", "b", "wait")], { direction, maxWidth: 200 });
		checkStructure(res);
		assert.ok(pic(res).includes("again and again") && pic(res).includes("wait"), direction);
	}
});

test("several loops on one node nest, each with its own ports", () => {
	const res = graph([N("a", "Worker"), N("b", "Next")], [E("a", "a", "one"), E("a", "a", "two"), E("a", "b")], { direction: "LR", maxWidth: 200 });
	checkStructure(res);
	assert.equal(res.edges.filter((e) => e.kind === "self").length, 2);
	assert.deepEqual(res.omitted ?? [], []);
});

test("two edges between one pair leave apart; an arrow each way: the forward one runs straight and the return one runs below", () => {
	const res = graph([N("client", "Client"), N("api", "API"), N("db", "Database")], [E("client", "api", "read"), E("client", "api", "write"), E("api", "db", "query"), E("db", "api", "rows")], { direction: "LR", maxWidth: 200 });
	checkStructure(res);
	const [read, write] = [edgeOf(res, "client", "api", 0), edgeOf(res, "client", "api", 1)];
	assert.equal(read.kind, "forward");
	assert.equal(write.kind, "forward");
	const shared = read.cells.filter((c) => write.cells.some((d) => d[0] === c[0] && d[1] === c[1]));
	assert.deepEqual(shared, [], "no cell is both edges'");
	assert.equal(edgeOf(res, "api", "db").kind, "forward");
	assert.equal(edgeOf(res, "db", "api").kind, "back");
	for (const l of ["read", "write", "query", "rows"]) assert.ok(pic(res).includes(l), l);
});

test("nested arcs: the longer one is the outer lane, and disjoint arcs share a lane", () => {
	const chain = ["a", "b", "c", "d", "e", "f"].map((i) => N(i));
	const fwd = [E("a", "b"), E("b", "c"), E("c", "d"), E("d", "e"), E("e", "f")];
	const nested = graph(chain, [...fwd, E("d", "a", "outer"), E("c", "b", "inner")], { direction: "LR", maxWidth: 300 });
	checkStructure(nested);
	const lane = (res: Res, from: string, to: string) => Math.max(...edgeOf(res, from, to).cells.map((c) => c[1]));
	assert.ok(lane(nested, "d", "a") > lane(nested, "c", "b"), "the outer arc is lower");
	const apart = graph(chain, [...fwd, E("b", "a", "left"), E("f", "e", "right")], { direction: "LR", maxWidth: 300 });
	checkStructure(apart);
	assert.equal(lane(apart, "b", "a"), lane(apart, "f", "e"), "the same lane");
	assert.ok(apart.height < nested.height, "so it is shorter");
});

test("a back edge whose way out is blocked by another node of its layer is still drawn, through the gaps", () => {
	// Closed has two nodes in the next layer, and the upper one returns to it from underneath the lower one
	const res = graph([N("c", "Closed"), N("l", "Listening"), N("k", "Connecting")], [E("c", "l", "passive"), E("c", "k", "active"), E("l", "c", "close"), E("k", "c", "timeout")], { direction: "LR", maxWidth: 300 });
	checkStructure(res);
	assert.deepEqual(res.omitted ?? [], []);
	assert.equal(res.edges.filter((e) => e.kind === "back").length, 2);
});

test("the oracle: a picture without labels decodes back into exactly its edges, loops and arcs included", () => {
	for (let seed = 1; seed <= 150; seed++) {
		const r = rng(seed);
		const k = 2 + Math.floor(r() * 8);
		const nodes = Array.from({ length: k }, (_, i) => N(`n${i}`, `N${i}`));
		const edges = Array.from({ length: Math.floor(r() * k * 2) }, () => E(`n${Math.floor(r() * k)}`, `n${Math.floor(r() * k)}`));
		for (const direction of ["LR", "TB"] as const) {
			const res = graph(nodes, edges, { direction, maxWidth: 300 });
			const norm = normalizeGraph(nodes, edges);
			const omit = new Set((res.omitted ?? []).map((o) => `${o.from}>${o.to}`));
			const want = [...new Set(norm.edges.map((e) => `${norm.nodes[e.a].id}>${norm.nodes[e.b].id}`))].filter((x) => !omit.has(x)).sort();
			const { edges: got, problems } = decodeDirected(res);
			assert.deepEqual(problems, [], `seed ${seed} ${direction}\n${toLines(res).join("\n")}`);
			assert.deepEqual([...got].sort(), want, `seed ${seed} ${direction}\n${toLines(res).join("\n")}`);
		}
	}
});

test("random graphs with labels, dots and statuses: sound in both directions, and the same every time", () => {
	const labels = ["", "go", "retry (up to 3x)", "changes requested (up to 3x)", "timeout after thirty seconds"];
	let drawn = 0;
	let footnotes = 0;
	for (let seed = 1; seed <= 25; seed++) {
		const r = rng(seed * 31);
		const k = 1 + Math.floor(r() * 12);
		const nodes = Array.from({ length: k }, (_, i) => N(`n${i}`, `Node ${i}${r() < 0.3 ? " with a longer name" : ""}`, i === 0 && r() < 0.5 ? "start" : r() < 0.1 ? "end" : "state", r() < 0.3 ? "running" : undefined));
		const edges = Array.from({ length: Math.floor(r() * Math.min(32, k * 3)) }, () => E(`n${Math.floor(r() * k)}`, `n${Math.floor(r() * k)}`, labels[Math.floor(r() * labels.length)], r() < 0.2 ? "dashed" : "solid"));
		for (const direction of ["LR", "TB"] as const) {
			const res = graph(nodes, edges, { direction, maxWidth: 100 });
			const where = `seed ${seed} ${direction}`;
			checkStructure(res);
			// every drawn edge starts at its node, ends at its node with an arrowhead, is one connected line, and meets no other except at a right angle
			const use = new Map<string, string[]>();
			for (const e of res.edges) {
				const from = rectOf(res, e.from);
				const to = rectOf(res, e.to);
				const touches = (c: [number, number], rc: typeof from) => (c[0] >= rc.x && c[0] < rc.x + rc.w && (c[1] === rc.y - 1 || c[1] === rc.y + rc.h)) || (c[1] >= rc.y && c[1] < rc.y + rc.h && (c[0] === rc.x - 1 || c[0] === rc.x + rc.w));
				assert.ok(touches(e.cells[0], from), `${where}: ${e.from}>${e.to} starts at ${e.from}`);
				assert.ok(touches(e.cells[e.cells.length - 1], to), `${where}: ${e.from}>${e.to} ends at ${e.to}`);
				const tip = e.cells[e.cells.length - 1];
				assert.ok("▲▶▼◀".includes(res.rows[tip[1]][tip[0]].ch), `${where}: an arrowhead on ${e.from}>${e.to}`);
				e.cells.forEach((c, i, a) => {
					if (i) assert.equal(Math.abs(c[0] - a[i - 1][0]) + Math.abs(c[1] - a[i - 1][1]), 1, `${where}: ${e.from}>${e.to} is one line`);
					const kind = i === 0 || i === a.length - 1 ? "end" : a[i - 1][0] === a[i + 1][0] ? "V" : a[i - 1][1] === a[i + 1][1] ? "H" : "corner";
					(use.get(`${c[0]},${c[1]}`) ?? use.set(`${c[0]},${c[1]}`, []).get(`${c[0]},${c[1]}`)!).push(kind);
				});
			}
			for (const [at, kinds] of use) assert.ok(kinds.length === 1 || (kinds.length === 2 && kinds.includes("H") && kinds.includes("V")), `${where}: cell ${at} is shared by ${kinds.join("/")}`);
			assert.deepEqual(toLines(graph(nodes, edges, { direction, maxWidth: 100 })), toLines(res), `${where}: deterministic`);
			drawn += res.edges.length;
			footnotes += res.footnotes.length;
		}
	}
	assert.ok(drawn > 100, "the test drew something");
	assert.ok(footnotes < drawn / 3, `labels mostly find a place (${footnotes} footnotes for ${drawn} edges)`);
});

test("dots take no status, a start has no incoming edge and an end no outgoing one (the language says so; the layout drops them)", () => {
	const res = graph([N("s", "go", "start", "failed"), N("a"), N("e", "stop", "end")], [E("a", "s"), E("e", "a"), E("s", "a"), E("a", "e")], { direction: "LR", maxWidth: 200 });
	checkStructure(res);
	assert.equal(res.edges.length, 2);
	assert.equal(res.warnings.filter((w) => w.includes("start node or leaves an end node")).length, 2);
	assert.deepEqual(res.statuses, [], "a dot has no status");
});

test("statuses get a legend, and a graph can run top to bottom with every kind of node", () => {
	const res = graph([N("a", "A", null as any, "done"), N("b", "B", null as any, "running"), N("c", "C", null as any, "failed"), N("d", "D", null as any, "pending"), N("e", "E", null as any, "skipped")], [E("a", "b"), E("b", "c", "x"), E("c", "b", "retry"), E("c", "d"), E("d", "e", "maybe", "dashed")], { direction: "TB", maxWidth: 200 });
	checkStructure(res);
	assert.deepEqual(res.statuses, ["done", "running", "failed", "pending", "skipped"]);
	assert.equal(res.legend.length, 5);
});

test("automatic direction: left to right when it fits, top to bottom when that is narrower than the pane", () => {
	const { nodes, edges } = review();
	assert.equal(graph(nodes, edges, { maxWidth: 200 }).direction, "LR");
	const narrow = graph(nodes, edges, { maxWidth: 60 });
	assert.equal(narrow.direction, "TB");
	assert.ok(!narrow.overflow && narrow.width <= 60);
});

test("when nothing fits the pane it scrolls: labels whole, loops and lanes included", () => {
	const nodes = [N("a", "Waiting for security review"), N("b", "Approved by release manager"), N("c", "Rolled back, canary failed")];
	const edges = [E("a", "b", "all reviewers approved"), E("b", "c", "canary errors above 1 percent"), E("c", "a", "fixes pushed, review again")];
	const res = graph(nodes, edges, { direction: "LR", maxWidth: 40 });
	checkStructure(res);
	assert.ok(res.overflow && res.width > 40);
	for (const t of [...nodes.map((n) => n.label), ...edges.map((e) => e.label)]) assert.ok(pic(res).includes(t), `${t} is whole`);
});

test("a graph at its limits (16 nodes, 32 edges, long labels) is drawn within the work budget", () => {
	for (const direction of ["LR", "TB"] as const) {
		const r = rng(5);
		const nodes = Array.from({ length: 16 }, (_, i) => N(`n${i}`, `State number ${i} with a name`, i === 0 ? "start" : "state"));
		const edges = Array.from({ length: 32 }, (_, i) => E(`n${Math.floor(r() * 16)}`, `n${1 + Math.floor(r() * 15)}`, `transition number ${i} with a long label`.slice(0, 32)));
		const t0 = performance.now();
		const res = graph(nodes, edges, { direction, maxWidth: 80 });
		assert.ok(performance.now() - t0 < 3000, `${direction}: ${Math.round(performance.now() - t0)} ms`);
		checkStructure(res);
	}
});

test("an end ring is one cell and every arrow into it touches it, from whichever side it comes, an upward arrow included", () => {
	const nodes = [N("s", "page", "start"), N("fa", "false alarm"), N("tri", "triage"), N("fix", "mitigate"), N("pm", "postmortem"), N("e", "closed", "end")];
	const edges = [E("s", "tri"), E("tri", "fa", "no signal"), E("tri", "fix", "sev 1-2"), E("fix", "pm", "resolved"), E("fa", "e", "dismiss"), E("pm", "e", "sign off"), E("pm", "tri", "recurs")];
	for (const direction of ["LR", "TB"] as const) {
		const res = graph(nodes, edges, { direction, maxWidth: 300 });
		checkStructure(res);
		assert.deepEqual(res.omitted ?? [], [], direction);
		assert.deepEqual(res.footnotes, [], direction);
		const ring = rectOf(res, "e");
		assert.deepEqual([ring.w, ring.h], [1, 1], "the ring is one cell");
		assert.equal(res.rows[ring.y][ring.x].ch, END_GLYPH);
		const arrows = res.edges.filter((e) => e.to === "e").map((e) => {
			const tip = e.cells[e.cells.length - 1];
			const d = [tip[0] - ring.x, tip[1] - ring.y];
			assert.equal(Math.abs(d[0]) + Math.abs(d[1]), 1, `${direction}: the arrow of ${e.from} touches the ring`);
			return res.rows[tip[1]][tip[0]].ch;
		});
		assert.equal(arrows.length, 2);
		assert.ok(pic(res).includes("closed"), "with its caption");
		// the caption is on a side no wire uses
		const area = res.nodes.find((n) => n.id === "e")!.area!;
		assert.ok(area.w > 1 || area.h > 1, "the node's area holds the caption");
		for (const e of res.edges) assert.ok(!e.cells.some((c) => inside(c, area) && !(c[0] === ring.x && c[1] === ring.y)) || e.to === "e", `${direction}: no wire through the caption`);
	}
	// from below: the arrow points up into the ring
	const below = graph([N("a", "Left"), N("b", "Below"), N("e", "done", "end")], [E("a", "e"), E("a", "b"), E("b", "e")], { direction: "LR", maxWidth: 300 });
	checkStructure(below);
	const tips = below.edges.filter((e) => e.to === "e").map((e) => below.rows[e.cells[e.cells.length - 1][1]][e.cells[e.cells.length - 1][0]].ch);
	assert.ok(tips.every((t) => "▶▲▼".includes(t)), tips.join(""));
});

test("a start dot sends its wires out of the dot itself, with the caption on the side they do not use", () => {
	const res = graph([N("s", "begin", "start"), N("a", "One"), N("b", "Two")], [E("s", "a"), E("s", "b")], { direction: "LR", maxWidth: 300 });
	checkStructure(res);
	const dot = rectOf(res, "s");
	assert.deepEqual([dot.w, dot.h], [1, 1]);
	for (const e of res.edges.filter((x) => x.from === "s")) assert.ok(Math.abs(e.cells[0][0] - dot.x) + Math.abs(e.cells[0][1] - dot.y) === 1, "starts next to the dot");
	assert.ok(pic(res).includes("begin ●"), "the caption is before the dot");
});

test("a start or end node with more wires than a dot has sides is drawn as a box, and nothing is left out", () => {
	for (const direction of ["LR", "TB"] as const) {
		const nodes = [N("s", "go", "start"), N("a"), N("b"), N("c"), N("d"), N("e", "closed", "end")];
		const edges = [E("s", "a"), E("a", "b"), E("a", "c"), E("a", "d"), E("b", "e", "x"), E("c", "e", "y"), E("d", "e", "z"), E("a", "e", "w")];
		const res = graph(nodes, edges, { direction, maxWidth: 300 });
		checkStructure(res);
		assert.deepEqual(res.omitted ?? [], [], direction);
		assert.ok(rectOf(res, "e").w > 1, `${direction}: a box`);
		assert.equal(res.edges.filter((e) => e.to === "e").length, 4);
	}
});
