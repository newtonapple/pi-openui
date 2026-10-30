import assert from "node:assert/strict";
import { test } from "node:test";
import { infra } from "../src/diagram/infra.ts";
import { toLines } from "../src/diagram/render.ts";
import { infraRoundTrip, rng } from "./helpers.ts";

const n = (id: string, label?: string, kind?: string, status?: string, detail?: string) => ({ id, label, kind, status, detail });
const L = (from: string, to: string, label?: string, style?: string) => ({ from, to, label, style });

test("empty and garbage input do not throw", () => {
	assert.equal(infra([], []).nodes.length, 0);
	for (const bad of [undefined, null, 4, {}, [null], [{}], [{ name: "z", nodes: 5 }]]) assert.doesNotThrow(() => infra(bad, bad));
});

test("one zone, one node, no links", () => {
	infraRoundTrip([{ name: "Only", nodes: [n("a", "Alpha")] }], []);
});

test("web platform: 4 zones, 11 links, labels, dashed replication", () => {
	const zones = [
		{ name: "Clients", nodes: [n("browsers", "Browsers", "client"), n("mobile", "Mobile app", "client")] },
		{ name: "Edge", nodes: [n("cdn", "CDN", "cloud", "up", "static files"), n("lb", "Load balancer", "gateway", "up", "HTTPS :443")] },
		{ name: "Application", nodes: [n("web", "Web servers", "service", "up", "2 instances"), n("api", "API", "service", "up", "REST"), n("queue", "Message queue", "queue", "up"), n("worker", "Worker", "service", "degraded", "2 of 3 running")] },
		{ name: "Data", nodes: [n("cache", "Redis cache", "database", "up"), n("db-primary", "Postgres primary", "database", "up"), n("db-replica", "Postgres replica", "database", "up", "read only"), n("files", "Object storage", "storage", "up")] },
	];
	const links = [L("browsers", "cdn", "HTTPS"), L("mobile", "lb", "HTTPS"), L("cdn", "lb", "cache miss"), L("lb", "web", "HTTP"), L("web", "api", "REST"), L("api", "queue", "enqueue"), L("queue", "worker", "pull"), L("api", "cache", "get / set"), L("api", "db-primary", "SQL"), L("db-primary", "db-replica", "replicate", "dashed"), L("worker", "files", "uploads")];
	const res = infraRoundTrip(zones, links, { maxWidth: 160 });
	const text = toLines(res).join("\n");
	for (const s of ["Clients", "Application", "HTTPS", "cache miss", "replicate", "2 of 3 running", "up", "degraded"]) assert.ok(text.includes(s), `has ${s}`);
	assert.equal(res.zones?.length, 4);
	assert.deepEqual(res.statuses, ["up", "degraded"]);
	assert.ok(text.includes("┄") || text.includes("┆"), "dashed link");
});

test("TB layout: zones become rows", () => {
	const zones = [
		{ name: "Internet", nodes: [n("inet", "Internet", "cloud")] },
		{ name: "Edge", nodes: [n("fw", "Firewall", "gateway", "up"), n("sw", "Switch", "gateway", "up")] },
		{ name: "Devices", nodes: [n("pc", "Desktop", "client"), n("nas", "NAS", "storage", "down"), n("ph", "Phone", "client", "unknown")] },
	];
	const res = infraRoundTrip(zones, [L("inet", "fw", "WAN"), L("fw", "sw"), L("sw", "pc"), L("sw", "nas", "SMB"), L("sw", "ph", "wifi", "dashed")], { direction: "TB", maxWidth: 120 });
	assert.equal(res.direction, "TB");
});

test("backward links, links within a zone, links that skip a zone", () => {
	const zones = [
		{ name: "A", nodes: [n("a1", "A one"), n("a2", "A two"), n("a3", "A three")] },
		{ name: "B", nodes: [n("b1", "B one"), n("b2", "B two")] },
		{ name: "C", nodes: [n("c1", "C one")] },
	];
	const links = [L("a1", "a3", "skip within"), L("a1", "b1"), L("b2", "a2", "back"), L("a1", "c1", "long"), L("c1", "b2"), L("b1", "b2")];
	for (const direction of ["LR", "TB"] as const) infraRoundTrip(zones, links, { direction, maxWidth: 140 });
});

test("two links between the same pair are both drawn", () => {
	const res = infraRoundTrip([{ name: "Z", nodes: [n("a"), n("b")] }], [L("a", "b", "one"), L("a", "b", "two")]);
	assert.equal(res.edges.length, 2);
});

test("bad references are reported, empty zones skipped", () => {
	const res = infra([{ name: "Z", nodes: [n("a"), n("a"), n("b")] }, { name: "Empty", nodes: [] }], [L("a", "b"), L("a", "ghost"), L("a", "a")]);
	assert.equal(res.nodes.length, 2);
	assert.equal(res.edges.length, 1);
	assert.ok(res.warnings.length >= 4);
});

test("long labels shrink to fit the width", () => {
	const z = [{ name: "Zone with a rather long name", nodes: [n("a", "x".repeat(40), "service", "up", "d".repeat(50))] }, { name: "Two", nodes: [n("b", "y".repeat(40))] }];
	const res = infraRoundTrip(z, [L("a", "b", "z".repeat(40))], { maxWidth: 70 });
	assert.ok(res.width <= 70, `width ${res.width}`);
});

test("fuzz: random maps decode back to their links", () => {
	let n_ = 0;
	let degraded = 0;
	let overflow = 0;
	for (let seed = 1; seed <= 150; seed++) {
		const r = rng(seed * 104729);
		const nz = 1 + Math.floor(r() * 4);
		const zones: Array<{ name: string; tone: string; nodes: ReturnType<typeof n>[] }> = [];
		const ids: string[] = [];
		for (let z = 0; z < nz; z++) {
			const k = 1 + Math.floor(r() * 4);
			const nodes = Array.from({ length: k }, (_, i) => {
				const id = `z${z}n${i}`;
				ids.push(id);
				return n(id, `Node ${z}.${i}`, r() < 0.6 ? ["client", "gateway", "service", "gpu", "database", "storage", "queue", "cloud"][Math.floor(r() * 8)] : undefined, r() < 0.5 ? ["up", "degraded", "down", "unknown"][Math.floor(r() * 4)] : undefined, r() < 0.4 ? "some detail" : undefined);
			});
			zones.push({ name: `Zone ${z}`, tone: ["neutral", "info", "good", "warn", "bad"][Math.floor(r() * 5)], nodes });
		}
		const links: Array<ReturnType<typeof L>> = [];
		const m = Math.floor(r() * ids.length * 1.3);
		for (let i = 0; i < m; i++) {
			const a = ids[Math.floor(r() * ids.length)];
			const b = ids[Math.floor(r() * ids.length)];
			if (a === b) continue;
			links.push(L(a, b, r() < 0.5 ? ["HTTP", "SQL", "gRPC", "replicate"][Math.floor(r() * 4)] : undefined, r() < 0.2 ? "dashed" : undefined));
		}
		const direction = r() < 0.4 ? "LR" : r() < 0.7 ? "TB" : null;
		let res;
		try {
			res = infraRoundTrip(zones, links, { direction, maxWidth: 160 });
		} catch (e) {
			console.log(`seed ${seed} zones=${nz} nodes=${ids.length} links=${links.length} dir=${direction}`);
			throw e;
		}
		n_++;
		if (res.degraded) degraded++;
		if (res.overflow) overflow++;
	}
	console.log("infra fuzz", { n: n_, degraded, overflow });
	assert.ok(degraded <= n_ * 0.03, `degraded ${degraded}`);
});

test("a large map (5 zones, 30 nodes, 45 links) routes completely", () => {
	const r = rng(777);
	const ids: string[] = [];
	const zones = Array.from({ length: 5 }, (_, z) => ({
		name: `Zone ${z}`,
		nodes: Array.from({ length: 6 }, (_, i) => {
			const id = `z${z}n${i}`;
			ids.push(id);
			return n(id, `Node ${z}.${i}`, "service", "up", "detail");
		}),
	}));
	const links: Array<ReturnType<typeof L>> = [];
	while (links.length < 45) {
		const a = ids[Math.floor(r() * ids.length)];
		const b = ids[Math.floor(r() * ids.length)];
		if (a !== b) links.push(L(a, b, r() < 0.4 ? "HTTP" : undefined));
	}
	const t0 = Date.now();
	const res = infraRoundTrip(zones, links, { maxWidth: 1000, direction: "LR" });
	assert.ok(Date.now() - t0 < 8000);
	assert.equal(res.omitted?.length ?? 0, 0);
});
