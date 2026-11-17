// openui_draw: the tool only codemode scripts call. A stub pi captures registerTool, registerMessageRenderer and sendMessage. No model.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LANG_VERSION } from "../src/lang/library.ts";
import { setup, skip, strip } from "./pi-setup.ts";

async function load() {
	const ext: any = await import("../src/pi/extension.ts");
	const tools: any[] = [];
	const renderers = new Map<string, any>();
	const sent: { message: any; options: any }[] = [];
	const handlers: Record<string, any> = {};
	const stub: any = {
		registerTool: (t: any) => tools.push(t),
		registerMessageRenderer: (type: string, fn: any) => renderers.set(type, fn),
		registerCommand() {},
		on: (name: string, fn: any) => void (handlers[name] = fn),
		sendUserMessage() {},
		sendMessage: (message: any, options: any) => sent.push({ message, options }),
	};
	ext.default(stub);
	const tool = tools.find((t) => t.name === "openui_draw");
	assert.ok(tool, "openui_draw is registered");
	return { tool, renderers, sent, handlers };
}

const GOOD = `root = Stack([t])\nt = Table(${JSON.stringify(["host", "cpu"])}, ${JSON.stringify([["web-1", 41], ["web-2", 63]])})`;

test("openui_draw is a codemode tool with an output schema", { skip }, async () => {
	const { tool } = await load();
	assert.equal(tool.exposure, "codemode");
	assert.ok(tool.outputSchema, "declares outputSchema");
	assert.deepEqual(Object.keys(tool.outputSchema.properties).sort(), ["drawn", "errors", "warnings"]);
	assert.deepEqual(tool.parameters.required, ["source"]);
	assert.match(tool.description, /render_widget\(\{reference: true\}\)/);
	assert.match(tool.description, /store\(\)/);
});

test("openui_draw: a valid source posts one live openui-widget message that does not start a turn", { skip }, async () => {
	const { tool, sent } = await load();
	const res = await tool.execute("id", { source: GOOD, title: "Hosts" });
	assert.equal(sent.length, 1);
	const { message, options } = sent[0];
	assert.equal(message.customType, "openui-widget");
	assert.equal(message.display, true);
	assert.equal(message.content, "[widget: Hosts]");
	assert.equal(message.details.mode, "live");
	assert.equal(message.details.source, GOOD);
	assert.equal(message.details.lang, LANG_VERSION);
	assert.ok(message.details.id);
	assert.equal(options.triggerTurn, false, "no steer and no new turn while the agent streams");
	assert.equal(options.deliverAs, undefined);
	assert.equal(res.isError, undefined);
	assert.deepEqual(res.structuredContent, { drawn: true, errors: [], warnings: [] });
});

test("openui_draw: an invalid source posts nothing and returns the errors without throwing", { skip }, async () => {
	const { tool, sent } = await load();
	const res = await tool.execute("id", { source: `root = Stack([a])` });
	assert.equal(sent.length, 0);
	assert.equal(res.isError, true);
	assert.equal(res.structuredContent.drawn, false);
	assert.ok(res.structuredContent.errors.some((e: string) => /"a" is used but never defined/.test(e)));
	assert.match(res.content[0].text, /not drawn/);
	assert.match(res.content[0].text, /tools\.openui_draw again/);
	// a script gets structuredContent, never the text: everything the text tells the model (every error, and the signature footer) must be in errors
	const [, ...body] = res.content[0].text.split("\n");
	const asked = res.structuredContent.errors.join("\n");
	for (const line of body) assert.ok(asked.includes(line.replace(/^- /, "")), `missing from structuredContent.errors: ${line}`);
});

test("openui_draw: the posted details redraw through the openui-widget renderer as a live widget", { skip }, async () => {
	const { tool, renderers, sent } = await load();
	const { theme, w } = await setup();
	await tool.execute("id", { source: GOOD });
	const comp = renderers.get("openui-widget")(sent[0].message, {}, theme);
	assert.ok(comp instanceof w.OpenUIWidget, "a widget, not the fallback card");
	assert.equal(comp.mode, "live", "buttons and choices work");
	const text = strip(comp.render(80).join("\n"));
	assert.ok(text.includes("web-2") && text.includes("63"), text);
});

test("openui_draw: a turn gets at most 8 widgets, and a new turn starts the count again", { skip }, async () => {
	const { tool, sent, handlers } = await load();
	for (let i = 0; i < 8; i++) assert.equal((await tool.execute("id", { source: GOOD })).structuredContent.drawn, true);
	const over = await tool.execute("id", { source: GOOD });
	assert.equal(over.isError, true);
	assert.match(over.structuredContent.errors[0], /at most 8 widgets per turn/);
	assert.equal(sent.length, 8);
	await handlers.agent_start();
	assert.equal((await tool.execute("id", { source: GOOD })).structuredContent.drawn, true);
	assert.equal(sent.length, 9);
});
