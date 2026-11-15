// Table(columns, rows, tooltips?, pin?): the model says which columns stay in place while a wide table scrolls.
// `pin` is the 4th argument, after tooltips: an argument added to a component goes at the END and is optional, so every
// source written before it compiles as it did.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, LIMITS, reference, SPECS } from "../src/lang/library.ts";

const T = (rest: string) => `root = Stack([t])\nt = Table(["Host", "OS", "State"], [["a", "x", "up"]]${rest})`;
const table = (src: string, opts = {}) => {
	const c = compile(src, opts);
	assert.deepEqual(c.errors, [], c.errors.join(" | "));
	return (c.root!.props.children[0] as any).props;
};

test("pin is the last, optional argument of Table, after tooltips", () => {
	const names = SPECS.find((s) => s.name === "Table")!.params.map((x) => `${x.name}${x.opt ? "?" : ""}`);
	assert.deepEqual(names, ["columns", "rows", "tooltips?", "pin?"]);
});

test("a Table written before pin existed compiles as it did, with no pin", () => {
	assert.equal(table(T("")).pin, undefined);
	assert.equal(table(T(', [tip]') + '\ntip = Tooltip("row:1", "hi")').pin, undefined);
});

test("pin names columns by their header, and null skips the tooltips", () => {
	assert.deepEqual(table(T(', null, ["Host", "State"]')).pin, ["Host", "State"]);
	assert.deepEqual(table(T(', [tip], ["OS"]') + '\ntip = Tooltip("row:1", "hi")').pin, ["OS"]);
});

test("an empty pin means pin nothing, which is different from leaving it out", () => {
	assert.deepEqual(table(T(", null, []")).pin, []);
});

test("a pin that is not a column is an error with the line and the columns to choose from", () => {
	const c = compile(T(', null, ["Hots"]'));
	assert.equal(c.ok, false);
	assert.match(c.errors[0], /^line 2: Table: pin "Hots" is not a column\. Columns: Host, OS, State/);
});

test("the same column twice is an error", () => {
	const c = compile(T(', null, ["OS", "OS"]'));
	assert.equal(c.ok, false);
	assert.match(c.errors.join(" "), /pin lists "OS" twice/);
});

test("pin must be an array of strings, and says so", () => {
	assert.match(compile(T(', null, "Host"')).errors.join(" "), /pin.*expects an array/);
	assert.match(compile(T(", null, [1]")).errors.join(" "), /pin.*expects a string/);
});

test("header spacing is not a difference: pin matches the header the way the table draws it", () => {
	const src = `root = Stack([t])\nt = Table(["  Remote   IP "], [["1"]], null, ["Remote IP"])`;
	assert.deepEqual(compile(src).errors, []);
});

test("pin has a limit, like every list", () => {
	const names = Array.from({ length: LIMITS.tableCols + 1 }, (_, i) => `c${i}`);
	const c = compile(`root = Stack([t])\nt = Table(${JSON.stringify(names)}, [${JSON.stringify(names)}], null, ${JSON.stringify(names)})`);
	assert.ok(c.errors.some((e) => e.includes(`at most ${LIMITS.tableCols}`)));
});

test("restoring an older widget is lenient: a pin that matches nothing is dropped with a note, not an error", () => {
	const c = compile(T(', null, ["Gone", "Host", "Host"]'), { mode: "restore" });
	assert.deepEqual(c.errors, []);
	assert.deepEqual((c.root!.props.children[0] as any).props.pin, ["Host"]);
	assert.equal(c.notes.length, 2, c.notes.join("|"));
	assert.ok(c.notes.some((n) => n.includes('"Gone"')) && c.notes.some((n) => n.includes("twice")));
});

test("the model is told: the reference describes pin, and no longer says tooltips is the last argument of Table", () => {
	const ref = reference();
	assert.match(ref, /Table\(columns: string\[\], rows: .*tooltips\?: Tooltip\[\], pin\?: string\[\]\)/);
	assert.ok(!/LAST argument of [^.]*\bTable\b/.test(ref), "tooltips is no longer last on Table");
	assert.match(ref, /pin/);
	assert.match(ref, /half|50%/i, "the 50% rule is in the reference");
	assert.match(ref, /pins nothing unless you ask/, "the model is told the default is no pin");
	assert.ok(!/keeps its first column in place/.test(ref), "and nothing says the first column is pinned for it");
	assert.match(ref, /keep table cells short/, "and that a squeezed table cuts long cells");
});
