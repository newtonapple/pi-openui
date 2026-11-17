import test from "node:test";
import assert from "node:assert/strict";

// render_widget is "model-only": pi declares it to the model but never lets a codemode script call it
// (a nested call is not drawn), and codemode.mode "only" does not hide it.
async function loadTool(): Promise<any> {
	const ext: any = await import("../src/pi/extension.ts");
	const tools: any[] = [];
	const stub: any = { registerTool: (t: any) => tools.push(t), registerMessageRenderer() {}, registerCommand() {}, on() {}, sendUserMessage() {}, sendMessage() {} };
	ext.default(stub);
	return tools.find((t) => t.name === "render_widget");
}

test("render_widget is registered as model-only", async () => {
	const tool = await loadTool();
	assert.ok(tool, "registered");
	assert.equal(tool.exposure, "model-only");
});

test("a model-only render_widget still draws and still returns the reference", async () => {
	const tool = await loadTool();
	const ref = await tool.execute("id", { reference: true });
	assert.equal(ref.details.kind, "reference");
	assert.ok(ref.content[0].text.includes("Stack(children"));
	const ok = await tool.execute("id", { source: `root = Stack([a])\na = Text("hi", "title")` });
	assert.equal(ok.details.kind, "widget");
	assert.match(ok.content[0].text, /Widget drawn/);
	await assert.rejects(() => tool.execute("id", { source: `root = Stack([a])` }), /"a" is used but never defined/);
});
