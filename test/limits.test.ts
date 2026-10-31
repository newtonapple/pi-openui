// Size limits. A model can write far more than a terminal can show, and every widget is drawn again whenever pi redraws, so
// each limit is a validation error (with the number in it) and compile() cannot throw, hang or build something huge.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, LIMITS, reference } from "../src/lang/library.ts";

const R = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));
const q = JSON.stringify;
const root = (body: string) => `root = Stack([x])\n${body}`;

/** [name, the number that is allowed, a program with n of the thing, a piece of the error when it is n + 1] */
const CASES: Array<[string, number, (n: number) => string, string]> = [
	["Table rows", LIMITS.tableRows, (n) => root(`x = Table(["a"], [${R(n, () => '["v"]').join(",")}])`), `at most ${LIMITS.tableRows}`],
	["Table columns", LIMITS.tableCols, (n) => root(`x = Table(${q(R(n, (i) => "c" + i))}, [${q(R(n, () => "v"))}])`), `at most ${LIMITS.tableCols}`],
	["BarChart bars", LIMITS.bars, (n) => root(`x = BarChart(${q(R(n, (i) => "b" + i))}, ${q(R(n, (i) => i))})`), `at most ${LIMITS.bars}`],
	["LineChart points", LIMITS.points, (n) => root(`x = LineChart(${q(R(n, (i) => "p" + i))}, [s])\ns = Series("a", ${q(R(n, (i) => i))})`), `at most ${LIMITS.points}`],
	["LineChart series", LIMITS.series, (n) => root(`x = LineChart(["a", "b"], [${R(n, (i) => "s" + i).join(",")}])\n${R(n, (i) => `s${i} = Series("s${i}", [1, 2])`).join("\n")}`), `at most ${LIMITS.series}`],
	["RadarChart axes", LIMITS.axes, (n) => root(`x = RadarChart(${q(R(n, (i) => "a" + i))}, [s])\ns = Series("s", ${q(R(n, () => 1))})`), `at most ${LIMITS.axes}`],
	["Dag nodes", LIMITS.dagNodes, (n) => root(`x = Dag([${R(n, (i) => "n" + i).join(",")}], [])\n${R(n, (i) => `n${i} = DagNode("n${i}", "N")`).join("\n")}`), `at most ${LIMITS.dagNodes}`],
	["Dag edges", LIMITS.dagEdges, (n) => root(`x = Dag([a, b], ${q(R(n, () => ["a", "b"]))})\na = DagNode("a", "A")\nb = DagNode("b", "B")`), `at most ${LIMITS.dagEdges}`],
	["Erd entities", LIMITS.entities, (n) => root(`x = Erd([${R(n, (i) => "e" + i).join(",")}], [])\n${R(n, (i) => `e${i} = Entity("t${i}", ["id int"])`).join("\n")}`), `at most ${LIMITS.entities}`],
	["Entity fields", LIMITS.fields, (n) => root(`x = Erd([e], [])\ne = Entity("t", ${q(R(n, (i) => `c${i} int`))})`), `at most ${LIMITS.fields}`],
	["Erd relations", LIMITS.relations, (n) => root(`x = Erd([a, b], [${R(n, (i) => "r" + i).join(",")}])\na = Entity("a", ["id int"])\nb = Entity("b", ["id int"])\n${R(n, (i) => `r${i} = Relation("a", "b")`).join("\n")}`), `at most ${LIMITS.relations}`],
	["InfraMap zones", LIMITS.zones, (n) => root(`x = InfraMap([${R(n, (i) => "z" + i).join(",")}], [])\n${R(n, (i) => `z${i} = InfraZone("Z${i}", [n${i}])\nn${i} = InfraNode("n${i}", "N")`).join("\n")}`), `at most ${LIMITS.zones}`],
	["InfraZone nodes", LIMITS.zoneNodes, (n) => root(`x = InfraMap([z], [])\nz = InfraZone("Z", [${R(n, (i) => "n" + i).join(",")}])\n${R(n, (i) => `n${i} = InfraNode("n${i}", "N")`).join("\n")}`), `at most ${LIMITS.zoneNodes}`],
	// three zones of at most 10, 10 and n - 20 nodes: the total is what is limited
	["InfraMap nodes in all", LIMITS.infraNodes, (n) => root(`x = InfraMap([z0, z1, z2], [])\n${R(3, (z) => `z${z} = InfraZone("Z${z}", [${R(z < 2 ? 10 : n - 20, (i) => `n${z}_${i}`).join(",")}])`).join("\n")}\n${R(3, (z) => R(z < 2 ? 10 : n - 20, (i) => `n${z}_${i} = InfraNode("n${z}_${i}", "N")`).join("\n")).join("\n")}`), `the limit is ${LIMITS.infraNodes}`],
	["InfraMap links", LIMITS.infraLinks, (n) => root(`x = InfraMap([z], [${R(n, (i) => "l" + i).join(",")}])\nz = InfraZone("Z", [a, b])\na = InfraNode("a", "A")\nb = InfraNode("b", "B")\n${R(n, (i) => `l${i} = InfraLink("a", "b")`).join("\n")}`), `at most ${LIMITS.infraLinks}`],
	["GeoMap points", LIMITS.geoPoints, (n) => root(`x = GeoMap([${R(n, (i) => "p" + i).join(",")}])\n${R(n, (i) => `p${i} = GeoPoint("P${i}", 1, 1)`).join("\n")}`), `at most ${LIMITS.geoPoints}`],
	["GeoMap links", LIMITS.links, (n) => root(`x = GeoMap([a, b], ${q(R(n, () => ["A", "B"]))})\na = GeoPoint("A", 1, 1)\nb = GeoPoint("B", 2, 2)`), `at most ${LIMITS.links}`],
	["Faq items", LIMITS.faq, (n) => root(`x = Faq([${R(n, (i) => "q" + i).join(",")}])\n${R(n, (i) => `q${i} = FaqItem("Q${i}?", "A")`).join("\n")}`), `at most ${LIMITS.faq}`],
	["Tabs", LIMITS.tabs, (n) => root(`x = Tabs([${R(n, (i) => "i" + i).join(",")}])\nt = Text("x")\n${R(n, (i) => `i${i} = TabItem("T${i}", [t])`).join("\n")}`), `at most ${LIMITS.tabs}`],
	["Stack children", LIMITS.children, (n) => root(`x = Stack([${R(n, () => "t").join(",")}])\nt = Text("x")`), `at most ${LIMITS.children}`],
	["Text characters", LIMITS.text, (n) => root(`x = Text(${q("a".repeat(n))})`), `limit is ${LIMITS.text}`],
	["Markdown characters", LIMITS.markdown, (n) => root(`x = Markdown(${q("a".repeat(n))})`), `limit is ${LIMITS.markdown}`],
	["CodeBlock characters", LIMITS.code, (n) => root(`x = CodeBlock(${q("a".repeat(n))})`), `limit is ${LIMITS.code}`],
	["CodeBlock lines", LIMITS.codeLines, (n) => root(`x = CodeBlock(${q(R(n, () => "x").join("\n"))})`), `more than ${LIMITS.codeLines} lines`],
	["a label", LIMITS.string, (n) => root(`x = Metric(${q("a".repeat(n))}, "1")`), `limit is ${LIMITS.string}`],
	["a table cell", LIMITS.cell, (n) => root(`x = Table(["a"], [[${q("a".repeat(n))}]])`), `limit is ${LIMITS.cell}`],
	["nesting depth", LIMITS.depth, (n) => `root = s0\n${R(n - 1, (i) => `s${i} = Stack([s${i + 1}])`).join("\n")}\ns${n - 1} = Text("x")`, `nested more than ${LIMITS.depth}`],
	// 36 stacks of 40 texts is under the limit; one more stack is over it
	["components in all", 36, (n) => `root = Stack([${R(n, (i) => "s" + i).join(",")}])\nt = Text("x")\n${R(n, (i) => `s${i} = Stack([${R(40, () => "t").join(",")}])`).join("\n")}`, `more than ${LIMITS.elements} components`],
];

for (const [name, max, make, fragment] of CASES) {
	test(`limit: ${name} is allowed up to ${max} and refused above`, () => {
		const ok = compile(make(max));
		assert.deepEqual(ok.errors, [], `${max} ${name} is allowed`);
		assert.ok(ok.ok);
		const over = compile(make(max + 1));
		assert.equal(over.ok, false, `${max + 1} ${name} is refused`);
		assert.ok(over.errors.some((e) => e.includes(fragment)), `the error says what the limit is (${fragment}): ${over.errors.slice(0, 3).join(" | ")}`);
		assert.ok(over.errors.every((e) => e.length < 400), "each error is short enough to read");
	});
}

test("limit: the whole source is capped before it is read at all", () => {
	const big = "root = Stack([t])\nt = Text(" + q("a".repeat(LIMITS.source)) + ")";
	const t0 = performance.now();
	const c = compile(big);
	assert.equal(c.ok, false);
	assert.match(c.errors[0], /the limit is 100 KB/);
	assert.ok(performance.now() - t0 < 50, "refused without tokenizing it");
});

test("compile cannot throw, hang or run out of stack, whatever it is given", () => {
	const bombs: Record<string, string> = {
		"20000 nested arrays": "root = Stack(" + "[".repeat(20000) + "]".repeat(20000) + ")",
		"5000 nested calls": "root = " + "Stack([".repeat(5000) + 'Text("x")' + "])".repeat(5000),
		"3000 levels through variables": `root = s0\n${R(3000, (i) => `s${i} = Stack([s${i + 1}])`).join("\n")}\ns3000 = Text("x")`,
		"a chain of 5000 references": `root = r0\n${R(5000, (i) => `r${i} = r${i + 1}`).join("\n")}\nr5000 = Text("x")`,
		"a cycle": "root = Stack([a])\na = Stack([b])\nb = Stack([a])",
		"10000 statements": "root = Stack([a])\n" + R(10000, (i) => `a = Text("x${i}")`).join("\n"),
		"binary noise": R(4000, (i) => String.fromCharCode((i * 7919) % 255)).join(""),
		"unterminated": 'root = Text("' + "a".repeat(50000),
		"null": null as any,
		"a number": 42 as any,
	};
	for (const [name, src] of Object.entries(bombs)) {
		const t0 = performance.now();
		let c: ReturnType<typeof compile> | undefined;
		assert.doesNotThrow(() => (c = compile(src)), name);
		assert.equal(c!.ok, false, `${name} is refused`);
		assert.ok(c!.errors.length >= 1, `${name} says why`);
		assert.ok(performance.now() - t0 < 1500, `${name} is refused quickly (${Math.round(performance.now() - t0)} ms)`);
	}
});

test("at most 25 errors are reported, then a count of the rest", () => {
	// 80 bad strings, plus the one for having more than 40 children
	const c = compile(`root = Stack([${R(80, (i) => "t" + i).join(",")}])\n${R(80, (i) => `t${i} = Text(1)`).join("\n")}`);
	assert.equal(c.ok, false);
	assert.equal(c.errors.length, LIMITS.errors + 1);
	assert.match(c.errors[c.errors.length - 1], /^\.\.\. and 56 more errors; fix these first$/);
	assert.equal(c.root, undefined);
});

test("the reference tells the model every limit up front", () => {
	const ref = reference();
	assert.ok(ref.includes("## Limits"));
	for (const n of [LIMITS.elements, LIMITS.depth, LIMITS.children, LIMITS.tabs, LIMITS.text, LIMITS.markdown, LIMITS.string, LIMITS.cell, LIMITS.tableRows, LIMITS.tableCols, LIMITS.bars, LIMITS.points, LIMITS.series, LIMITS.axes, LIMITS.dagNodes, LIMITS.dagEdges, LIMITS.entities, LIMITS.fields, LIMITS.relations, LIMITS.infraNodes, LIMITS.infraLinks, LIMITS.geoPoints, LIMITS.links, LIMITS.faq, LIMITS.codeLines, LIMITS.steps, LIMITS.images]) assert.ok(ref.includes(String(n)), `the reference mentions ${n}`);
	assert.ok(ref.includes("100 KB"));
});
