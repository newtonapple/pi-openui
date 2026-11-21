// Graph(nodes, edges, direction?) -> DiagramResult. Never throws on bad input.
//
// A directed graph that may have cycles: state machines, and review or retry loops. The nodes are placed from the edges that go
// forward (layered.ts); an edge that goes back is an arc in a lane outside the body and an edge from a node to itself is a loop
// on the node (loops.ts). Every edge can carry a label, and two edges may join the same pair of nodes.

import { Canvas, oneLine, textWidth, truncateText, type Rect } from "./canvas.ts";
import { DAG_STATUSES, nodeSpec as boxSpec, STATUS_ICON } from "./dag.ts";
import { layeredDiagram, type DiagramResult, type LEdgeSpec, type LNodeSpec } from "./layeredDiagram.ts";
import { budgeted } from "./router.ts";

export const GRAPH_KINDS = ["state", "start", "end"] as const;
export type GraphKind = (typeof GRAPH_KINDS)[number];
export const START_GLYPH = "●";
export const END_GLYPH = "◉";

export interface GraphNodeIn {
	id: string;
	label?: string;
	kind?: string | null;
	status?: string | null;
}
export interface GraphEdgeIn {
	from: string;
	to: string;
	label?: string | null;
	style?: string | null;
}
export interface GraphOptions {
	direction?: "LR" | "TB" | null;
	/** columns available, default 100 */
	maxWidth?: number;
	/** longest label before truncation, default 28 */
	maxLabel?: number;
}

interface Norm {
	nodes: Array<{ id: string; label: string; kind: GraphKind; status: string | null }>;
	edges: Array<{ a: number; b: number; label?: string; dashed: boolean }>;
	warnings: string[];
}

export function normalizeGraph(nodesIn: unknown, edgesIn: unknown): Norm {
	const warnings: string[] = [];
	const nodes: Norm["nodes"] = [];
	const ids = new Map<string, number>();
	for (const raw of Array.isArray(nodesIn) ? nodesIn : []) {
		const r = (raw ?? {}) as GraphNodeIn;
		const id = typeof r.id === "string" ? r.id : r.id == null ? "" : String(r.id);
		if (!id) {
			warnings.push("a node without an id was skipped");
			continue;
		}
		if (ids.has(id)) {
			warnings.push(`duplicate node id "${id}" ignored`);
			continue;
		}
		const kind = (GRAPH_KINDS as readonly string[]).includes(String(r.kind)) ? (r.kind as GraphKind) : "state";
		let status: string | null = null;
		if (r.status != null && r.status !== "") {
			if ((DAG_STATUSES as readonly string[]).includes(String(r.status))) status = String(r.status);
			else warnings.push(`unknown status "${r.status}" on "${id}" ignored`);
		}
		ids.set(id, nodes.length);
		// a dot has no outline to carry a status, and a caption is optional
		nodes.push({ id, label: oneLine(r.label ?? (kind === "state" ? id : "")), kind, status: kind === "state" ? status : null });
	}
	const edges: Norm["edges"] = [];
	const seen = new Set<string>();
	for (const raw of Array.isArray(edgesIn) ? edgesIn : []) {
		const r = (raw ?? {}) as GraphEdgeIn;
		if (Array.isArray(raw) || typeof raw !== "object") {
			warnings.push("an edge that is not a GraphEdge was skipped");
			continue;
		}
		const a = ids.get(String(r.from));
		const b = ids.get(String(r.to));
		if (a === undefined || b === undefined) {
			warnings.push(`edge ${String(r.from)} -> ${String(r.to)} names an unknown node and was skipped`);
			continue;
		}
		if (nodes[b].kind === "start" || nodes[a].kind === "end") {
			warnings.push(`edge ${nodes[a].id} -> ${nodes[b].id} enters a start node or leaves an end node and was skipped`);
			continue;
		}
		const label = r.label ? oneLine(r.label) : undefined;
		const dashed = r.style === "dashed";
		const key = `${a}>${b}>${label ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);
		edges.push({ a, b, label, dashed });
	}
	return { nodes, edges, warnings };
}

/**
 * A start or end node: a dot and its caption. The dot is the node: it is one cell, so a wire always meets it and an arrow into an
 * end ring touches the ring, from whichever side it comes. The caption stands on the side the flow does not use (before a start
 * dot and after an end ring left to right, above a start dot and below an end ring top to bottom) and its cells are kept clear, so
 * the dot has three free sides and the layout gives it room for the caption. A dot with more wires than that is drawn as a box.
 */
function dotSpec(n: Norm["nodes"][number], cap: number, TB: boolean): LNodeSpec {
	const start = n.kind === "start";
	const caption = truncateText(n.label, cap);
	const capW = caption ? textWidth(caption) : 0;
	const glyph = start ? START_GLYPH : END_GLYPH;
	const dot = (area: Rect): Rect => {
		if (TB) return { x: area.x + Math.floor((area.w - 1) / 2), y: start ? area.y + area.h - 1 : area.y, w: 1, h: 1 };
		return { x: start ? area.x + area.w - 1 : area.x, y: area.y + Math.floor((area.h - 1) / 2), w: 1, h: 1 };
	};
	if (TB) {
		const w = Math.max(1, capW);
		const h = caption ? 2 : 1;
		const dx = Math.floor((w - capW) / 2) - Math.floor((w - 1) / 2); // where the caption starts, from the dot
		return {
			id: n.id,
			label: n.label,
			status: null,
			baseW: w,
			baseH: h,
			fixed: true,
			fit: dot,
			keepOut: caption ? [{ x: dx, y: start ? -1 : 1, w: capW, h: 1 }] : [],
			paint: (c: Canvas, r) => {
				c.set(r.x, r.y, glyph, "mark");
				if (caption) c.text(r.x + dx, r.y + (start ? -1 : 1), caption, "label");
			},
		};
	}
	const w = caption ? capW + 2 : 1;
	return {
		id: n.id,
		label: n.label,
		status: null,
		baseW: w,
		baseH: 1,
		fixed: true,
		fit: dot,
		keepOut: caption ? [start ? { x: -(capW + 1), y: 0, w: capW + 1, h: 1 } : { x: 1, y: 0, w: capW + 1, h: 1 }] : [],
		paint: (c: Canvas, r) => {
			c.set(r.x, r.y, glyph, "mark");
			if (caption) c.text(start ? r.x - 1 - capW : r.x + 2, r.y, caption, "label");
		},
	};
}

/** What a dot's three free sides take. A start or end node with more wires than this is drawn as a box, which takes as many as it is wide. */
const DOT_PORTS = 3;

function build(norm: Norm, dir: "LR" | "TB", cap: number, ports: number): DiagramResult {
	// the wires a start node sends out and an end node takes in (a loop never touches a dot: the language refuses it)
	const wires = norm.nodes.map(() => 0);
	for (const e of norm.edges) {
		if (norm.nodes[e.a].kind === "start") wires[e.a]++;
		if (norm.nodes[e.b].kind === "end") wires[e.b]++;
	}
	const nodes = norm.nodes.map((n, i) => {
		if (n.kind === "state") return boxSpec({ id: n.id, label: n.label, status: n.status as never }, cap, false);
		if (wires[i] > ports) return boxSpec({ id: n.id, label: `${n.kind === "start" ? START_GLYPH : END_GLYPH} ${n.label}`.trim(), status: null }, cap + 2, false);
		return dotSpec(n, cap, dir === "TB");
	});
	// a boxed dot is a box: its wires are the usual ones
	const boxed = (v: number) => norm.nodes[v].kind !== "state" && wires[v] > ports;
	const edges: LEdgeSpec[] = norm.edges.map((e) => ({ a: e.a, b: e.b, label: e.label, dashed: e.dashed, fromMark: norm.nodes[e.a].kind === "start" && !boxed(e.a) ? "bare" : "none", toMark: "arrow" }));
	return layeredDiagram("graph", { nodes, edges, loops: true }, dir);
}

function attempt(norm: Norm, dir: "LR" | "TB", cap: number): DiagramResult {
	const res = build(norm, dir, cap, DOT_PORTS);
	if (!res.omitted?.length) return res;
	// a dot's few ports can be one wire too few in a crowded graph: draw every dot that has two or more wires as a box and see
	const boxes = build(norm, dir, cap, 1);
	return (boxes.omitted?.length ?? 0) < res.omitted.length ? boxes : res;
}

/** How far labels shrink to fit the pane. Below 14 characters a label is no longer a name, so past this the graph scrolls with whole labels. */
const CAPS = [28, 20, 14];

export function graph(nodesIn: unknown, edgesIn: unknown, opts: GraphOptions = {}): DiagramResult {
	return budgeted(() => graphLayout(nodesIn, edgesIn, opts));
}

function graphLayout(nodesIn: unknown, edgesIn: unknown, opts: GraphOptions): DiagramResult {
	const norm = normalizeGraph(nodesIn, edgesIn);
	const maxWidth = Math.max(20, opts.maxWidth ?? 100);
	const maxLabel = Math.max(6, opts.maxLabel ?? 28);
	if (!norm.nodes.length) {
		return { kind: "graph", direction: "LR", width: 0, height: 0, rows: [], nodes: [], edges: [], warnings: [...norm.warnings, "the graph has no nodes"], footnotes: [], degraded: false, overflow: false, statuses: [], legend: [] };
	}
	const dirs: Array<"LR" | "TB"> = opts.direction === "LR" || opts.direction === "TB" ? [opts.direction] : ["LR", "TB"];
	const longest = Math.max(...norm.nodes.map((n) => textWidth(n.label)));
	let best: DiagramResult | null = null;
	let chosen: DiagramResult | null = null;
	for (const cap of [maxLabel, ...CAPS.filter((c) => c < maxLabel)]) {
		for (const d of dirs) {
			const r = attempt(norm, d, cap);
			if (!best || r.width < best.width) best = r;
			if (r.width <= maxWidth) {
				chosen = r;
				break;
			}
		}
		if (chosen) break;
		if (longest <= cap) break; // shrinking more changes nothing
	}
	if (!chosen) {
		// nothing fits even with short labels: the view will scroll, so scroll to whole labels instead of cutting them as well
		const tries = dirs.map((d) => attempt(norm, d, maxLabel));
		best = tries.reduce((a, b) => (b.width < a.width ? b : a));
	}
	const res = chosen ?? best!;
	res.overflow = !chosen;
	res.warnings = [...norm.warnings];
	if (res.degraded) res.warnings.push("some edges could not be routed cleanly");
	res.statuses = DAG_STATUSES.filter((s) => norm.nodes.some((n) => n.status === s));
	res.legend = res.statuses.map((s) => ({ glyph: STATUS_ICON[s], role: `icon.${s}`, text: s + (s === "skipped" ? " (dashed)" : "") }));
	return res;
}
