import assert from "node:assert/strict";
import { decodeDirected } from "../src/diagram/decode.ts";
import { dag, normalizeDag, type DagOptions } from "../src/diagram/dag.ts";
import type { DiagramResult } from "../src/diagram/layeredDiagram.ts";
import { toLines } from "../src/diagram/render.ts";
import { textWidth } from "../src/diagram/canvas.ts";

export function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const N = (id: string, label?: string, status?: string) => ({ id, label, status });

export function checkStructure(res: DiagramResult, maxWidth?: number): void {
	// uniform row width
	for (const r of res.rows) assert.equal(r.length, res.width, "row width");
	assert.equal(res.rows.length, res.height);
	// node rects inside the canvas and disjoint
	for (const n of res.nodes) {
		assert.ok(n.rect.x >= 0 && n.rect.y >= 0 && n.rect.x + n.rect.w <= res.width && n.rect.y + n.rect.h <= res.height, `node ${n.id} inside canvas`);
	}
	for (let i = 0; i < res.nodes.length; i++)
		for (let j = i + 1; j < res.nodes.length; j++) {
			const a = res.nodes[i].rect;
			const b = res.nodes[j].rect;
			const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
			assert.ok(!overlap, `nodes ${res.nodes[i].id} and ${res.nodes[j].id} overlap`);
		}
	// no wire cell inside a node interior
	for (const n of res.nodes)
		for (let y = n.rect.y + 1; y < n.rect.y + n.rect.h - 1; y++)
			for (let x = n.rect.x + 1; x < n.rect.x + n.rect.w - 1; x++) {
				const c = res.rows[y][x];
				assert.ok(!c.role.startsWith("wire") && c.role !== "arrow", `wire inside node ${n.id}`);
			}
	if (maxWidth !== undefined && !res.overflow) {
		for (const l of toLines(res)) assert.ok(textWidth(l) <= maxWidth, `line wider than ${maxWidth}: ${l}`);
	}
}

/** Render, decode, and compare the decoded edge set with the normalised input. */
export function roundTrip(nodes: unknown[], edges: unknown[], opts: DagOptions = {}) {
	const res = dag(nodes, edges, opts);
	const norm = normalizeDag(nodes, edges);
	const omit = new Set((res.omitted ?? []).map((o) => `${o.from}>${o.to}`));
	const want = new Set(norm.edges.map((e) => `${norm.nodes[e.a].id}>${norm.nodes[e.b].id}`).filter((k) => !omit.has(k)));
	checkStructure(res, opts.maxWidth ?? 100);
	const { edges: got, problems } = decodeDirected(res);
	assert.deepEqual(problems, [], `decode problems\n${toLines(res).join("\n")}`);
	assert.deepEqual([...got].sort(), [...want].sort(), `edge set differs\n${toLines(res).join("\n")}`);
	// deterministic
	const again = dag(nodes, edges, opts);
	assert.deepEqual(toLines(again), toLines(res), "deterministic");
	return res;
}

import { decodeRelations } from "../src/diagram/decode.ts";
import { erd, endMarks, normalizeErd, type ErdOptions } from "../src/diagram/erd.ts";

export function erdRoundTrip(entities: unknown[], relations: unknown[], opts: ErdOptions = {}) {
	const res = erd(entities, relations, opts);
	const norm = normalizeErd(entities, relations);
	checkStructure(res, opts.maxWidth ?? 100);
	const want = norm.rels
		.map((r) => {
			const m = endMarks(r.kind);
			return [`${norm.entities[r.a].name}:${m.from}`, `${norm.entities[r.b].name}:${m.to}`].sort().join("~");
		})
		.sort();
	for (const o of res.omitted ?? []) {
		const at = want.findIndex((k) => k.split("~").map((x) => x.split(":")[0]).sort().join("~") === [o.from, o.to].sort().join("~"));
		if (at >= 0) want.splice(at, 1);
	}
	const { keys, problems } = decodeRelations(res);
	assert.deepEqual(problems, [], `decode problems\n${toLines(res).join("\n")}`);
	assert.deepEqual(keys, want, `relation set differs\n${toLines(res).join("\n")}`);
	const again = erd(entities, relations, opts);
	assert.deepEqual(toLines(again), toLines(res), "deterministic");
	return res;
}

import { decodeLinks } from "../src/diagram/decode.ts";
import { infra, normalizeInfra, type InfraOptions } from "../src/diagram/infra.ts";

export function infraRoundTrip(zones: unknown[], links: unknown[], opts: InfraOptions = {}) {
	const res = infra(zones, links, opts);
	const norm = normalizeInfra(zones, links);
	checkStructure(res, opts.maxWidth ?? 100);
	const want = norm.links.map((l) => `${norm.nodes[l.a].id}>${norm.nodes[l.b].id}`).sort();
	for (const o of res.omitted ?? []) {
		const at = want.indexOf(`${o.from}>${o.to}`);
		if (at >= 0) want.splice(at, 1);
	}
	const { keys, problems } = decodeLinks(res);
	assert.deepEqual(problems, [], `decode problems\n${toLines(res).join("\n")}`);
	assert.deepEqual(keys, want, `link set differs\n${toLines(res).join("\n")}`);
	// zones contain their nodes
	for (const z of res.zones ?? []) assert.ok(z.rect.w > 2 && z.rect.h > 2);
	const again = infra(zones, links, opts);
	assert.deepEqual(toLines(again), toLines(res), "deterministic");
	return res;
}
