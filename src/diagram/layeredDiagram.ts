// Shared builder for layered diagrams (DAG, ERD): placement -> routing -> raster.

import { Canvas, textWidth, type Cell, type Rect } from "./canvas.ts";
import { assignCross, breakCycles, layerize } from "./layered.ts";
import { axes, backPath, f0, fLen, planBack, portsNeed, selfNeed, selfPath, selfReach, type BackLayout, type BackPlan, type Path } from "./loops.ts";
import { Router, type RouteReq, type Routed, type Waypoint } from "./router.ts";
import { drawWires, type Mark, type WireSpec } from "./wires.ts";

export interface PlacedNode {
	id: string;
	index: number;
	label: string;
	status: string | null;
	/** the box wires attach to */
	rect: Rect;
	/** everything the node occupies, when that is more than its box (a Graph dot and its caption): what a pointer hits */
	area?: Rect;
}

export interface PlacedEdge {
	/** index in the normalised input edge list */
	index: number;
	from: string;
	to: string;
	reversed: boolean;
	ok: boolean;
	forced: boolean;
	label?: string;
	/** Graph only: how the edge is drawn. Absent for Dag and InfraMap, whose edges are all layered. */
	kind?: "forward" | "back" | "self";
	cells: Array<[number, number]>;
	labelCells: Array<[number, number]>;
}

export interface DiagramResult {
	kind: string;
	direction: "LR" | "TB";
	width: number;
	height: number;
	rows: Cell[][];
	nodes: PlacedNode[];
	edges: PlacedEdge[];
	warnings: string[];
	footnotes: string[];
	degraded: boolean;
	overflow: boolean;
	/** statuses in use, for tests and the pi adapter */
	statuses: string[];
	/** legend entries drawn under the diagram */
	legend: LegendEntry[];
	/** edges that could not be routed cleanly. They are not drawn and are listed in the footnotes. */
	omitted?: Array<{ from: string; to: string; label?: string }>;
	/** zones (InfraMap), for hit-testing */
	zones?: Array<{ name: string; tone: string; rect: Rect }>;
}

export interface LegendEntry {
	glyph: string;
	role: string;
	text: string;
}

export interface LNodeSpec {
	id: string;
	label: string;
	status: string | null;
	baseW: number;
	baseH: number;
	paint: (c: Canvas, r: Rect) => void;
	/** rows (relative to the box top) where no wire may attach, e.g. a table separator */
	noPortRows?: number[];
	/** cells (relative to the box's corner, and outside it) that no wire may use, to keep a wire's end at one place on a side */
	keepOut?: Rect[];
	/**
	 * The box wires attach to, inside the area the layout gave the node (baseW by baseH). Without it the box is the whole area.
	 * A Graph dot is one cell with its caption beside it, so a wire always meets the dot itself.
	 */
	fit?: (area: Rect) => Rect;
	/** do not make the node larger for the wires it has: its ports are as many as it has sides */
	fixed?: boolean;
}

export interface LEdgeSpec {
	a: number;
	b: number;
	label?: string;
	dashed?: boolean;
	fromMark: Mark;
	toMark: Mark;
}

export interface LayeredSpec {
	nodes: LNodeSpec[];
	edges: LEdgeSpec[];
	/** spacing between ports on one side, default 2 */
	portSpacing?: number;
	/** draw edges that were reversed to break a cycle dashed */
	dashReversed?: boolean;
	/**
	 * Graph: cycles are allowed. An edge that closes one is not laid out but drawn as an arc in a lane outside the body, and an
	 * edge from a node to itself as a loop on the node. The nodes are placed from the other edges only.
	 */
	loops?: boolean;
}

interface Built {
	canvas: Canvas;
	nodes: PlacedNode[];
	edges: PlacedEdge[];
	failed: number;
	forced: number;
	footnotes: string[];
	omitted: Array<{ from: string; to: string; label?: string }>;
	/** labels that found no place beside their wire and went to the footnotes */
	lost: number;
	/** the diagram has arcs in lanes */
	lanes: boolean;
}

const MARGIN = 3;

function build(spec: LayeredSpec, dir: "LR" | "TB", spacing: number, relax: boolean, lanePad = 0): Built | { failed: number } {
	const n = spec.nodes.length;
	const TB = dir === "TB";
	const sp = spec.portSpacing ?? 2;
	// which edges the layout sees. Without `loops` all of them (and layerize reverses the ones that close a cycle).
	const self: number[] = [];
	const back: number[] = [];
	let fwd = spec.edges.map((_, i) => i);
	if (spec.loops) {
		const rest = fwd.filter((i) => spec.edges[i].a !== spec.edges[i].b);
		self.push(...fwd.filter((i) => spec.edges[i].a === spec.edges[i].b));
		const rev = breakCycles(
			n,
			rest.map((i) => ({ a: spec.edges[i].a, b: spec.edges[i].b })),
		);
		back.push(...rest.filter((_, k) => rev[k]));
		fwd = rest.filter((_, k) => !rev[k]);
	}
	const L = layerize(
		n,
		fwd.map((i) => ({ a: spec.edges[i].a, b: spec.edges[i].b })),
	);
	const ax = axes(TB);
	const backEnds = new Array<number>(n).fill(0);
	for (const i of back) {
		backEnds[spec.edges[i].a]++;
		backEnds[spec.edges[i].b]++;
	}
	const selfCount = new Array<number>(n).fill(0);
	const selfLabel = new Array<number>(n).fill(0);
	for (const i of self) {
		const v = spec.edges[i].a;
		selfCount[v]++;
		selfLabel[v] = Math.max(selfLabel[v], spec.edges[i].label ? textWidth(spec.edges[i].label!) : 0);
	}
	/** how far out from the node's lane-less side its self-loops and their labels reach */
	const selfOut = (v: number) => (selfCount[v] ? selfReach(selfCount[v]) + (selfLabel[v] ? (TB ? selfLabel[v] + 1 : 1) : 0) : 0);
	// Top to bottom a label stands to the right of its wire, so a Graph leaves room for it beside the node the wire is at
	const labelRoom = new Array<number>(n).fill(0);
	if (spec.loops && TB)
		for (const i of fwd) {
			const e = spec.edges[i];
			if (e.label) for (const v of [e.a, e.b]) labelRoom[v] = Math.max(labelRoom[v], textWidth(e.label) + 2);
		}
	const maxSelfOut = Math.max(0, ...Array.from({ length: n }, (_, v) => selfOut(v)));
	const N = L.itemLayer.length;
	const inDeg = new Array<number>(n).fill(0);
	const outDeg = new Array<number>(n).fill(0);
	for (const e of L.edges) {
		outDeg[e.a]++;
		inDeg[e.b]++;
	}
	const w = new Array<number>(N).fill(1);
	const h = new Array<number>(N).fill(1);
	for (let v = 0; v < n; v++) {
		const k = Math.max(inDeg[v], outDeg[v]);
		const need = k > 0 ? (k - 1) * sp + 3 : 1;
		const flow = Math.max(portsNeed(backEnds[v], sp), selfNeed(selfCount[v]));
		if (spec.nodes[v].fixed) {
			w[v] = spec.nodes[v].baseW;
			h[v] = spec.nodes[v].baseH;
		} else if (TB) {
			w[v] = Math.max(spec.nodes[v].baseW, need);
			h[v] = Math.max(spec.nodes[v].baseH, flow);
		} else {
			w[v] = Math.max(spec.nodes[v].baseW, flow);
			h[v] = Math.max(spec.nodes[v].baseH, need);
		}
	}
	const cs = (i: number) => (TB ? w[i] : h[i]);
	const fs = (i: number) => (TB ? h[i] : w[i]);
	const csArr = Array.from({ length: N }, (_, i) => cs(i));
	const nodeGap = (TB ? 4 : 2) + spacing;
	const cross = assignCross(
		L,
		csArr,
		(a, b) => Math.max(a < n && b < n ? nodeGap : 2, b < n && selfOut(b) ? selfOut(b) + 1 : 0, a < n ? labelRoom[a] : 0),
		(u, v) => (u >= n && v >= n ? 6 : u >= n || v >= n ? 3 : 1),
	);
	const center = (i: number) => cross[i] + (csArr[i] - 1) / 2;
	// band thickness and channel gaps along the flow axis
	const T = new Array<number>(L.nLayers).fill(1);
	for (let i = 0; i < N; i++) T[L.itemLayer[i]] = Math.max(T[L.itemLayer[i]], fs(i));
	// tracks a channel needs: the largest number of horizontal spans that overlap at one position
	const nonStraight = new Array<number>(Math.max(0, L.nLayers - 1)).fill(0);
	{
		const spans: Array<Array<[number, number]>> = Array.from({ length: Math.max(0, L.nLayers - 1) }, () => []);
		for (const s of L.segs) {
			const a = center(s.u);
			const b = center(s.v);
			if (Math.abs(a - b) > 1) spans[L.itemLayer[s.u]].push([Math.min(a, b), Math.max(a, b)]);
		}
		spans.forEach((sp, l) => {
			const ev: Array<[number, number]> = [];
			for (const [lo, hi] of sp) {
				ev.push([lo, 1]);
				ev.push([hi + 0.5, -1]);
			}
			ev.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
			let cur = 0;
			let best = 0;
			for (const [, d] of ev) {
				cur += d;
				best = Math.max(best, cur);
			}
			nonStraight[l] = best;
		});
	}
	const labelNeed = new Array<number>(Math.max(0, L.nLayers - 1)).fill(0);
	for (const [ei, e] of L.edges.entries()) {
		const lab = spec.edges[fwd[e.src]].label;
		if (lab) labelNeed[L.itemLayer[L.chains[ei][0]]] = Math.max(labelNeed[L.itemLayer[L.chains[ei][0]]], textWidth(lab));
	}
	const gapFlow = (l: number) => {
		const ns = nonStraight[l];
		let g = (TB ? 2 : 5) + ns + spacing * 2;
		if (labelNeed[l]) g = Math.max(g, TB ? 3 : labelNeed[l] + 4);
		return g;
	};
	const F = new Array<number>(L.nLayers).fill(0);
	F[0] = MARGIN;
	for (let l = 0; l + 1 < L.nLayers; l++) F[l + 1] = F[l] + T[l] + gapFlow(l);
	// room before the first node, across the flow, for the self-loops (and their labels) of a node that comes first
	const cm = MARGIN + maxSelfOut;
	const rect: Rect[] = [];
	let W = 0;
	let H = 0;
	for (let i = 0; i < N; i++) {
		const l = L.itemLayer[i];
		const off = Math.floor((T[l] - fs(i)) / 2);
		const r = TB ? { x: cm + cross[i], y: F[l] + off, w: w[i], h: h[i] } : { x: F[l] + off, y: cm + cross[i], w: w[i], h: h[i] };
		rect.push(r);
		W = Math.max(W, r.x + r.w);
		H = Math.max(H, r.y + r.h);
	}
	W += MARGIN;
	H += MARGIN;
	// the areas the layout gave the nodes, and inside each the box its wires attach to
	const area = rect.slice();
	for (let v = 0; v < n; v++) {
		const fit = spec.nodes[v].fit;
		if (fit) rect[v] = fit(area[v]);
	}
	const real = rect.slice(0, n);
	let lanes: BackLayout = { plans: [], end: 0 };
	if (back.length) {
		const bodyEnd = Math.max(...area.slice(0, n).map((r) => (TB ? r.x + r.w : r.y + r.h))) + lanePad;
		const mark = (i: number) => (spec.edges[i].label ? textWidth(spec.edges[i].label!) : 0);
		lanes = planBack(ax, sp, real, back.map((i) => ({ index: i, a: spec.edges[i].a, b: spec.edges[i].b, label: mark(i) })), bodyEnd);
		if (TB) W = Math.max(W, lanes.end + MARGIN);
		else {
			H = Math.max(H, lanes.end + MARGIN);
			W = Math.max(W, Math.max(...back.map(mark)) + 2 * MARGIN); // a label too long for its lane stands below it, and must be inside the picture
		}
	}
	const omittedLoops: number[] = [];
	const router = new Router(W, H);
	for (let v = 0; v < n; v++) {
		router.addSolid(rect[v], v);
		for (const k of spec.nodes[v].keepOut ?? []) router.addSolid({ x: rect[v].x + k.x, y: rect[v].y + k.y, w: k.w, h: k.h });
		for (const row of spec.nodes[v].noPortRows ?? []) {
			router.addSolid({ x: rect[v].x - 1, y: rect[v].y + row, w: 1, h: 1 });
			router.addSolid({ x: rect[v].x + rect[v].w, y: rect[v].y + row, w: 1, h: 1 });
		}
	}

	// reserve the lanes of long edges so no other wire can turn or end on them
	for (const [ei, chain] of L.chains.entries()) {
		for (let k = 1; k + 1 < chain.length; k++) {
			const it = chain[k];
			const l = L.itemLayer[it];
			const r = rect[it];
			const cells = Array.from({ length: T[l] }, (_, d) => (TB ? { x: r.x, y: F[l] + d } : { x: F[l] + d, y: r.y }));
			router.reserve(ei, cells, TB);
		}
	}
	// Loops first, so every other wire routes around them. A loop is drawn as planned when its cells are free; a back edge whose
	// straight way out is blocked (another node of its layer lies beyond its node) is searched for instead, through the gaps.
	interface Looped {
		index: number;
		kind: "back" | "self";
		steps: Path;
	}
	const looped: Looped[] = [];
	let loopFailed = 0;
	const clear = (path: Path, a: number, b: number) =>
		path.length > 0 &&
		path.every((st, i) => {
			if (st.x < 0 || st.y < 0 || st.x >= W || st.y >= H) return false;
			const k = st.y * W + st.x;
			const pn = router.portNode[k];
			if (router.solid[k] || (pn !== -1 && pn !== a && pn !== b) || router.full[k] !== -1) return false;
			// an end or a corner needs the cell to itself; a straight cell may be crossed by a wire at a right angle
			const out = i + 1 < path.length ? path[i + 1].dir : -1;
			if (i === 0 || i === path.length - 1 || out !== st.dir) return router.vOwn[k] === -1 && router.hOwn[k] === -1;
			return st.dir === 0 || st.dir === 2 ? router.vOwn[k] === -1 : router.hOwn[k] === -1;
		});
	const commitLoop = (index: number, kind: "back" | "self", steps: Path) => {
		router.commit({ id: L.edges.length + looped.length, steps, ok: true, forced: false });
		looped.push({ index, kind, steps });
	};
	const fromAny = (side: number, pen: number) => [0, 1, 2, 3].map((d) => (d === side ? pen : -1));
	const findBack = (pl: BackPlan, relaxed: boolean): Path | null => {
		const a = real[pl.a];
		const b = real[pl.b];
		const fm = f0(ax, b) < f0(ax, a);
		const fa = fm ? f0(ax, a) - 2 : f0(ax, a) + fLen(ax, a) + 1;
		const fb = fm ? f0(ax, b) + fLen(ax, b) + 1 : f0(ax, b) - 2;
		const wps: Waypoint[] = [];
		if (fm ? fa - 1 > fb + 1 : fa + 1 < fb - 1) {
			const lane = (f: number, dir: number): Waypoint => (TB ? { x: pl.lc, y: f, dir } : { x: f, y: pl.lc, dir });
			wps.push(lane(fm ? fa - 1 : fa + 1, fm ? ax.fm : ax.fp), lane(fm ? fb + 1 : fb - 1, fm ? ax.fm : ax.fp));
		}
		const r = router.route({ id: L.edges.length + looped.length, from: a, to: b, fromId: pl.a, toId: pl.b, fromPen: fromAny(ax.cp, 0), toPen: fromAny(ax.cp, 0), waypoints: wps }, relaxed);
		return r.ok ? r.steps : null;
	};
	{
		const seen = new Array<number>(n).fill(0);
		for (const i of self) {
			const v = spec.edges[i].a;
			const j = seen[v]++;
			const steps = selfPath(ax, real[v], j, selfCount[v]);
			if (clear(steps, v, v)) commitLoop(i, "self", steps);
			else if (relax) omittedLoops.push(i);
			else loopFailed++;
		}
	}
	for (const pl of lanes.plans) {
		const manual = backPath(ax, real, pl);
		const steps = clear(manual, pl.a, pl.b) ? manual : findBack(pl, relax);
		if (steps) commitLoop(pl.index, "back", steps);
		else if (relax) omittedLoops.push(pl.index);
		else loopFailed++;
	}
	if (loopFailed) return { failed: loopFailed };

	const fromPen = TB ? [300, 120, 0, 120] : [120, 0, 120, 300];
	const toPen = TB ? [0, 120, 300, 120] : [120, 300, 120, 0];
	const order = L.edges.map((_, i) => i).sort((p, q) => {
		const sp1 = L.chains[p].length;
		const sp2 = L.chains[q].length;
		return sp2 - sp1 || p - q;
	});
	const routed = new Map<number, Routed>();
	let failed = 0;
	const forced = 0;
	const omitted: Built["omitted"] = [];
	for (const i of omittedLoops) omitted.push({ from: spec.nodes[spec.edges[i].a].id, to: spec.nodes[spec.edges[i].b].id, label: spec.edges[i].label });
	for (const ei of order) {
		const e = L.edges[ei];
		const chain = L.chains[ei];
		const wps: Waypoint[] = [];
		for (let k = 1; k + 1 < chain.length; k++) {
			const it = chain[k];
			const l = L.itemLayer[it];
			const r = rect[it];
			const pts: Waypoint[] = TB
				? [
						{ x: r.x, y: F[l], dir: 2 },
						{ x: r.x, y: F[l] + T[l] - 1, dir: 2 },
					]
				: [
						{ x: F[l], y: r.y, dir: 1 },
						{ x: F[l] + T[l] - 1, y: r.y, dir: 1 },
					];
			for (const p of pts) if (!wps.length || wps[wps.length - 1].x !== p.x || wps[wps.length - 1].y !== p.y) wps.push(p);
		}
		const req: RouteReq = { id: ei, from: rect[e.a], to: rect[e.b], fromId: e.a, toId: e.b, fromPen, toPen, waypoints: wps };
		const r = router.route(req, false);
		if (!r.ok) {
			if (!relax) return { failed: failed + 1 };
			failed++;
			const o = spec.edges[fwd[e.src]];
			omitted.push({ from: spec.nodes[o.a].id, to: spec.nodes[o.b].id, label: o.label });
			continue;
		}
		router.commit(r);
		routed.set(ei, r);
	}

	// raster
	const canvas = new Canvas(W, H);
	for (let v = 0; v < n; v++) spec.nodes[v].paint(canvas, rect[v]);
	const wires: WireSpec[] = [];
	for (const [ei, r] of routed) {
		const e = L.edges[ei];
		const o = spec.edges[fwd[e.src]];
		wires.push({
			id: ei,
			steps: r.steps,
			dashed: !!o.dashed || (!!spec.dashReversed && e.rev),
			startMark: e.rev ? o.toMark : o.fromMark,
			endMark: e.rev ? o.fromMark : o.toMark,
			label: o.label,
			desc: `${spec.nodes[o.a].id} -> ${spec.nodes[o.b].id}`,
			role: "wire",
		});
	}
	for (const [k, lp] of looped.entries()) {
		const o = spec.edges[lp.index];
		wires.push({
			id: L.edges.length + k,
			steps: lp.steps,
			dashed: !!o.dashed,
			startMark: o.fromMark,
			endMark: o.toMark,
			label: o.label,
			desc: `${spec.nodes[o.a].id} -> ${spec.nodes[o.b].id}`,
			role: "wire",
			labelSide: lp.kind === "back" ? (TB ? "right" : "below") : TB ? "left" : "above",
		});
	}
	const { footnotes, labelCells } = drawWires(canvas, wires, (x, y) => router.solid[y * W + x] === 1);

	// crop to content
	let minX = W;
	let minY = H;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++)
			if (canvas.getCh(x, y) !== " " || canvas.getRole(x, y) !== "") {
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y);
			}
	// a node's box counts even where it is blank (a Graph dot is drawn on part of its box)
	for (const r of area.slice(0, n)) {
		minX = Math.min(minX, r.x);
		minY = Math.min(minY, r.y);
		maxX = Math.max(maxX, r.x + r.w - 1);
		maxY = Math.max(maxY, r.y + r.h - 1);
	}
	if (maxX < 0) {
		minX = minY = 0;
		maxX = maxY = 0;
	}
	const out = new Canvas(maxX - minX + 1, maxY - minY + 1);
	for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.set(x, y, canvas.getCh(x + minX, y + minY), canvas.getRole(x + minX, y + minY));
	const nodes: PlacedNode[] = spec.nodes.map((s, i) => ({
		id: s.id,
		index: i,
		label: s.label,
		status: s.status,
		rect: { x: rect[i].x - minX, y: rect[i].y - minY, w: rect[i].w, h: rect[i].h },
		...(s.fit ? { area: { x: area[i].x - minX, y: area[i].y - minY, w: area[i].w, h: area[i].h } } : {}),
	}));
	const edges: PlacedEdge[] = [];
	for (const [ei, r] of [...routed.entries()].sort((a, b) => a[0] - b[0])) {
		const e = L.edges[ei];
		const o = spec.edges[fwd[e.src]];
		edges.push({
			index: fwd[e.src],
			from: spec.nodes[o.a].id,
			to: spec.nodes[o.b].id,
			reversed: e.rev,
			ok: true,
			forced: r.forced,
			label: o.label,
			...(spec.loops ? { kind: "forward" as const } : {}),
			cells: r.steps.map((s) => [s.x - minX, s.y - minY] as [number, number]),
			labelCells: (labelCells.get(ei) ?? []).map(([x, y]) => [x - minX, y - minY] as [number, number]),
		});
	}
	for (const [k, lp] of looped.entries()) {
		const o = spec.edges[lp.index];
		edges.push({
			index: lp.index,
			from: spec.nodes[o.a].id,
			to: spec.nodes[o.b].id,
			reversed: lp.kind === "back",
			ok: true,
			forced: false,
			label: o.label,
			kind: lp.kind,
			cells: lp.steps.map((st) => [st.x - minX, st.y - minY] as [number, number]),
			labelCells: (labelCells.get(L.edges.length + k) ?? []).map(([x, y]) => [x - minX, y - minY] as [number, number]),
		});
	}
	if (spec.loops) edges.sort((p, q) => p.index - q.index);
	for (const o of omitted) footnotes.push(`${o.from} -> ${o.to}${o.label ? ` (${o.label})` : ""} (not drawn)`);
	// a label of a forward edge that touches another line (a lane beside it) is as good as lost: the lanes can be moved out
	let tight = 0;
	if (spec.loops && TB)
		for (const [ei, cells] of labelCells) {
			if (ei >= L.edges.length || !cells.length) continue;
			const own = new Set(routed.get(ei)?.steps.map((st) => st.y * W + st.x));
			const row = cells[0][1];
			const xs = cells.map((c) => c[0]);
			for (const x of [Math.min(...xs) - 1, Math.max(...xs) + 1]) if (!canvas.isBlank(x, row) && !own.has(row * W + x)) tight++;
		}
	return { canvas: out, nodes, edges, failed, forced, footnotes, omitted, lost: footnotes.length + tight, lanes: lanes.plans.length > 0 };
}

export function layeredDiagram(kind: string, spec: LayeredSpec, dir: "LR" | "TB"): DiagramResult {
	const place = (lanePad: number): Built | null => {
		for (const spacing of [0, 1, 2, 4, 7]) {
			const r = build(spec, dir, spacing, false, lanePad);
			if ("canvas" in r) return r;
		}
		const r = build(spec, dir, 4, true, lanePad);
		return "canvas" in r ? r : null;
	};
	let built = place(0);
	if (!built) throw new Error("layeredDiagram: could not place diagram");
	// Top to bottom, the lanes stand to the right of the body and a label beside a forward edge can reach into them. When one has
	// gone to the footnotes for that, move the lanes out by the widest label and keep the picture that loses fewer.
	if (spec.loops && dir === "TB" && built.lanes && built.lost > 0) {
		const widest = Math.max(0, ...spec.edges.map((e) => (e.label && e.a !== e.b ? textWidth(e.label) : 0)));
		const wider = place(widest + 2);
		if (wider && wider.lost < built.lost) built = wider;
	}
	return {
		kind,
		direction: dir,
		width: built.canvas.w,
		height: built.canvas.h,
		rows: built.canvas.rows(),
		nodes: built.nodes,
		edges: built.edges,
		warnings: [],
		footnotes: built.footnotes,
		degraded: built.omitted.length > 0,
		overflow: false,
		statuses: [],
		legend: [],
		omitted: built.omitted,
	};
}
