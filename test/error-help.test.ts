import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, errorHelp, LIMITS, reference, SPECS, type Compiled } from "../src/lang/library.ts";
import { skip } from "./pi-setup.ts";

const helpNames = (c: Compiled) => [...errorHelp(c).matchAll(/^- (\w+)\(/gm)].map((m) => m[1]);

test("a Tabs root compiles inside a Stack and tells the model", () => {
	const c = compile(`root = Tabs([TabItem("Overview", [Text("Synthetic status")])])`);
	assert.ok(c.ok, c.errors.join("\n"));
	assert.equal(c.root!.type, "Stack");
	assert.equal(c.root!.props.children[0].type, "Tabs");
	assert.deepEqual(c.warnings, ["root was a Tabs; it was drawn inside a Stack"]);
});

test("a Card root compiles inside a Stack without changing its children", () => {
	const c = compile(`root = Card([Text("Synthetic status")], "Overview")`);
	assert.ok(c.ok, c.errors.join("\n"));
	assert.equal(c.root!.type, "Stack");
	const card = c.root!.props.children[0];
	assert.equal(card.type, "Card");
	assert.equal(card.props.title, "Overview");
	assert.equal(card.props.children[0].props.text, "Synthetic status");
	assert.deepEqual(c.warnings, ["root was a Card; it was drawn inside a Stack"]);
});

test("helper roots still fail, using the signature table's helper flag", () => {
	const c = compile(`root = TabItem("Overview", [])`);
	assert.equal(c.ok, false);
	assert.equal(c.root, undefined);
	assert.match(c.errors[0], /TabItem is not a standalone component/);
	for (const spec of SPECS.filter((s) => s.helper)) {
		const helper = compile(`root = ${spec.name}()`);
		assert.equal(helper.ok, false, spec.name);
		assert.match(helper.errors[0], /is not a standalone component/, spec.name);
	}
});

test("Table arity error keeps its text and adds only its reference signature", () => {
	const c = compile(`root = Stack([Table(["Name"], [["synthetic"]], null, null, true)])`);
	assert.deepEqual(c.errors, ["line 1: Table takes at most 4 argument(s), got 5"]);
	assert.deepEqual(helpNames(c), ["Table"]);
	const refSignature = reference().split("\n").find((line) => line.startsWith("Table("))!.split(" — ")[0];
	assert.equal(errorHelp(c), `Signatures:\n- ${refSignature}`);
});

test("a component type error names the host and expected helper in that order", () => {
	const c = compile(`root = Stack([InfraMap([InfraNode("n1", "Synthetic node")], [])])`);
	assert.deepEqual(c.errors, ['line 1: InfraMap argument "zones"[1] expects InfraZone but got InfraNode']);
	assert.deepEqual(c.errorComponents, ["InfraMap", "InfraZone"]);
	assert.deepEqual(helpNames(c), ["InfraMap", "InfraZone"]);
});

test("missing and wrongly typed component arrays include their expected components", () => {
	for (const expr of ["InfraMap()", 'InfraMap("wrong", [])', "InfraMap([42], [])"]) {
		const c = compile(`root = Stack([${expr}])`);
		assert.deepEqual(helpNames(c).slice(0, 2), ["InfraMap", "InfraZone"]);
	}
	const c = compile(`root = Stack([SequenceDiagram([SeqParticipant("a", "Synthetic")], [42])])`);
	assert.deepEqual(helpNames(c), ["SequenceDiagram", "SeqMessage", "SeqNote", "SeqGroup"]);
});

test("30 argument errors yield at most eight distinct signatures in first-named order", () => {
	const names = ["Text", "Card", "Metric", "Button", "Markdown", "CodeBlock", "Image", "Callout", "BarChart", "Table"];
	const invalid = ['Text(false)', 'Card(false)', 'Metric(false, "value")', 'Button(false)', 'Markdown(false)', 'CodeBlock(false)', 'Image(false)', 'Callout(false)', 'BarChart(false, [1])', 'Table(false, [["synthetic"]])'];
	const calls = Array.from({ length: 30 }, (_, i) => invalid[i % invalid.length]);
	const c = compile(`root = Stack([${calls.map((_, i) => `c${i}`).join(", ")}])\n${calls.map((call, i) => `c${i} = ${call}`).join("\n")}`);
	assert.equal(c.ok, false);
	assert.equal(c.errors.length, LIMITS.errors + 1);
	assert.equal(c.errors.at(-1), "... and 5 more errors; fix these first");
	assert.deepEqual(helpNames(c), names.slice(0, 8));
	assert.equal(new Set(helpNames(c)).size, 8);
});

test("signatures for errors beyond the reporting limit are omitted", () => {
	const calls = Array.from({ length: LIMITS.errors }, (_, i) => `t${i} = Text(false)`);
	const c = compile(`root = Stack([${calls.map((_, i) => `t${i}`).join(", ")}, extra])\n${calls.join("\n")}\nextra = InfraMap()`);
	assert.equal(c.errors.length, LIMITS.errors + 1);
	assert.equal(c.errors.at(-1), "... and 2 more errors; fix these first");
	assert.deepEqual(c.errorComponents, ["Text"]);
	assert.deepEqual(helpNames(c), ["Text"]);
});

test("checkSource ends errors with signatures and render_widget exposes wrap notes", { skip }, async () => {
	const ext = await import("../src/pi/extension.ts");
	const source = 'root = Stack([Table(["a"], [["b"]], null, null, true)])';
	const checked = ext.checkSource(source);
	assert.equal(checked.ok, false);
	assert.ok(checked.errorText.endsWith(`\n${errorHelp(compile(source))}`));
	assert.match(checked.errorText, /\nSignatures:\n- Table\([^\n]+\)$/);
	const tools: any[] = [];
	ext.default({ registerTool: (tool: any) => tools.push(tool), registerMessageRenderer() {}, registerCommand() {}, on() {}, sendUserMessage() {}, sendMessage() {} } as any);
	const tool = tools.find((t) => t.name === "render_widget");
	assert.ok(tool);
	await assert.rejects(() => tool.execute("error-help", { source }), (error: Error) => error.message === checked.errorText);
	const result = await tool.execute("root-wrap", { source: 'root = Card([Text("Synthetic status")])' });
	assert.match(result.content[0].text, / Notes: root was a Card; it was drawn inside a Stack\.$/);
});

test("valid sources have no error help, and an unchanged Stack root has no warning", () => {
	const c = compile(`root = Stack([Text("Synthetic status")])`);
	assert.ok(c.ok);
	assert.deepEqual(c.warnings, []);
	assert.equal(errorHelp(c), "");
	assert.equal(errorHelp(compile(`root = Card([])`)), "");
	assert.equal(errorHelp(compile("")), "");
});

test("errorHelp tolerates absent, unknown, duplicate and malformed metadata without throwing", () => {
	const c = compile("");
	assert.equal(errorHelp({ ...c, errorComponents: undefined }), "");
	assert.deepEqual(helpNames({ ...c, errorComponents: ["Unknown", "Table", "Table"] }), ["Table"]);
	assert.equal(errorHelp(null as unknown as Compiled), "");
	assert.equal(errorHelp({ ...c, errorComponents: 42 as unknown as string[] }), "");
});
