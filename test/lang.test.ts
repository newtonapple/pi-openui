import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, reference, SPECS } from "../src/lang/library.ts";

const ok = (src: string) => {
	const r = compile(src);
	assert.deepEqual(r.errors, [], src);
	assert.ok(r.root);
	return r.root!;
};
const errs = (src: string) => compile(src).errors.join("\n");

test("a typical dashboard compiles into a typed tree", () => {
	const root = ok(`root = Stack([title, kpis, load, go])
title = Text("Cluster status", "title")
kpis = Stack([m1, m2], "row")
m1 = Metric("GPU util", "87%", "+4% vs 1h ago", "warn")
m2 = Metric("Nodes up", "4 / 4", "all healthy", "good")
load = Card([chart], "Load by node")
chart = BarChart(["a", "b"], [91, 84], null, "%")
go = Button("Show slowest", @ToAssistant("Show the 10 slowest requests"))`);
	assert.equal(root.type, "Stack");
	assert.equal(root.props.children.length, 4);
	assert.equal(root.props.children[3].props.action.steps[0].name, "ToAssistant");
	assert.equal(root.props.children[2].props.children[0].props.unit, "%");
	assert.equal(root.props.children[2].props.children[0].props.title, undefined);
});

test("references may be used before they are defined", () => {
	ok(`root = Stack([a])\na = Text(b)\nb = "late"`);
});

test("named arguments get a clear error", () => {
	assert.match(errs(`root = Stack([t])\nt = Metric("a", "b", delta: "+1")`), /named argument "delta:" is not supported/);
});

test("missing root, unreferenced names, undefined names, cycles", () => {
	assert.match(errs(`a = Text("x")`), /root = Stack/);
	assert.match(errs(`root = Stack([a])\na = Text("x")\norphan = Text("y")`), /"orphan" is defined but not reachable/);
	assert.match(errs(`root = Stack([ghost])`), /"ghost" is used but never defined/);
	assert.match(errs(`root = Stack([a])\na = Card([a])`), /cycle/);
	assert.match(errs(`root = Stack([a])\na = b\nb = a`), /cycle/);
});

test("type, enum, arity and required-argument errors", () => {
	assert.match(errs(`root = Stack([t])\nt = Text(5)`), /expects a string but got a number/);
	assert.match(errs(`root = Stack([t])\nt = Text("x", "huge")`), /must be one of "title"/);
	assert.match(errs(`root = Stack([t])\nt = Text("x", "body", 3)`), /takes at most 2 argument/);
	assert.match(errs(`root = Stack([t])\nt = Metric("only label")`), /missing the required argument "value"/);
	assert.match(errs(`root = Stack([t])\nt = Nope("x")`), /unknown component "Nope"/);
	assert.match(errs(`root = Text("x")`), /root must be a Stack/);
});

test("helpers cannot stand alone", () => {
	assert.match(errs(`root = Stack([t])\nt = TabItem("a", [])`), /TabItem is not a standalone component/);
});

test("cross checks: edges, relations, links, lengths, rows", () => {
	assert.match(errs(`root = Stack([d])\nd = Dag([n], [["a", "zzz"]])\nn = DagNode("a", "A")`), /"zzz", which is not a DagNode id/);
	assert.match(errs(`root = Stack([t])\nt = Table(["a", "b"], [["1"]])`), /row 1 has 1 cells but there are 2 columns/);
	assert.match(errs(`root = Stack([c])\nc = BarChart(["a"], [1, 2])`), /same length/);
	assert.match(errs(`root = Stack([c])\nc = LineChart(["a", "b"], [s])\ns = Series("x", [1])`), /series "x" has 1 values but there are 2 labels/);
	assert.match(errs(`root = Stack([m])\nm = InfraMap([z], [l])\nz = InfraZone("Z", [n])\nn = InfraNode("a", "A")\nl = InfraLink("a", "q")`), /"q" is not an InfraNode id/);
	assert.match(errs(`root = Stack([c])\nc = Choice("q", ["only one"])`), /at least 2/);
	assert.match(errs(`root = Stack([c])\nc = PieChart(["a"], [-1])`), /negative/);
});

test("actions: validation of steps", () => {
	assert.match(errs(`root = Stack([b])\nb = Button("x", @Nope("y"))`), /unknown action step @Nope/);
	assert.match(errs(`root = Stack([b])\nb = Button("x", @ToAssistant("${"y".repeat(501)}"))`), /500 characters/);
	const r = ok(`root = Stack([b])\nb = Button("x", Action([@ToAssistant("one"), @OpenUrl("https://example.com")]))`);
	assert.equal(r.props.children[0].props.action.steps.length, 2);
});

test("all errors are reported together, with line numbers", () => {
	const e = compile(`root = Stack([a, b])\na = Text(1)\nb = Metric("x")`).errors;
	assert.ok(e.length >= 2);
	assert.ok(e.every((m) => /^line \d+:/.test(m)));
});

test("parser recovers after a bad statement", () => {
	const r = compile(`root = Stack([a, b])\na = Text("unclosed\nb = Text("ok")`);
	assert.ok(r.errors.length >= 1);
});

test("garbage input never throws", () => {
	for (const s of ["", "   ", "=", "root =", "root = (", "root = Stack([", `root = "x`, "@@@", "root = Stack([a,,])", "{{{{", "root = 5", "\u0000\u0001"]) assert.doesNotThrow(() => compile(s));
});

test("reference text covers every component and the key rules", () => {
	const ref = reference();
	for (const s of SPECS) assert.ok(ref.includes(`${s.name}(`), `reference lists ${s.name}`);
	for (const w of ["POSITIONAL", "null", "tooltips", "@ToAssistant", "root = Stack"]) assert.ok(ref.includes(w), w);
	assert.ok(ref.length < 22000, `reference length ${ref.length}`);
});

test("the reference example compiles", () => {
	const ex = reference().split("## Example\n")[1];
	ok(ex.trim());
});
