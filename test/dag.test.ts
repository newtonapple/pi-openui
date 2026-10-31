import assert from "node:assert/strict";
import { test } from "node:test";
import { dag } from "../src/diagram/dag.ts";
import { decodeDirected } from "../src/diagram/decode.ts";
import { erd } from "../src/diagram/erd.ts";
import { infra } from "../src/diagram/infra.ts";
import { tuning } from "../src/diagram/router.ts";
import { toLines } from "../src/diagram/render.ts";
import { N, roundTrip, rng, checkStructure } from "./helpers.ts";

const plain = (res: ReturnType<typeof dag>) => toLines(res, { legend: false }).join("\n");

test("empty graph does not throw", () => {
	const res = dag([], []);
	assert.equal(res.nodes.length, 0);
	assert.equal(res.width, 0);
	assert.ok(res.warnings.length > 0);
});

test("garbage input does not throw", () => {
	for (const bad of [undefined, null, 5, "x", {}, [null], [1, 2], [{}]]) {
		assert.doesNotThrow(() => dag(bad, bad));
	}
});

test("single node and isolated nodes", () => {
	roundTrip([N("a", "Alpha")], []);
	roundTrip([N("a"), N("b"), N("c")], []);
});

test("chain, diamond, skip edge, both directions", () => {
	for (const direction of ["LR", "TB", null] as const) {
		roundTrip([N("a"), N("b"), N("c"), N("d")], [["a", "b"], ["b", "c"], ["c", "d"]], { direction });
		roundTrip([N("a"), N("b"), N("c"), N("d")], [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]], { direction });
		roundTrip([N("a"), N("b"), N("c")], [["a", "b"], ["b", "c"], ["a", "c"]], { direction });
	}
});

test("long skip edge across four layers", () => {
	roundTrip(
		[N("a"), N("b"), N("c"), N("d"), N("e")],
		[["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["a", "e"], ["b", "e"]],
		{ direction: "TB" },
	);
});

test("fan-out and fan-in of 8", () => {
	const ids = Array.from({ length: 8 }, (_, i) => `m${i}`);
	const nodes = [N("src"), ...ids.map((i) => N(i)), N("sink")];
	const edges = [...ids.map((i) => ["src", i]), ...ids.map((i) => [i, "sink"])];
	for (const direction of ["LR", "TB"] as const) roundTrip(nodes, edges, { direction, maxWidth: 200 });
});

test("complete bipartite K3,3", () => {
	const l = ["a", "b", "c"];
	const r = ["x", "y", "z"];
	roundTrip([...l, ...r].map((i) => N(i)), l.flatMap((a) => r.map((b) => [a, b])), { direction: "TB" });
});

test("cycles: 2-cycle, 3-cycle, self loop", () => {
	const two = roundTrip([N("x"), N("y")], [["x", "y"], ["y", "x"]]);
	assert.equal(two.edges.length, 2);
	roundTrip([N("x"), N("y"), N("z")], [["x", "y"], ["y", "z"], ["z", "x"]], { direction: "TB" });
	const loop = dag([N("x"), N("y")], [["x", "y"], ["y", "y"]]);
	assert.ok(plain(loop).includes("∞"), "self loop marker");
	assert.ok(loop.warnings.some((w) => w.includes("self loop")));
});

test("duplicates and unknown ids are reported, not drawn", () => {
	const res = dag([N("a"), N("a"), N("b")], [["a", "b"], ["a", "b"], ["a", "nope"], ["ghost", "b"], "bad"]);
	assert.equal(res.nodes.length, 2);
	assert.equal(res.edges.length, 1);
	assert.ok(res.warnings.length >= 4);
});

test("statuses: icons, dashed skipped box, legend", () => {
	const res = dag(
		[N("a", "Build", "done"), N("b", "Test", "failed"), N("c", "Ship", "skipped"), N("d", "Wait", "pending"), N("e", "Go", "running")],
		[["a", "b"], ["b", "c"], ["a", "d"], ["a", "e"]],
	);
	const text = toLines(res).join("\n");
	for (const g of ["✓", "✗", "⊘", "○", "◔", "╌", "done", "skipped"]) assert.ok(text.includes(g), `has ${g}`);
	assert.deepEqual(res.statuses, ["done", "running", "failed", "pending", "skipped"]);
	roundTrip([N("a", "Build", "done"), N("b", "Test", "failed")], [["a", "b"]]);
});

test("wide characters in labels keep the grid aligned", () => {
	const res = roundTrip([N("a", "数据 ingest"), N("b", "清洗 🧹 clean"), N("c", "索引")], [["a", "b"], ["b", "c"]], { direction: "TB" });
	assert.ok(res.width > 0);
});

test("empty and multi-line labels", () => {
	roundTrip([N("a", ""), N("b", "line one\nline two")], [["a", "b"]]);
});

test("auto direction: LR when it fits, TB when it does not", () => {
	const nodes = ["a", "b", "c", "d", "e"].map((i) => N(i, `Step number ${i}`));
	const edges = [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"]];
	assert.equal(roundTrip(nodes, edges, { maxWidth: 200 }).direction, "LR");
	const narrow = roundTrip(nodes, edges, { maxWidth: 40 });
	assert.ok(narrow.width <= 40 || narrow.overflow);
});

test("long labels shrink to fit before giving up", () => {
	const long = "x".repeat(60);
	const res = roundTrip([N("a", long), N("b", long)], [["a", "b"]], { maxWidth: 40 });
	assert.ok(res.width <= 40, `width ${res.width}`);
	assert.ok(plain(res).includes("…"));
});

test("overflow is reported instead of lying", () => {
	const ids = Array.from({ length: 12 }, (_, i) => `n${i}`);
	const res = dag(ids.map((i) => N(i)), ids.slice(1).map((i) => ["n0", i]), { maxWidth: 30, direction: "TB" });
	assert.ok(res.width > 30 ? res.overflow : true);
	checkStructure(res);
});

test("two components side by side", () => {
	roundTrip([N("a"), N("b"), N("c"), N("d")], [["a", "b"], ["c", "d"]]);
});

test("fuzz: random graphs decode back to their edges", () => {
	const stats = { n: 0, degraded: 0, overflow: 0, maxMs: 0 };
	for (let seed = 1; seed <= 250; seed++) {
		const r = rng(seed);
		const n = 1 + Math.floor(r() * 18);
		const density = 0.05 + r() * 0.35;
		const nodes = Array.from({ length: n }, (_, i) => N(`n${i}`, `Node ${i}${r() < 0.3 ? " with a longer label" : ""}`, r() < 0.3 ? ["done", "running", "failed", "pending", "skipped"][Math.floor(r() * 5)] : undefined));
		const edges: string[][] = [];
		const cyclic = r() < 0.3;
		for (let i = 0; i < n; i++)
			for (let j = 0; j < n; j++) {
				if (i === j) continue;
				if (!cyclic && j < i) continue;
				if (r() < density / (cyclic ? 2 : 1) * (n > 12 ? 0.5 : 1)) edges.push([`n${i}`, `n${j}`]);
			}
		const direction = r() < 0.4 ? "LR" : r() < 0.7 ? "TB" : null;
		const t0 = Date.now();
		let res;
		try {
			res = roundTrip(nodes, edges, { direction, maxWidth: 120 });
		} catch (e) {
			console.log(`seed ${seed} n=${n} e=${edges.length} dir=${direction}`);
			throw e;
		}
		stats.n++;
		stats.maxMs = Math.max(stats.maxMs, Date.now() - t0);
		if (res.degraded) stats.degraded++;
		if (res.overflow) stats.overflow++;
	}
	console.log("fuzz stats", stats);
	assert.ok(stats.degraded <= stats.n * 0.02, `too many degraded layouts: ${stats.degraded}`);
});

test("large graphs route completely, decode exactly and stay fast", () => {
	// well beyond the validation limits, on a 1000-column grid: with the widget's work budget lifted, routing must still be complete
	const saved = tuning.budget;
	tuning.budget = Infinity;
	try {
	for (const [n, m, direction] of [[60, 90, "TB"], [100, 160, "TB"], [150, 240, "LR"]] as const) {
		const r = rng(n * 31 + m);
		const nodes = Array.from({ length: n }, (_, i) => N(`n${i}`, `Task ${i}`));
		const edges: string[][] = [];
		while (edges.length < m) {
			const a = Math.floor(r() * n);
			const b = Math.floor(r() * n);
			if (a < b) edges.push([`n${a}`, `n${b}`]);
		}
		const t0 = Date.now();
		const res = roundTrip(nodes, edges, { direction, maxWidth: 1000 });
		const ms = Date.now() - t0;
		assert.equal(res.omitted?.length ?? 0, 0, `${n} nodes: nothing omitted`);
		assert.ok(ms < 8000, `${n} nodes took ${ms} ms`);
	}
	} finally {
		tuning.budget = saved;
	}
});

test("the work budget is shared by all edges of a diagram: when it runs out the rest are declared, never drawn ambiguously", () => {
	const saved = tuning.budget;
	try {
		const r = rng(77);
		const nodes = Array.from({ length: 40 }, (_, i) => N(`n${i}`, `Task ${i}`));
		const edges: string[][] = [];
		const seen = new Set<string>();
		while (edges.length < 80) {
			const a = Math.floor(r() * 40);
			const b = Math.floor(r() * 40);
			if (a < b && !seen.has(`${a}>${b}`)) {
				seen.add(`${a}>${b}`);
				edges.push([`n${a}`, `n${b}`]);
			}
		}
		tuning.budget = Infinity;
		const full = dag(nodes, edges, { direction: "TB", maxWidth: 1000 });
		assert.equal(full.omitted?.length ?? 0, 0, "with no limit every edge routes");
		tuning.budget = 2_000; // far too little
		const t0 = Date.now();
		const res = dag(nodes, edges, { direction: "TB", maxWidth: 1000 });
		const ms = Date.now() - t0;
		assert.ok((res.omitted?.length ?? 0) > 0, "some edges are not routed");
		assert.equal(res.degraded, true);
		assert.ok(res.warnings.some((w) => w.includes("could not be routed")), "and the diagram says so");
		const dec = decodeDirected(res);
		assert.deepEqual(dec.problems, [], "no wire fragments are left behind");
		assert.equal(dec.edges.size + (res.omitted?.length ?? 0), edges.length, "every edge is either drawn exactly or listed");
		assert.ok(ms < 1500, `a spent budget ends the work quickly (${ms} ms)`);
	} finally {
		tuning.budget = saved;
	}
});

test("an unroutable edge is declared, never drawn ambiguously", () => {
	tuning.guardScale = 0; // every route search fails immediately
	try {
		const nodes = [N("a"), N("b"), N("c")];
		const edges = [["a", "b"], ["b", "c"], ["a", "c"]];
		const res = dag(nodes, edges, { direction: "TB" });
		assert.equal(res.omitted?.length, 3);
		assert.equal(res.degraded, true);
		const text = toLines(res).join("\n");
		assert.ok(text.includes("a -> b (not drawn)") && text.includes("a -> c (not drawn)"), text);
		assert.deepEqual(decodeDirected(res).problems, [], "no wire fragments left behind");
		assert.equal(decodeDirected(res).edges.size, 0);
		assert.ok(res.warnings.some((w) => w.includes("could not be routed")));
		// ERD and InfraMap follow the same contract
		const e = erd([{ name: "x", fields: ["id int"] }, { name: "y", fields: ["id int"] }], [{ from: "x", to: "y" }]);
		assert.equal(e.omitted?.length, 1);
		const i = infra([{ name: "Z", nodes: [{ id: "p" }, { id: "q" }] }], [{ from: "p", to: "q", label: "hi" }]);
		assert.equal(i.omitted?.length, 1);
		assert.ok(toLines(i).join("\n").includes("p -> q (hi) (not drawn)"));
	} finally {
		tuning.guardScale = 8;
	}
});
