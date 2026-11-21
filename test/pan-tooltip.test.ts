// A tooltip's badge on a diagram that is scrolled sideways. Panning moves a node's rectangle left, so it can start before column 0
// or lie wholly off the pane; drawing its badge must never throw ("InfraMap could not be drawn ... reading 'ch'").
import assert from "node:assert/strict";
import { test } from "node:test";
import { placeBadge } from "../src/blocks/core.ts";
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";
import { renderTree } from "../src/blocks/render.ts";
import { newState } from "../src/blocks/types.ts";
import { cell } from "../src/blocks/util.ts";

const blank = (w: number) => Array.from({ length: w }, () => cell(" ", ""));
const block = (w: number) => ({ w, rows: [blank(w), blank(w)], targets: [] as any[] });

test("placeBadge: a rectangle wholly left of the pane draws nothing and does not throw", () => {
	for (const rect of [{ x: -30, y: 0, w: 10, h: 1 }, { x: -10, y: 0, w: 10, h: 1 }, { x: -200, y: 0, w: 5, h: 1 }]) {
		const b = block(20);
		assert.equal(placeBadge(b, { rect }, "info"), false, JSON.stringify(rect));
		assert.ok(b.rows[0].every((c) => c.ch === " "), "nothing drawn");
	}
});

test("placeBadge: a rectangle wholly right of the pane draws nothing and does not throw", () => {
	const b = block(20);
	assert.equal(placeBadge(b, { rect: { x: 25, y: 0, w: 10, h: 1 } }, "info"), false);
});

test("placeBadge: a rectangle that starts before the pane gets its badge on the visible part", () => {
	const b = block(20);
	assert.equal(placeBadge(b, { rect: { x: -6, y: 0, w: 12, h: 1 } }, "info"), true);
	const at = b.rows[0].findIndex((c) => c.ch !== " ");
	assert.ok(at >= 0 && at < 6, `badge at ${at}, inside the visible part of the rectangle`);
});

test("placeBadge: an anchor that is off the rows or has a badge position off the pane does not throw", () => {
	const b = block(20);
	assert.doesNotThrow(() => placeBadge(b, { rect: { x: 0, y: 9, w: 3, h: 1 } }, "info"));
	assert.doesNotThrow(() => placeBadge(b, { rect: { x: -9, y: 0, w: 3, h: 1 }, badge: [-5, 0] }, "info"));
	assert.doesNotThrow(() => placeBadge(b, { rect: { x: -9, y: 0, w: 3, h: 1 }, badge: [-5, 0], badgeForce: true }, "info"));
});

const INFRA = `root = Stack([m])
m = InfraMap([z1, z2, z3, z4, z5], [l1, l2, l3, l4, l5], "Synthetic topology", "LR", [t1, t2, t3, t4])
z1 = InfraZone("Edge", [InfraNode("tun", "Tunnel", "cloud", "up", "ingress"), InfraNode("vpn", "Mesh VPN", "cloud", "up", "host.example.net")], "info")
z2 = InfraZone("Gateway", [InfraNode("gw", "Gateway", "gateway", "up", ":8080, rate-limit"), InfraNode("auth", "Auth proxy", "service", "up", ":4000, per-key")], "good")
z3 = InfraZone("Engines", [InfraNode("e1", "Engine one", "gpu", "up", ":9006"), InfraNode("e2", "Engine two", "gpu", "unknown", "experimental"), InfraNode("mon", "Metrics hub", "service", "up", "hub")], "neutral")
z4 = InfraZone("Cluster", [InfraNode("cl", "Two-node engine cluster with a long name", "gpu", "up", ":8000, one model")], "neutral")
z5 = InfraZone("Workstations", [InfraNode("w1", "Workstation one", "gpu", "up", "box-a"), InfraNode("w2", "Workstation two", "service", "up", "box-b")], "neutral")
l1 = InfraLink("tun", "gw", "tunnel")
l2 = InfraLink("vpn", "gw", "funnel")
l3 = InfraLink("gw", "auth", "/v1")
l4 = InfraLink("gw", "e1", "dev tunnel", "dashed")
l5 = InfraLink("cl", "gw", "cluster lane", "dashed")
t1 = Tooltip("tun", "Public ingress", "Outbound tunnel; no inbound ports.")
t2 = Tooltip("gw", "Reverse proxy", "The only public path into the fleet.")
t3 = Tooltip("cl", "2-node cluster", "One model at a time on :8000.")
t4 = Tooltip("w1", "Workstation", "Reached over the mesh.")`;

function sweep(key: string, source: string, widths: number[]) {
	const c = compile(source);
	assert.deepEqual(c.errors, [], key);
	for (const width of widths) {
		const st = newState();
		const first = renderTree(c.root!, width, st);
		assert.deepEqual(first.warnings, [], `${key}@${width} unpanned`);
		const bars = new Map<string, { total: number; view: number }>();
		for (const t of first.block.targets) if (t.scroll) bars.set(t.scroll.key, { total: t.scroll.total, view: t.scroll.view });
		for (const [pk, { total, view }] of bars) {
			// every offset, so the one that breaks is named
			for (let pan = 0; pan <= total - view + 2; pan++) {
				st.pan[pk] = pan;
				const r = renderTree(c.root!, width, st);
				assert.deepEqual(r.warnings, [], `${key}@${width} ${pk} panned to ${pan}/${total - view}`);
			}
		}
	}
}

test("an InfraMap with tooltips draws at every pan offset, to the far end", () => {
	sweep("infra", INFRA, [40, 57, 80, 120]);
});

test("every sample draws at every pan offset on a narrow pane", () => {
	for (const s of LANG_SAMPLES) sweep(s.key, s.source, [40, 57]);
});
