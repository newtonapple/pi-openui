// The user's configuration file for pi-openui: ~/.pi/agent/openui.json. Pure functions with the file system passed in, so the
// hostile cases (invalid JSON, a string where a number goes, an unreadable file) are plain tests.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULTS, loadSettings, parseSettings, runConfigCommand, saveSetting, settingsPath } from "../src/pi/config.ts";

const min = (raw: unknown, env: Record<string, string | undefined> = {}) => parseSettings(raw, env);
const fileWith = (n: unknown) => ({ table: { minColumnWidth: n } });

test("defaults: nothing configured is 12, with no complaint", () => {
	assert.equal(DEFAULTS.tableMinCol, 12);
	for (const raw of [undefined, {}, { table: {} }, { other: 1 }]) {
		const r = min(raw);
		assert.equal(r.settings.tableMinCol, 12);
		assert.deepEqual(r.problems, []);
		assert.equal(r.sources.tableMinCol, "default");
	}
});

test("a good value is used, rounded to a whole number", () => {
	assert.equal(min(fileWith(14)).settings.tableMinCol, 14);
	assert.equal(min(fileWith(14)).sources.tableMinCol, "file");
	assert.equal(min(fileWith(14.6)).settings.tableMinCol, 15);
	assert.deepEqual(min(fileWith(14)).problems, []);
});

test("hostile values: a wrong type or a non-number is the default and one problem, never an exception", () => {
	for (const bad of ["abc", "14", null, [], {}, true, NaN, Infinity]) {
		const r = min(fileWith(bad));
		assert.equal(r.settings.tableMinCol, 12, String(bad));
		assert.equal(r.problems.length, 1, `${String(bad)}: ${r.problems}`);
	}
	for (const bad of [null, [], "text", 5, true]) {
		const r = min(bad);
		assert.equal(r.settings.tableMinCol, 12);
		assert.equal(r.problems.length, 1, String(bad));
	}
	assert.equal(min({ table: 5 }).problems.length, 1);
});

test("a number out of range is clamped to 4..40 with a problem that says so", () => {
	for (const [given, want] of [[2, 4], [-3, 4], [1e9, 40], [41, 40], [4, 4], [40, 40]] as const) {
		const r = min(fileWith(given));
		assert.equal(r.settings.tableMinCol, want, String(given));
		assert.equal(r.problems.length, given === want ? 0 : 1, String(given));
	}
	assert.match(min(fileWith(1e9)).problems[0], /4.*40/);
});

test("the environment wins over the file; a bad environment value falls back to the file and says so", () => {
	assert.equal(min(fileWith(14), { PI_OPENUI_TABLE_MIN_COL: "16" }).settings.tableMinCol, 16);
	assert.equal(min(fileWith(14), { PI_OPENUI_TABLE_MIN_COL: "16" }).sources.tableMinCol, "env");
	assert.equal(min(fileWith(14), { PI_OPENUI_TABLE_MIN_COL: " 16 " }).settings.tableMinCol, 16);
	const bad = min(fileWith(14), { PI_OPENUI_TABLE_MIN_COL: "x" });
	assert.equal(bad.settings.tableMinCol, 14);
	assert.equal(bad.problems.length, 1);
	assert.deepEqual(min(fileWith(14), { PI_OPENUI_TABLE_MIN_COL: "" }).problems, []);
	assert.equal(min({}, { PI_OPENUI_TABLE_MIN_COL: "1e9" }).settings.tableMinCol, 40);
});

test("the file lives in pi's agent directory, or where PI_CODING_AGENT_DIR says", () => {
	assert.equal(settingsPath({ PI_CODING_AGENT_DIR: "/x/agent" }), "/x/agent/openui.json");
	assert.equal(settingsPath({}), join(homedir(), ".pi", "agent", "openui.json"));
});

test("loading: a missing file is fine; an unreadable or invalid one is one problem; a good one is read", () => {
	const err = (code: string) => () => {
		throw Object.assign(new Error(code), { code });
	};
	const env = { PI_CODING_AGENT_DIR: "/nowhere" };
	const none = loadSettings(env, err("ENOENT") as any);
	assert.deepEqual(none.problems, []);
	assert.equal(none.settings.tableMinCol, 12);
	assert.equal(loadSettings(env, err("EACCES") as any).problems.length, 1);
	const broken = loadSettings(env, (() => "{not json") as any);
	assert.equal(broken.problems.length, 1);
	assert.match(broken.problems[0], /openui\.json/);
	assert.equal(broken.settings.tableMinCol, 12);
	assert.equal(loadSettings(env, (() => '{"table":{"minColumnWidth":18}}') as any).settings.tableMinCol, 18);
});

test("saving keeps the keys it does not know, makes the folder, and a reset takes the key out", () => {
	const dir = mkdtempSync(join(tmpdir(), "openui-cfg-"));
	const file = join(dir, "nested", "openui.json");
	saveSetting(file, "table.minColumnWidth", 14);
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { table: { minColumnWidth: 14 } });
	writeFileSync(file, JSON.stringify({ other: { a: 1 }, table: { minColumnWidth: 14, keep: true } }));
	saveSetting(file, "table.minColumnWidth", 20);
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { other: { a: 1 }, table: { minColumnWidth: 20, keep: true } });
	saveSetting(file, "table.minColumnWidth", undefined);
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { other: { a: 1 }, table: { keep: true } });
	writeFileSync(file, JSON.stringify({ table: { minColumnWidth: 20 } }));
	saveSetting(file, "table.minColumnWidth", undefined);
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {}, "an empty table is not left behind");
});

test("saving never overwrites a file it cannot read as JSON", () => {
	const dir = mkdtempSync(join(tmpdir(), "openui-cfg-"));
	const file = join(dir, "openui.json");
	writeFileSync(file, "{ my hand written notes");
	assert.throws(() => saveSetting(file, "table.minColumnWidth", 14), /not valid JSON/);
	assert.equal(readFileSync(file, "utf8"), "{ my hand written notes");
});

test("/openui-config: show, set, reset, and the mistakes a person types", () => {
	const dir = mkdtempSync(join(tmpdir(), "openui-cmd-"));
	const env = { PI_CODING_AGENT_DIR: dir };
	const file = join(dir, "openui.json");
	const shown = runConfigCommand("", env);
	assert.equal(shown.level, "info");
	assert.ok(shown.message.includes("12") && shown.message.includes(file), shown.message);
	const set = runConfigCommand("table.minColumnWidth 14", env);
	assert.equal(set.level, "info");
	assert.equal(set.settings?.tableMinCol, 14);
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { table: { minColumnWidth: 14 } });
	for (const bad of ["table.minColumnWidth 3", "table.minColumnWidth 41", "table.minColumnWidth abc", "table.minColumnWidth", "table.minColumnWidth 1.5"]) {
		const r = runConfigCommand(bad, env);
		assert.equal(r.level, "error", bad);
		assert.match(r.message, /4.*40/, bad);
		assert.equal(r.settings, undefined);
	}
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { table: { minColumnWidth: 14 } }, "mistakes change nothing");
	const unknown = runConfigCommand("tabel.minColumnWidth 14", env);
	assert.equal(unknown.level, "error");
	assert.match(unknown.message, /table\.minColumnWidth/);
	const env2 = runConfigCommand("table.minColumnWidth 20", { ...env, PI_OPENUI_TABLE_MIN_COL: "16" });
	assert.equal(env2.level, "warning", "the environment still wins, and the person is told");
	assert.equal(env2.settings?.tableMinCol, 16);
	const reset = runConfigCommand("reset", env);
	assert.equal(reset.settings?.tableMinCol, 12);
	assert.ok(existsSync(file));
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {});
	assert.equal(runConfigCommand("table.minColumnWidth reset", env).settings?.tableMinCol, 12);
});

// ---- the second setting: how far one tap on a fine arrow scrolls

const step = (raw: unknown, env: Record<string, string | undefined> = {}) => parseSettings(raw, env);
const withStep = (n: unknown) => ({ scroll: { step: n } });

test("scroll.step: 8 cells unless set; a good value is used; each setting has its own problems", () => {
	assert.equal(DEFAULTS.scrollStep, 8);
	assert.equal(step({}).settings.scrollStep, 8);
	assert.equal(step(withStep(5)).settings.scrollStep, 5);
	assert.equal(step(withStep(5)).sources.scrollStep, "file");
	const both = step({ table: { minColumnWidth: 14 }, scroll: { step: "x" } });
	assert.equal(both.settings.tableMinCol, 14, "a bad scroll.step does not spoil the other setting");
	assert.equal(both.settings.scrollStep, 8);
	assert.equal(both.problems.length, 1);
	assert.match(both.problems[0], /scroll\.step/);
});

test("scroll.step: clamped to 1..40 with a problem, hostile values are the default", () => {
	for (const [given, want] of [[0, 1], [-4, 1], [1000, 40], [1, 1], [40, 40]] as const) {
		const r = step(withStep(given));
		assert.equal(r.settings.scrollStep, want, String(given));
		assert.equal(r.problems.length, given === want ? 0 : 1, String(given));
	}
	for (const bad of ["8", null, [], {}, true, NaN, Infinity]) {
		const r = step(withStep(bad));
		assert.equal(r.settings.scrollStep, 8, String(bad));
		assert.equal(r.problems.length, 1, String(bad));
	}
	assert.equal(step({ scroll: 3 }).problems.length, 1);
});

test("scroll.step: the environment wins, a bad one is ignored and said", () => {
	assert.equal(step(withStep(5), { PI_OPENUI_SCROLL_STEP: "12" }).settings.scrollStep, 12);
	assert.equal(step(withStep(5), { PI_OPENUI_SCROLL_STEP: "12" }).sources.scrollStep, "env");
	const bad = step(withStep(5), { PI_OPENUI_SCROLL_STEP: "wide" });
	assert.equal(bad.settings.scrollStep, 5);
	assert.equal(bad.problems.length, 1);
	assert.equal(step({}, { PI_OPENUI_SCROLL_STEP: "1e9" }).settings.scrollStep, 40);
});

test("saving one setting keeps the other, and an emptied section is not left behind", () => {
	const dir = mkdtempSync(join(tmpdir(), "openui-cfg-"));
	const file = join(dir, "openui.json");
	saveSetting(file, "table.minColumnWidth", 14);
	saveSetting(file, "scroll.step", 6);
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { table: { minColumnWidth: 14 }, scroll: { step: 6 } });
	saveSetting(file, "scroll.step", undefined);
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { table: { minColumnWidth: 14 } });
});

test("/openui-config: set, reset and refuse scroll.step; reset alone resets everything; the list names both", () => {
	const dir = mkdtempSync(join(tmpdir(), "openui-cmd-"));
	const env = { PI_CODING_AGENT_DIR: dir };
	const file = join(dir, "openui.json");
	const shown = runConfigCommand("", env);
	assert.ok(shown.message.includes("scroll.step = 8") && shown.message.includes("table.minColumnWidth = 12"), shown.message);
	const set = runConfigCommand("scroll.step 5", env);
	assert.equal(set.settings?.scrollStep, 5);
	assert.equal(set.settings?.tableMinCol, 12);
	runConfigCommand("table.minColumnWidth 14", env);
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { scroll: { step: 5 }, table: { minColumnWidth: 14 } });
	for (const bad of ["scroll.step 0", "scroll.step 41", "scroll.step abc", "scroll.step"]) {
		const r = runConfigCommand(bad, env);
		assert.equal(r.level, "error", bad);
		assert.match(r.message, /1.*40/, bad);
	}
	assert.equal(runConfigCommand("scroll.step reset", env).settings?.scrollStep, 8);
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { table: { minColumnWidth: 14 } }, "only that one setting went");
	runConfigCommand("scroll.step 7", env);
	const all = runConfigCommand("reset", env);
	assert.equal(all.settings?.scrollStep, 8);
	assert.equal(all.settings?.tableMinCol, 12);
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {});
	const unknown = runConfigCommand("scrol.step 3", env);
	assert.equal(unknown.level, "error");
	assert.ok(unknown.message.includes("scroll.step") && unknown.message.includes("table.minColumnWidth"), unknown.message);
});

test("the environment still wins over a saved scroll.step, and the person is told", () => {
	const dir = mkdtempSync(join(tmpdir(), "openui-cmd-"));
	const r = runConfigCommand("scroll.step 5", { PI_CODING_AGENT_DIR: dir, PI_OPENUI_SCROLL_STEP: "20" });
	assert.equal(r.level, "warning");
	assert.equal(r.settings?.scrollStep, 20);
});
