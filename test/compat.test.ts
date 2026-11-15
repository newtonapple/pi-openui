// Compatibility: a session stores the widget's OpenUI Lang source, and the widget is compiled and drawn again when the session
// opens. So drawing changes reach old sessions by themselves; what can break one is a change to the language. These tests pin
// the way out: a version stamp, a lenient "restore" compile, and a fallback that shows the source instead of nothing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fallbackLines } from "../src/blocks/fallback.ts";
import { ALIASES, compile, LANG_VERSION, LIMITS, MIGRATIONS } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";
import { setup, skip, strip } from "./pi-setup.ts";

const shape = (el: any): any => (el && typeof el === "object" ? (Array.isArray(el) ? el.map(shape) : { type: el.type, props: Object.fromEntries(Object.entries(el.props ?? {}).map(([k, v]) => [k, shape(v)])) }) : el);
const restore = (src: string, extra: object = {}) => compile(src, { mode: "restore", ...extra });

test("the language has a version, and nothing is aliased or migrated yet", () => {
	assert.equal(LANG_VERSION, 1);
	assert.deepEqual(ALIASES, {});
	assert.deepEqual(MIGRATIONS, []);
});

test("restore changes nothing for a source that is valid today: same widget, no notes", () => {
	for (const s of LANG_SAMPLES) {
		const strict = compile(s.source);
		const lenient = restore(s.source);
		assert.deepEqual(strict.errors, [], s.key);
		assert.deepEqual(lenient.errors, [], s.key);
		assert.deepEqual(shape(lenient.root), shape(strict.root), s.key);
		assert.deepEqual(lenient.notes, [], s.key);
		assert.deepEqual(strict.notes, [], s.key);
	}
});

test("an old component name is rewritten in restore, and only restore (strict still tells the model)", () => {
	const src = `root = Stack([t])\nt = OldText("hi")`;
	const strict = compile(src, { aliases: { OldText: "Text" } });
	assert.ok(!strict.ok && strict.errors.some((e) => e.includes("OldText")), strict.errors.join("|"));
	const r = restore(src, { aliases: { OldText: "Text" } });
	assert.deepEqual(r.errors, []);
	assert.equal(r.root!.props.children[0].type, "Text");
});

test("an alias does not touch a string that happens to contain the old name", () => {
	const r = restore(`root = Stack([t])\nt = Text("write OldText(1) here")`, { aliases: { OldText: "Text" } });
	assert.deepEqual(r.errors, []);
	assert.equal(r.root!.props.children[0].props.content ?? r.root!.props.children[0].props.text, "write OldText(1) here");
});

test("a migration runs for a source written under an older version, and not for a newer one", () => {
	const migrations = [{ from: 1, run: (s: string) => s.replace("Heading(", "Text(") }];
	const src = `root = Stack([t])\nt = Heading("hi")`;
	assert.deepEqual(restore(src, { migrations, from: 1 }).errors, []);
	assert.ok(restore(src, { migrations, from: 2 }).errors.length > 0, "written under version 2: the 1 to 2 migration is not for it");
	assert.ok(compile(src, { migrations }).errors.length > 0, "strict never migrates");
});

test("migrations run in order", () => {
	const migrations = [
		{ from: 1, run: (s: string) => s.replace("A(", "B(") },
		{ from: 2, run: (s: string) => s.replace("B(", "Text(") },
	];
	assert.deepEqual(restore(`root = Stack([t])\nt = A("x")`, { migrations, from: 1 }).errors, []);
});

test("a limit made tighter after a widget was written: restore trims the string and says so; strict refuses", () => {
	const old = LIMITS.cell;
	try {
		LIMITS.cell = 5;
		const src = `root = Stack([t])\nt = Table(["A"], [["abcdefghijklmnopqrst"]])`;
		assert.ok(!compile(src).ok);
		const r = restore(src);
		assert.deepEqual(r.errors, []);
		assert.equal(r.root!.props.children[0].props.rows[0][0], "abcde");
		assert.equal(r.notes.length, 1);
		assert.match(r.notes[0], /20 characters.*5/);
	} finally {
		LIMITS.cell = old;
	}
});

test("a list longer than its limit is cut in restore (101 table rows), with a note", () => {
	const rows = Array.from({ length: LIMITS.tableRows + 1 }, (_, i) => `["r${i}"]`).join(",");
	const src = `root = Stack([t])\nt = Table(["A"], [${rows}])`;
	assert.ok(!compile(src).ok);
	const r = restore(src);
	assert.deepEqual(r.errors, []);
	assert.equal(r.root!.props.children[0].props.rows.length, LIMITS.tableRows);
	assert.equal(r.notes.length, 1);
});

test("extra arguments and an unreachable statement are fine in restore, errors in strict", () => {
	const extra = `root = Stack([t])\nt = Text("a", "body", ${Array.from({ length: 20 }, () => '"x"').join(", ")})`;
	assert.ok(!compile(extra).ok);
	const r = restore(extra);
	assert.deepEqual(r.errors, []);
	assert.ok(r.notes.some((n) => /argument/.test(n)), r.notes.join("|"));
	const dangling = `root = Stack([t])\nt = Text("a")\nu = Text("never drawn")`;
	assert.ok(!compile(dangling).ok);
	const d = restore(dangling);
	assert.deepEqual(d.errors, []);
	assert.ok(d.notes.some((n) => /"u"/.test(n)), d.notes.join("|"));
});

test("a count limit stays an error in restore: nothing is dropped from the middle of a widget", () => {
	const old = LIMITS.elements;
	try {
		LIMITS.elements = 2;
		const src = `root = Stack([a, b])\na = Text("1")\nb = Text("2")`;
		assert.ok(!compile(src).ok);
		assert.ok(!restore(src).ok);
	} finally {
		LIMITS.elements = old;
	}
});

test("restore never throws: garbage in, errors out", () => {
	for (const bad of ["", "{{{{", "root = ", "root = Stack([", "\u0000\u0001", "root = Stack([t])\nt = Table(" + "[".repeat(500)]) {
		const r = restore(bad);
		assert.equal(r.ok, false);
		assert.ok(r.errors.length > 0);
		assert.ok(Array.isArray(r.notes));
	}
});

test("the fallback says what happened, shows the start of the source, and stays small", () => {
	const src = Array.from({ length: 10_000 }, (_, i) => `line${i} = ${"x".repeat(200)}`).join("\n");
	const lines = fallbackLines(src, ["line 3: unknown component \"Gone\""], 4);
	assert.match(lines[0], /could not be drawn again.*v4/);
	assert.ok(lines.some((l) => l.includes('unknown component "Gone"')));
	const shown = lines.filter((l) => l.startsWith("  line"));
	assert.equal(shown.length, 12);
	assert.ok(lines.every((l) => l.length <= 90), "every line is short");
	assert.ok(lines.length <= 20);
	assert.deepEqual(fallbackLines("", [], 1).slice(0, 1).length, 1);
});

test("pi stores the language version with a widget, and reads a stored one back", { skip }, async () => {
	const { theme } = await setup();
	const ext: any = await import("../src/pi/extension.ts");
	const tools: any[] = [];
	const renderers: Record<string, any> = {};
	const commands: Record<string, any> = {};
	const sent: any[] = [];
	ext.default({
		registerTool: (t: any) => tools.push(t),
		registerMessageRenderer: (n: string, f: any) => (renderers[n] = f),
		registerCommand: (n: string, c: any) => (commands[n] = c),
		on() {},
		sendUserMessage() {},
		sendMessage: (m: any) => sent.push(m),
	});
	const tool = tools.find((t) => t.name === "render_widget");
	const ok = await tool.execute("id", { source: `root = Stack([a])\na = Text("hi", "title")` });
	assert.equal(ok.details.lang, LANG_VERSION);
	await commands["openui-gallery"].handler("text", { ui: { notify() {} } });
	assert.equal(sent[0].details.lang, LANG_VERSION);

	const render = (r: any) => strip(r.render(80).join("\n"));
	const result = (details: any) => ({ details });
	const call = (details: any) => tool.renderResult(result(details), {}, theme, { toolCallId: "t-" + Math.random(), isError: false });
	// a missing, odd or newer version is still tried
	for (const lang of [undefined, "x", 0, 1.5, 99]) {
		assert.ok(render(call({ kind: "widget", source: `root = Stack([a])\na = Text("still here")`, lang })).includes("still here"), `lang ${String(lang)}`);
	}
	// one that cannot be drawn is shown as its source, not as nothing
	const broken = render(call({ kind: "widget", source: `root = Stack([a])\na = GoneComponent("x")`, lang: 99 }));
	assert.match(broken, /could not be drawn again.*v99/);
	assert.ok(broken.includes("GoneComponent"));
	// the same for a message (the gallery and echoes)
	const msg = renderers["openui-widget"]({ details: { id: "m1", source: `root = Stack([a])\na = GoneComponent("x")`, mode: "echo" } }, {}, theme);
	assert.ok(msg, "never undefined: a blank widget is the failure we are removing");
	assert.match(render(msg), /could not be drawn again/);
});

test("a widget redrawn with changes says so in one quiet line", { skip }, async () => {
	const { theme, w } = await setup();
	const c = compile(`root = Stack([a])\na = Text("hello")`);
	const widget = new w.OpenUIWidget("notes-1", c.root!, theme, "echo", ["line 2: a value was cut", "line 3: another"]);
	const text = strip(widget.render(100).join("\n"));
	assert.match(text, /redrawn by a newer version.*2 changes/s);
	assert.ok(text.includes("line 2: a value was cut"));
	const plain = new w.OpenUIWidget("notes-2", c.root!, theme, "echo");
	assert.ok(!strip(plain.render(100).join("\n")).includes("redrawn"));
});

// ---- the corpus: sources as they were written by 0.2.0 and before, kept as they are

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderTree } from "../src/blocks/render.ts";
import { newState } from "../src/blocks/types.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "compat", "corpus");
const MANIFEST = join(dirname(fileURLToPath(import.meta.url)), "compat", "MANIFEST.json");
const files = existsSync(CORPUS) ? readdirSync(CORPUS).filter((f) => f.endsWith(".oui")).sort() : [];

test("the corpus holds a source for every sample and for the cases this branch cares about", () => {
	assert.ok(files.length >= LANG_SAMPLES.length + 3, `${files.length} files`);
	for (const s of LANG_SAMPLES) assert.ok(files.includes(`${s.key}.oui`), `${s.key}.oui is missing: run node scripts/freeze-corpus.ts`);
	for (const extra of ["fleet-table.oui", "wide-infra.oui", "choice-0.1.0.oui"]) assert.ok(files.includes(extra), extra);
});

for (const f of files) {
	test(`corpus ${f}: restored with no errors, and drawn at 20, 40, 63 and 100 columns without a throw`, () => {
		const src = readFileSync(join(CORPUS, f), "utf8");
		const c = compile(src, { mode: "restore", from: 1 });
		assert.deepEqual(c.errors, [], f);
		assert.ok(c.root, f);
		for (const width of [20, 40, 63, 100]) {
			const { block } = renderTree(c.root!, width, newState());
			for (const row of block.rows) assert.equal(row.length, block.w, `${f} at ${width}: a row is as wide as its block`);
		}
	});
}

test("the corpus is append-only: every file is in the manifest and is what it was when it was added", () => {
	assert.ok(existsSync(MANIFEST), "test/compat/MANIFEST.json: run node scripts/freeze-corpus.ts");
	const listed: Record<string, string> = JSON.parse(readFileSync(MANIFEST, "utf8")).files;
	for (const f of files) {
		assert.ok(listed[f], `${f} is not in the manifest: run node scripts/freeze-corpus.ts to add it`);
		const sha = createHash("sha256").update(readFileSync(join(CORPUS, f))).digest("hex");
		assert.equal(sha, listed[f], `${f} was changed. Never edit a corpus file: it is a source an older version wrote. Add a new one`);
	}
	for (const f of Object.keys(listed)) assert.ok(files.includes(f), `${f} is in the manifest but missing: a corpus file is never deleted`);
});
