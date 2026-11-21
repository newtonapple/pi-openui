// Loops for Graph: the geometry of an edge that goes back and of an edge that returns to its own node. Pure: no canvas, no router.
//
// The layered layout (layered.ts) places the nodes from the edges that go forward. An edge that closes a cycle is NOT part of it:
// it is drawn as an arc in a lane outside the body, below it when the graph runs left to right and to the right of it when it runs
// top to bottom, so a loop never cuts through the picture. A self-loop is a small loop on the side of its node that faces away from
// the lanes (above it, or to its left).
//
// Everything here is written in two axes so one piece of code serves both directions: `f` runs along the flow (x for LR, y for TB)
// and `c` across it (y for LR, x for TB). The lane side is "c plus".

import type { Rect } from "./canvas.ts";
import type { Step } from "./router.ts";

/** Directions are as in router.ts: 0 north, 1 east, 2 south, 3 west. */
export interface Axes {
	TB: boolean;
	/** along the flow, increasing */
	fp: number;
	/** along the flow, decreasing */
	fm: number;
	/** across, towards the lanes */
	cp: number;
	/** across, away from the lanes */
	cm: number;
}

export function axes(TB: boolean): Axes {
	return TB ? { TB, fp: 2, fm: 0, cp: 1, cm: 3 } : { TB, fp: 1, fm: 3, cp: 2, cm: 0 };
}

export const f0 = (a: Axes, r: Rect) => (a.TB ? r.y : r.x);
export const fLen = (a: Axes, r: Rect) => (a.TB ? r.h : r.w);
export const c0 = (a: Axes, r: Rect) => (a.TB ? r.x : r.y);
export const cLen = (a: Axes, r: Rect) => (a.TB ? r.w : r.h);
const at = (a: Axes, f: number, c: number) => (a.TB ? { x: c, y: f } : { x: f, y: c });

/** The cells of one wire, from the cell next to the node it leaves to the cell next to the node it enters. */
export type Path = Step[];

/** The flow-axis size a node needs for `ends` arcs on its lane side, so that each has a cell of its own and a blank between. */
export const portsNeed = (ends: number, sp: number) => (ends > 0 ? (ends - 1) * sp + 3 : 1);

/** The flow-axis size a node needs for `k` self-loops (two ports each, nested). */
export const selfNeed = (k: number) => (k > 0 ? 2 * k + 3 : 1);

/** How far out from the node the outermost of `k` nested self-loops reaches (the loop's own line, not its label). */
export const selfReach = (k: number) => (k > 0 ? 2 + 2 * (k - 1) : 0);

export interface BackIn {
	/** index in the spec's edge list */
	index: number;
	/** node it leaves, node it enters */
	a: number;
	b: number;
	/** width of its label in cells, 0 for none */
	label: number;
}

export interface BackPlan {
	index: number;
	a: number;
	b: number;
	lane: number;
	/** cross coordinate of the lane line */
	lc: number;
	/** flow coordinate of each end's port */
	fa: number;
	fb: number;
}

export interface BackLayout {
	plans: BackPlan[];
	/** one past the last cross coordinate the lanes (and the labels beside them) use */
	end: number;
}

/**
 * Give every back edge a lane and a port at each end.
 *
 *  - Lanes: shortest span first, each into the lowest lane where no earlier span overlaps it. A longer arc that contains a shorter
 *    one therefore lies outside it, and two arcs that do not overlap share a lane.
 *  - Ports: at one node the arcs that go toward lower `f` take the lower ports, shallow lane first, and the arcs that go toward
 *    higher `f` take the upper ports, deep lane first. Then the deepest arcs of a node are nearest its middle, and an arc's line
 *    meets the verticals of the shallower arcs only where they must cross.
 *  - Lane position: 2 cells apart (the cell between holds the label of the shallower lane) when running left to right. Top to
 *    bottom a lane is as far from the last as the longest label of that lane is wide, because the label stands beside the line.
 */
export function planBack(ax: Axes, sp: number, rects: Rect[], back: BackIn[], bodyEnd: number): BackLayout {
	if (!back.length) return { plans: [], end: bodyEnd };
	const lo = (e: BackIn) => Math.min(f0(ax, rects[e.a]), f0(ax, rects[e.b]));
	const hi = (e: BackIn) => Math.max(f0(ax, rects[e.a]) + fLen(ax, rects[e.a]) - 1, f0(ax, rects[e.b]) + fLen(ax, rects[e.b]) - 1);
	const order = back.slice().sort((p, q) => hi(p) - lo(p) - (hi(q) - lo(q)) || p.index - q.index);
	const lanes: Array<Array<[number, number]>> = [];
	const laneOf = new Map<number, number>();
	for (const e of order) {
		let k = 0;
		for (; k < lanes.length; k++) if (lanes[k].every(([l, h]) => lo(e) > h + 1 || hi(e) < l - 1)) break;
		if (k === lanes.length) lanes.push([]);
		lanes[k].push([lo(e), hi(e)]);
		laneOf.set(e.index, k);
	}
	// where each lane runs
	const widest = lanes.map(() => 0);
	for (const e of back) widest[laneOf.get(e.index)!] = Math.max(widest[laneOf.get(e.index)!], e.label);
	const laneAt: number[] = [];
	let c = bodyEnd + 2;
	for (let k = 0; k < lanes.length; k++) {
		laneAt.push(c);
		c += ax.TB ? Math.max(2, widest[k] + 3) : 2;
	}
	const end = ax.TB ? laneAt[laneAt.length - 1] + 2 + widest[widest.length - 1] + 2 : laneAt[laneAt.length - 1] + 3;

	// the ends at each node, in port order
	type End = { e: BackIn; at: "a" | "b"; toward: -1 | 1; lane: number };
	const ends = new Map<number, End[]>();
	const add = (v: number, x: End) => (ends.get(v) ?? ends.set(v, []).get(v)!).push(x);
	const mid = (v: number) => f0(ax, rects[v]) + (fLen(ax, rects[v]) - 1) / 2;
	for (const e of back) {
		const lane = laneOf.get(e.index)!;
		add(e.a, { e, at: "a", toward: mid(e.b) < mid(e.a) ? -1 : 1, lane });
		add(e.b, { e, at: "b", toward: mid(e.a) < mid(e.b) ? -1 : 1, lane });
	}
	const port = new Map<string, number>();
	for (const [v, list] of ends) {
		list.sort((p, q) => (p.toward !== q.toward ? p.toward - q.toward : p.toward < 0 ? p.lane - q.lane : q.lane - p.lane) || p.e.index - q.e.index);
		const r = rects[v];
		const span = (list.length - 1) * sp;
		const first = Math.round(f0(ax, r) + (fLen(ax, r) - 1) / 2 - span / 2);
		const lowest = f0(ax, r) + 1;
		const highest = f0(ax, r) + fLen(ax, r) - 2;
		list.forEach((x, i) => port.set(`${x.e.index}${x.at}`, Math.max(lowest, Math.min(highest, first + i * sp))));
	}
	const plans = back.map((e) => ({ index: e.index, a: e.a, b: e.b, lane: laneOf.get(e.index)!, lc: laneAt[laneOf.get(e.index)!], fa: port.get(`${e.index}a`)!, fb: port.get(`${e.index}b`)! }));
	return { plans, end };
}

/** The cells of one back edge: out of the lane side of its source, along its lane, back in to the lane side of its target. */
export function backPath(ax: Axes, rects: Rect[], p: BackPlan): Path {
	const out: Path = [];
	const push = (f: number, c: number, dir: number) => out.push({ ...at(ax, f, c), dir });
	const a = rects[p.a];
	const b = rects[p.b];
	for (let c = c0(ax, a) + cLen(ax, a); c <= p.lc; c++) push(p.fa, c, ax.cp);
	if (p.fb < p.fa) for (let f = p.fa - 1; f >= p.fb; f--) push(f, p.lc, ax.fm);
	else for (let f = p.fa + 1; f <= p.fb; f++) push(f, p.lc, ax.fp);
	for (let c = p.lc - 1; c >= c0(ax, b) + cLen(ax, b); c--) push(p.fb, c, ax.cm);
	return out;
}

/** The j-th (0 = outermost) of k self-loops on a node: up and over on the side away from the lanes, and back in. */
export function selfPath(ax: Axes, r: Rect, j: number, k: number): Path {
	const out: Path = [];
	const push = (f: number, c: number, dir: number) => out.push({ ...at(ax, f, c), dir });
	const fa = f0(ax, r) + 1 + j;
	const fb = f0(ax, r) + fLen(ax, r) - 2 - j;
	const reach = 2 + 2 * (k - 1 - j);
	const edge = c0(ax, r);
	for (let c = edge - 1; c >= edge - reach; c--) push(fa, c, ax.cm);
	for (let f = fa + 1; f <= fb; f++) push(f, edge - reach, ax.fp);
	for (let c = edge - reach + 1; c <= edge - 1; c++) push(fb, c, ax.cp);
	return out;
}
