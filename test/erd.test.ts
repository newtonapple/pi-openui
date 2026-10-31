import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeRelations } from "../src/diagram/decode.ts";
import { erd } from "../src/diagram/erd.ts";
import { toLines } from "../src/diagram/render.ts";
import { erdRoundTrip, rng } from "./helpers.ts";

const E = (name: string, fields: string[] = []) => ({ name, fields });

test("empty and garbage input do not throw", () => {
	assert.equal(erd([], []).nodes.length, 0);
	for (const bad of [undefined, null, 3, {}, [null], [{}]]) assert.doesNotThrow(() => erd(bad, bad));
});

test("one table, no relations; table without fields", () => {
	erdRoundTrip([E("users", ["id uuid PK"])], []);
	erdRoundTrip([E("empty")], []);
});

test("job queue schema (labels, 1:N)", () => {
	const res = erdRoundTrip(
		[E("users", ["id uuid PK", "email text UNIQUE", "created_at timestamptz"]), E("projects", ["id uuid PK", "owner_id uuid FK", "name text"]), E("jobs", ["id uuid PK", "project_id uuid FK", "status text"])],
		[{ from: "users", to: "projects", kind: "1:N", label: "owns" }, { from: "projects", to: "jobs", kind: "1:N", label: "runs" }],
	);
	const text = toLines(res).join("\n");
	assert.ok(text.includes("owns") && text.includes("runs"), "labels visible");
	assert.ok(text.includes("├") && text.includes("PK"));
});

test("all four relation kinds, both directions", () => {
	const ents = [E("a", ["id int PK"]), E("b", ["id int PK"]), E("c", ["id int PK"]), E("d", ["id int PK"]), E("e", ["id int PK"])];
	const rels = [{ from: "a", to: "b", kind: "1:1" }, { from: "a", to: "c", kind: "N:M", label: "member of" }, { from: "d", to: "e", kind: "N:1" }, { from: "c", to: "d", kind: "1:N" }];
	for (const direction of ["LR", "TB", null] as const) erdRoundTrip(ents, rels, { direction, maxWidth: 160 });
});

test("two relations between the same tables are both kept", () => {
	const res = erdRoundTrip([E("users", ["id int PK"]), E("messages", ["id int PK", "sender int FK", "receiver int FK"])], [{ from: "users", to: "messages", label: "sent" }, { from: "users", to: "messages", label: "received" }], { maxWidth: 140 });
	assert.equal(res.edges.length, 2);
});

test("cycle between tables and self reference", () => {
	erdRoundTrip([E("a", ["id int PK"]), E("b", ["id int PK"]), E("c", ["id int PK"])], [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }], { maxWidth: 140 });
	const self = erd([E("emp", ["id int PK", "boss int FK"])], [{ from: "emp", to: "emp" }]);
	assert.ok(toLines(self).join("\n").includes("∞"));
});

test("unknown entity and unknown kind are reported", () => {
	const res = erd([E("a", ["id int"]), E("b", ["id int"])], [{ from: "a", to: "zzz" }, { from: "a", to: "b", kind: "weird" }]);
	assert.equal(res.edges.length, 1);
	assert.ok(res.warnings.length >= 2);
});

test("fuzz: random schemas decode back to their relations", () => {
	let degraded = 0;
	let n = 0;
	for (let seed = 1; seed <= 150; seed++) {
		const r = rng(seed * 7919);
		const count = 1 + Math.floor(r() * 9);
		const ents = Array.from({ length: count }, (_, i) =>
			E(`t${i}`, Array.from({ length: Math.floor(r() * 6) }, (_, k) => `col${k} ${["int", "text", "uuid", "timestamptz"][Math.floor(r() * 4)]}${r() < 0.3 ? " PK" : ""}${r() < 0.2 ? " FK" : ""}`)),
		);
		const rels: Array<{ from: string; to: string; kind: string; label?: string }> = [];
		const m = Math.floor(r() * count * 1.6);
		for (let k = 0; k < m; k++) {
			const a = Math.floor(r() * count);
			const b = Math.floor(r() * count);
			if (a === b) continue;
			rels.push({ from: `t${a}`, to: `t${b}`, kind: ["1:1", "1:N", "N:1", "N:M"][Math.floor(r() * 4)], ...(r() < 0.4 ? { label: ["owns", "has", "member of", "refs"][Math.floor(r() * 4)] } : {}) });
		}
		const direction = r() < 0.4 ? "LR" : r() < 0.7 ? "TB" : null;
		let res;
		try {
			res = erdRoundTrip(ents, rels, { direction, maxWidth: 150 });
		} catch (e) {
			console.log(`seed ${seed} count=${count} rels=${rels.length} dir=${direction}`);
			throw e;
		}
		n++;
		if (res.degraded) degraded++;
	}
	console.log("erd fuzz", { n, degraded });
	assert.ok(degraded <= n * 0.03, `degraded ${degraded}`);
});

test("a large schema (30 tables, 45 relations) routes completely", () => {
	const r = rng(4242);
	const ents = Array.from({ length: 30 }, (_, i) => E(`t${i}`, ["id int PK", "name text", "ref int FK"]));
	const rels: Array<{ from: string; to: string; kind: string }> = [];
	while (rels.length < 45) {
		const a = Math.floor(r() * 30);
		const b = Math.floor(r() * 30);
		if (a !== b) rels.push({ from: `t${a}`, to: `t${b}`, kind: ["1:1", "1:N", "N:1", "N:M"][Math.floor(r() * 4)] });
	}
	const t0 = Date.now();
	const res = erdRoundTrip(ents, rels, { maxWidth: 1000, direction: "LR" });
	assert.ok(Date.now() - t0 < 8000);
	assert.equal(res.omitted?.length ?? 0, 0);
});

test("relation ends are one cell each: a bar fused with the wire for one, a crow's foot facing the box for many", () => {
	const ents = [E("users", ["id int PK"]), E("projects", ["id int PK"]), E("tags", ["id int PK"])];
	const rels = [{ from: "users", to: "projects", kind: "1:N", label: "owns" }, { from: "projects", to: "tags", kind: "N:M" }];
	const lr = erdRoundTrip(ents, rels, { direction: "LR", maxWidth: 140 });
	const flat = (r: typeof lr) => r.rows.map((row) => row.map((c) => c.ch).join("")).join("\n");
	const text = flat(lr);
	assert.ok(!/[╱╲]/.test(text), "no three-row diagonal feet any more");
	assert.ok(text.includes("├─owns─<│") || /├[─a-z ]*<│/.test(text), `one then many on one line:\n${text}`);
	assert.ok(text.includes(">") && text.includes("<"), "many ends face their boxes");
	// every relation takes exactly one text row between the two boxes: the diagram is no taller than the tallest box
	const tallest = Math.max(...lr.nodes.map((n) => n.rect.h));
	assert.equal(lr.height, tallest, "wires add no rows");
	const tb = erdRoundTrip(ents, rels, { direction: "TB", maxWidth: 140 });
	const t2 = flat(tb);
	assert.ok(/┴/.test(t2) || /┬/.test(t2), "vertical bars are ┴ or ┬");
	assert.ok(/Λ/.test(t2) || /V/.test(t2), `vertical many ends are Λ or V:\n${t2}`);
	assert.ok(!/[╱╲]/.test(t2));
});

test("a mark that faces the wrong way is rejected by the oracle (so the glyph test above can fail)", () => {
	const ents = [E("a", ["id int"]), E("b", ["id int"])];
	const res = erd(ents, [{ from: "a", to: "b", kind: "1:N" }], { direction: "LR" });
	// flip the many mark from '<' to '>' and decode: it no longer reads as a valid end
	// (cells are shared and frozen: put a different cell in the row)
	for (const row of res.rows) row.forEach((c, i) => (c.role === "mark" && c.ch === "<" ? (row[i] = { ch: ">", role: c.role }) : 0));
	const dec = decodeRelations(res);
	assert.ok(dec.problems.length > 0, "decoder notices the flipped foot");
});
