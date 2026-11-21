// Graph in the language and in the widget: what the model may write and is told when it is wrong, tooltips and notes on a node and an
// edge, and the small-screen behaviour (the diagram scrolls sideways under the pan bar and every offset draws).
import assert from "node:assert/strict";
import { test } from "node:test";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { itemWords } from "../src/blocks/notes.ts";
import { renderTree } from "../src/blocks/render.ts";
import { newState } from "../src/blocks/types.ts";
import { compile, graphEdgeKeys, LIMITS, reference, tipTargets, type El } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";

const sample = (key: string) => LANG_SAMPLES.find((s) => s.key === key)!.source;
const graphOf = (src: string): El => compile(src).root!.props.children[0];
const errors = (src: string) => compile(src).errors;
const wrap = (body: string) => `root = Stack([g])\n${body}`;

const TWO = `a = GraphNode("a", "A")\nb = GraphNode("b", "B")`;

test("every Graph sample compiles and draws without a warning, at a desktop and a phone width", () => {
	for (const s of LANG_SAMPLES.filter((x) => x.key.includes("graph"))) {
		const c = compile(s.source);
		assert.deepEqual(c.errors, [], s.key);
		for (const width of [40, 57, 100, 140]) {
			const r = renderTree(c.root!, width, newState());
			assert.deepEqual(r.warnings, [], `${s.key}@${width}`);
			assert.ok(r.block.w <= width, `${s.key}@${width}: ${r.block.w} wide`);
		}
	}
});

test("the model is told what is wrong, with the ids it may use", () => {
	assert.match(errors(wrap(`g = Graph([a, b], [e1])\n${TWO}\ne1 = GraphEdge("a", "zz")`))[0], /to "zz".*not a GraphNode id.*Ids: a, b/);
	assert.match(errors(wrap(`g = Graph([a, b], [e1])\n${TWO}\ne1 = GraphEdge("A", "b")`))[0], /"A" is a label; the id is "a"/, "a label used as an id");
	assert.match(errors(wrap(`g = Graph([a, a2], [])\na = GraphNode("a", "A")\na2 = GraphNode("a", "Again")`))[0], /duplicate node id "a"/);
	assert.match(errors(wrap(`g = Graph([s, b], [e1])\ns = GraphNode("s", "go", "start")\nb = GraphNode("b", "B")\ne1 = GraphEdge("b", "s")`))[0], /enters "s", a start node/);
	assert.match(errors(wrap(`g = Graph([b, e], [e1])\nb = GraphNode("b", "B")\ne = GraphNode("e", "done", "end")\ne1 = GraphEdge("e", "b")`))[0], /leaves "e", an end node/);
	assert.match(errors(wrap(`g = Graph([a, b], [e1, e2])\n${TWO}\ne1 = GraphEdge("a", "b", "x")\ne2 = GraphEdge("a", "b", "x")`))[0], /is there twice/);
	assert.match(errors(wrap(`g = Graph([a, b], [["a", "b"]])\n${TWO}`))[0], /\[from, to\] pairs, which is Dag's form.*GraphEdge\("a", "b"\)/, "Dag's pair form");
	assert.match(errors(wrap(`g = Dag([a, b], [e1])\na = DagNode("a", "A")\nb = DagNode("b", "B")\ne1 = GraphEdge("a", "b")`))[0], /GraphEdge components, which belong to Graph/, "a GraphEdge handed to a Dag");
	assert.match(errors(wrap(`g = GraphEdge("a", "b")`))[0], /only belongs inside its parent \(Graph\)/);
	assert.match(errors(wrap(`g = Graph([a], [], "sideways")\na = GraphNode("a", "A")`))[0], /"LR", "TB"/);
});

test("two edges between a pair cannot carry a tooltip; one edge can, and so can a node", () => {
	const two = (tip: string) => wrap(`g = Graph([a, b], [e1, e2], null, null, [t])\n${TWO}\ne1 = GraphEdge("a", "b", "x")\ne2 = GraphEdge("a", "b", "y")\nt = Tooltip("${tip}", "hi")`);
	assert.match(errors(two("a>b"))[0], /names 2 edges.*Put the tooltip on a node/);
	assert.deepEqual(errors(two("a")), []);
	const one = wrap(`g = Graph([a, b], [e1], null, null, [t])\n${TWO}\ne1 = GraphEdge("a", "b", "x")\nt = Tooltip("a>b", "hi")`);
	assert.deepEqual(errors(one), []);
	assert.match(errors(one.replace('"a>b"', '"b>a"'))[0], /matches nothing here.*GraphNode id, or <fromId>><toId>/);
	assert.deepEqual(tipTargets(graphOf(one)), ["a", "b", "a>b"]);
});

test("the limits are the validator's, and the reference says them", () => {
	const ref = reference();
	for (const n of [LIMITS.graphNodes, LIMITS.graphEdges, LIMITS.graphLabel, LIMITS.graphEdgeLabel, LIMITS.graphPair]) assert.ok(ref.includes(String(n)), String(n));
	assert.ok(ref.includes("Graph for anything with a loop"), "the reference sends loops to Graph");
	assert.ok(ref.includes("when the user asks for a \"graph\" or a flowchart use Graph"), "and a request for a graph");
	assert.ok(ref.includes("GraphNode, GraphEdge"), "and lists the helpers");
});

test("edge keys: from>to, and from>to#2 for the next edge between the same pair", () => {
	assert.deepEqual(graphEdgeKeys([{ from: "a", to: "b" }, { from: "a", to: "b" }, { from: "b", to: "a" }, { from: "a", to: "b" }]), ["a>b", "a>b#2", "b>a", "a>b#3"]);
});

test("a note on a node or an edge says which, by id, and quotes the edge's own label", () => {
	const g = graphOf(sample("graph"));
	assert.equal(itemWords(g, "running").where, 'node `running` ("Running")');
	assert.equal(itemWords(g, "failed>queued").where, 'edge `failed` > `queued`, "retry (up to 3x)"');
	assert.equal(itemWords(g, "running>running").where, 'edge `running` > `running`, "heartbeat"');
	const pairs = graphOf(sample("graph-pairs"));
	assert.equal(itemWords(pairs, "client>api").where, 'edge `client` > `api`, "read"');
	assert.equal(itemWords(pairs, "client>api#2").where, 'edge `client` > `api`, "write"', "the second edge of a pair is told apart by its own label");
	// an id that holds a `>` is not split in two
	const odd = graphOf(wrap(`g = Graph([a, b], [e1])\na = GraphNode("x>y", "A")\nb = GraphNode("z", "B")\ne1 = GraphEdge("x>y", "z", "go")`));
	assert.equal(itemWords(odd, "x>y>z").where, 'edge `x>y` > `z`, "go"');
});

test("the tooltip badge of an edge sits on its label, and edges are targets a reader can hover", () => {
	const c = compile(sample("graph"));
	const r = renderTree(c.root!, 100, newState());
	const edge = r.block.targets.find((t) => t.kind === "tip" && t.label === "failed>queued");
	assert.ok(edge, "the edge is a tooltip target");
	const lines = rowsToLines(r.block.rows);
	assert.ok(lines.some((l) => l.includes("retry (up to 3x)◆") || l.includes("◆retry (up to 3x)") || l.includes("◆ retry")), "the badge is next to the label");
	assert.ok(r.block.targets.some((t) => t.kind === "item" && t.item!.key === "failed>queued"), "and the edge is something a note can be about");
});

test("small screens: a graph wider than the pane scrolls whole, and the arcs and the end are reachable", () => {
	const c = compile(sample("wide-graph"));
	const st = newState();
	const first = renderTree(c.root!, 57, st);
	const bar = first.block.targets.find((t) => t.kind === "pan" && t.scroll?.part === "track")!;
	assert.ok(bar, "a pan bar");
	const { key, total, view } = bar.scroll!;
	assert.ok(total > view * 2, `${total} wide in a ${view} pane`);
	const seen = new Set<string>();
	for (let pan = 0; pan <= total - view; pan += 4) {
		st.pan[key] = pan;
		const r = renderTree(c.root!, 57, st);
		assert.deepEqual(r.warnings, [], `pan ${pan}`);
		assert.ok(r.block.rows.every((row) => row.length <= 57), `pan ${pan}: nothing wider than the pane`);
		for (const l of rowsToLines(r.block.rows)) for (const ch of "●◉▲▶") if (l.includes(ch)) seen.add(ch);
	}
	assert.ok(["●", "◉", "▲", "▶"].every((ch) => seen.has(ch)), `scrolling shows the start, the end and the arrows: ${[...seen].join("")}`);
	st.pan[key] = 1e9;
	const end = rowsToLines(renderTree(c.root!, 57, st).block.rows).join("\n");
	assert.ok(end.includes("released"), "the far end shows the end node");
	assert.ok(!end.includes("…"), "nothing is cut with an ellipsis");
});

test("small screens: left to right gives way to top to bottom when only that fits, so a phone need not scroll", () => {
	const src = wrap(`g = Graph([s, impl, rev, e], [e1, e2, e3, e4])
s = GraphNode("s", "task", "start")
impl = GraphNode("impl", "Implementer", null, "running")
rev = GraphNode("rev", "Reviewer")
e = GraphNode("e", "merged", "end")
e1 = GraphEdge("s", "impl")
e2 = GraphEdge("impl", "rev", "ready for review")
e3 = GraphEdge("rev", "impl", "changes requested (up to 3x)")
e4 = GraphEdge("rev", "e", "approved")`);
	const c = compile(src);
	assert.deepEqual(c.errors, []);
	const wide = renderTree(c.root!, 120, newState());
	assert.ok(!wide.block.targets.some((t) => t.kind === "pan"), "(at 120 it fits left to right)");
	const phone = renderTree(c.root!, 57, newState());
	assert.ok(!phone.block.targets.some((t) => t.kind === "pan"), "no scrolling at 57 columns");
	assert.ok(phone.block.rows.length > wide.block.rows.length, "it went down instead of across");
	assert.deepEqual(phone.warnings, []);
});

test("hints for the mistakes models make: variable names for ids, and a start node that edges enter", () => {
	// Dag([n1, n2], [[n1, n2]]): the pair holds the components, not their ids
	const dag = errors(wrap(`g = Dag([n1, n2], [[n1, n2]])\nn1 = DagNode("build", "Build")\nn2 = DagNode("test", "Test")`));
	assert.equal(dag.length, 2, "one error for each id, and no second complaint about a short pair");
	assert.match(dag[0], /expects a string but got DagNode\. Name a DagNode by its id string, "build"/);
	assert.match(errors(wrap(`g = InfraMap([z], [l])\nz = InfraZone("Z", [a])\na = InfraNode("api", "API")\nl = InfraLink(a, a)`))[0], /Name a InfraNode by its id string, "api"/);
	// a state that edges return to made a start node: say what to write instead, once for the node
	const start = errors(wrap(`g = Graph([a, b, c], [e1, e2])\na = GraphNode("a", "go", "start")\nb = GraphNode("commit", "Commit", "start")\nc = GraphNode("fix", "Fix")\ne1 = GraphEdge("a", "commit")\ne2 = GraphEdge("fix", "commit")`));
	assert.equal(start.length, 1, "once for the node, not once for each edge into it");
	assert.match(start[0], /Leave kind out of "commit".*GraphNode\("begin", "", "start"\) with GraphEdge\("begin", "commit"\)/);
	// and the suggestion is itself valid
	assert.deepEqual(errors(wrap(`g = Graph([b, c, s], [e1, e2, e3])\nb = GraphNode("commit", "Commit")\nc = GraphNode("fix", "Fix")\ns = GraphNode("begin", "", "start")\ne1 = GraphEdge("begin", "commit")\ne2 = GraphEdge("commit", "fix")\ne3 = GraphEdge("fix", "commit")`)), []);
	assert.match(errors(wrap(`g = Graph([a, e], [e1])\na = GraphNode("a", "A")\ne = GraphNode("e", "end", "end")\ne1 = GraphEdge("e", "a")`))[0], /GraphNode\("finish", "", "end"\) with GraphEdge\("e", "finish"\)/);
});

test("the reference teaches Graph by an example that compiles, and the signatures say how a start and an end are used", () => {
	const ref = reference();
	const at = ref.indexOf("## Graph example");
	assert.ok(at > 0);
	const code = ref.slice(at, ref.indexOf("## Example")).split("\n").filter((l) => /^[a-z0-9]+ = /.test(l)).join("\n");
	const c = compile(code);
	assert.deepEqual(c.errors, [], "the example in the reference is valid");
	assert.ok(code.includes("GraphEdge") && code.includes('"start"') && code.includes('"end"'));
	assert.match(ref, /GraphNode\(id: string, label: string, kind\?: "state" \| "start" \| "end".*give each its OWN node/);
});
