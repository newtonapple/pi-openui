// The language never breaks a source that was written for an earlier version of it. test/compat/signatures.json is every
// component and argument the language has ever had, in order. A change that breaks a stored source (an argument inserted,
// moved, removed or made required; a smaller set of choices; a lower limit) fails here, and so does forgetting to record an
// addition. Adding at the END, optional, is the one safe way to grow a component. See "Language changes are additive" in AGENTS.md.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { LIMITS, SPECS, type CompSpec } from "../src/lang/library.ts";
import { compatible, mergeSnapshot, snapshotOf, signatureProblems, type Snapshot } from "./compat/signatures-lib.ts";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "compat", "signatures.json");
const current = () => snapshotOf(SPECS, LIMITS);

test("signatures.json exists, and today's language is compatible with it", () => {
	assert.ok(existsSync(FILE), "test/compat/signatures.json: run node scripts/freeze-signatures.ts");
	const frozen: Snapshot = JSON.parse(readFileSync(FILE, "utf8"));
	assert.deepEqual(signatureProblems(frozen, current()), []);
});

test("signatures.json has caught up with the language: every new component and argument is recorded", () => {
	const frozen: Snapshot = JSON.parse(readFileSync(FILE, "utf8"));
	assert.deepEqual(mergeSnapshot(frozen, current()), frozen, "run node scripts/freeze-signatures.ts and commit the change to signatures.json");
});

test("Table's pin is recorded as the 4th, optional argument", () => {
	const frozen: Snapshot = JSON.parse(readFileSync(FILE, "utf8"));
	assert.deepEqual(frozen.components.Table.params.map((p) => `${p.name}${p.opt ? "?" : ""}`), ["columns", "rows", "tooltips?", "pin?"]);
});

// ---- the guard itself: each breaking change must be reported, each safe one must not

const spec = (name: string, params: Array<[string, CompSpec["params"][number]["t"], boolean?]>): CompSpec => ({ name, desc: "", params: params.map(([n, t, opt]) => ({ name: n, t, opt })) });
const base = () => snapshotOf([spec("Thing", [["a", "string"], ["b", "number", true]]), spec("Other", [["x", "string"]])], { items: 10 });
const check = (specs: CompSpec[], limits: Record<string, number> = { items: 10 }) => signatureProblems(base(), snapshotOf(specs, limits));

test("an argument added at the end, optional, is fine; so is a new component and a higher limit", () => {
	assert.deepEqual(check([spec("Thing", [["a", "string"], ["b", "number", true], ["c", "string", true]]), spec("Other", [["x", "string"]]), spec("Brand", [["q", "string"]])], { items: 20, more: 3 }), []);
});

test("an argument inserted before another is reported (it would shift every source that uses the later ones)", () => {
	const p = check([spec("Thing", [["a", "string"], ["new", "string", true], ["b", "number", true]]), spec("Other", [["x", "string"]])]);
	assert.ok(p.some((m) => m.includes("Thing") && m.includes("argument 2")), p.join("|"));
});

test("an argument removed, renamed or moved is reported", () => {
	assert.ok(check([spec("Thing", [["a", "string"]]), spec("Other", [["x", "string"]])]).some((m) => m.includes("Thing")), "removed");
	assert.ok(check([spec("Thing", [["a", "string"], ["renamed", "number", true]]), spec("Other", [["x", "string"]])]).length > 0, "renamed");
	assert.ok(check([spec("Thing", [["b", "number", true], ["a", "string"]]), spec("Other", [["x", "string"]])]).length > 0, "moved");
});

test("a component removed is reported", () => {
	assert.ok(check([spec("Thing", [["a", "string"], ["b", "number", true]])]).some((m) => m.includes("Other")));
});

test("an optional argument made required, or a new one added that is required, is reported", () => {
	assert.ok(check([spec("Thing", [["a", "string"], ["b", "number"]]), spec("Other", [["x", "string"]])]).some((m) => m.includes("required")));
	assert.ok(check([spec("Thing", [["a", "string"], ["b", "number", true], ["c", "string"]]), spec("Other", [["x", "string"]])]).some((m) => m.includes("required")));
});

test("a required argument made optional is fine: nothing that was written breaks", () => {
	assert.deepEqual(check([spec("Thing", [["a", "string", true], ["b", "number", true]]), spec("Other", [["x", "string"]])]), []);
});

test("a type that stops accepting what it accepted is reported; one that accepts more is fine", () => {
	const one = (t: CompSpec["params"][number]["t"]) => snapshotOf([spec("Thing", [["a", t]])], {});
	assert.ok(signatureProblems(one({ enum: ["one", "two", "three"] }), one({ enum: ["one", "two"] })).some((m) => m.includes("Thing")), "a value removed from a choice");
	assert.deepEqual(signatureProblems(one({ enum: ["one"] }), one({ enum: ["one", "two"] })), [], "a value added to a choice");
	assert.ok(signatureProblems(one("string"), one("number")).length > 0, "a string argument became a number");
	assert.deepEqual(signatureProblems(one("string"), one("cell")), [], "a string argument widened to string | number");
	assert.ok(signatureProblems(one("cell"), one("string")).length > 0, "and not the other way");
	assert.ok(signatureProblems(one({ comp: ["A", "B"] }), one({ comp: ["A"] })).length > 0, "a component removed from the ones allowed");
	assert.deepEqual(signatureProblems(one({ comp: ["A"] }), one({ comp: ["A", "B"] })), []);
});

test("a list that allows fewer items than it did is reported; one that allows more is fine", () => {
	const lst = (max: number) => snapshotOf([spec("Thing", [["a", { arr: "string", max }]])], {});
	assert.ok(signatureProblems(lst(10), lst(5)).length > 0);
	assert.deepEqual(signatureProblems(lst(10), lst(20)), []);
});

test("a limit that went down is reported; one that went up is fine", () => {
	assert.ok(check([spec("Thing", [["a", "string"], ["b", "number", true]]), spec("Other", [["x", "string"]])], { items: 5 }).some((m) => m.includes("items")));
});

test("freezing only ever adds: new components, new trailing arguments, the highest limit seen", () => {
	const frozen = base();
	const grown = snapshotOf([spec("Thing", [["a", "string"], ["b", "number", true], ["c", "string", true]]), spec("Other", [["x", "string"]]), spec("Brand", [["q", "string"]])], { items: 20 });
	const merged = mergeSnapshot(frozen, grown);
	assert.deepEqual(merged.components.Thing.params.map((p) => p.name), ["a", "b", "c"]);
	assert.ok("Brand" in merged.components);
	assert.equal(merged.limits.items, 20);
	const lowered = mergeSnapshot(merged, snapshotOf([spec("Thing", [["a", "string"], ["b", "number", true], ["c", "string", true]])], { items: 5 }));
	assert.equal(lowered.limits.items, 20, "a limit never goes back down in the record");
	assert.ok(compatible("string", "cell") && !compatible("cell", "string"));
});
