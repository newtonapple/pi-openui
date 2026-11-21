// Adapters: DiagramResult (Dag, Graph, Erd, InfraMap) and wide blocks -> Block with targets and tooltip anchors.
import { textWidth, type Cell } from "../diagram/canvas.ts";
import { dag } from "../diagram/dag.ts";
import { erd } from "../diagram/erd.ts";
import { graph } from "../diagram/graph.ts";
import { infra } from "../diagram/infra.ts";
import type { DiagramResult } from "../diagram/layeredDiagram.ts";
import { graphEdgeKeys, type El } from "../lang/library.ts";
import type { Anchor } from "./core.ts";
import type { Block, Ctx, Target } from "./types.ts";
import { panBlock } from "./panblock.ts";
import { cell, fromRows, padRow, textCells, vstack } from "./util.ts";

/**
 * A diagram's layout depends only on the component and the width, but the widget lays out again for a note, a tab, a resize
 * or a late picture. Routing wires is the costly part, so each result is kept with its component (and dropped with it). Nothing
 * downstream changes a result: resultBlock copies the cells.
 */
const layouts = new WeakMap<El, Map<number, DiagramResult>>();
function layoutOnce(el: El, width: number, make: () => DiagramResult): DiagramResult {
	let byWidth = layouts.get(el);
	if (!byWidth) layouts.set(el, (byWidth = new Map()));
	let res = byWidth.get(width);
	if (!res) {
		res = make();
		byWidth.set(width, res);
		if (byWidth.size > 4) byWidth.delete(byWidth.keys().next().value as number); // a window being dragged tries many widths
	}
	return res;
}

function resultBlock(res: DiagramResult, title: string | undefined, path: string, extra?: (res: DiagramResult) => Cell[][]): Block {
	const w = Math.max(res.width, 1);
	const rows: Cell[][] = res.rows.map((r) => r.slice()); // the cells are shared and frozen
	const targets: Target[] = res.nodes.map((n) => ({
		id: `node:${path}:${n.id}`,
		kind: "node",
		rect: { ...(n.area ?? n.rect) },
		label: n.label + (n.status ? `  ${n.status}` : ""),
	}));
	const body = fromRows(w, rows, targets);
	const top: Block[] = title ? [fromRows(w, [textCells(title, "chart.title")])] : [];
	const tail: Cell[][] = [];
	if (res.legend.length) {
		const parts: Cell[] = [];
		res.legend.forEach((e, i) => {
			if (i) parts.push(cell(" "), cell(" "));
			parts.push(...textCells(e.glyph, e.role), cell(" "), ...textCells(e.text, "legend"));
		});
		tail.push([], parts);
	}
	for (const f of res.footnotes) tail.push(textCells(f, "legend"));
	for (const wn of res.warnings) tail.push(textCells(`! ${wn}`, "text.warn"));
	if (extra) tail.push(...extra(res));
	const out = vstack([...top, body, ...(tail.length ? [fromRows(w, tail)] : [])], 0, w);
	const off = top.length;
	void off;
	return out;
}

function offsetAnchors(m: Map<string, Anchor>, dy: number) {
	for (const [, a] of m) a.rect = { ...a.rect, y: a.rect.y + dy };
}

export function dagBlock(el: El, width: number, path: string, ctx: Ctx): { block: Block; anchors: Map<string, Anchor> } {
	const p = el.props;
	const res = layoutOnce(el, width, () => dag((p.nodes ?? []).map((n: El) => ({ id: n.props.id, label: n.props.label, status: n.props.status })), p.edges ?? [], { direction: p.direction ?? null, maxWidth: width }));
	const inner = resultBlock(res, p.title, path);
	const anchors = new Map<string, Anchor>();
	const dy = p.title ? 1 : 0;
	for (const n of res.nodes) anchors.set(n.id, { rect: { ...(n.area ?? n.rect), y: (n.area ?? n.rect).y + dy }, targetId: `node:${path}:${n.id}` });
	const block = panBlock(inner, width, `pan:${path}`, ctx);
	remapAnchors(anchors, inner, block, ctx.state.pan[`pan:${path}`] ?? 0);
	return { block, anchors };
}

export function erdBlock(el: El, width: number, path: string, ctx: Ctx): { block: Block; anchors: Map<string, Anchor> } {
	const p = el.props;
	const res = layoutOnce(el, width, () => erd((p.entities ?? []).map((e: El) => ({ name: e.props.name, fields: e.props.fields })), (p.relations ?? []).map((r: El) => ({ from: r.props.from, to: r.props.to, kind: r.props.kind, label: r.props.label })), { maxWidth: width }));
	const inner = resultBlock(res, p.title, path);
	const anchors = new Map<string, Anchor>();
	const dy = p.title ? 1 : 0;
	for (const ent of (p.entities ?? []) as El[]) {
		const node = res.nodes.find((n) => n.id === ent.props.name);
		if (!node) continue;
		anchors.set(String(ent.props.name), { rect: { ...node.rect, y: node.rect.y + dy }, targetId: `node:${path}:${node.id}` });
		((ent.props.fields ?? []) as string[]).forEach((f, i) => {
			const col = String(f).trim().split(/\s+/)[0];
			if (col) anchors.set(`${ent.props.name}.${col}`, { rect: { x: node.rect.x + 1, y: node.rect.y + dy + 3 + i, w: Math.max(1, node.rect.w - 2), h: 1 }, badge: [node.rect.x + node.rect.w - 2, node.rect.y + dy + 3 + i] });
		});
	}
	const block = panBlock(inner, width, `pan:${path}`, ctx);
	remapAnchors(anchors, inner, block, ctx.state.pan[`pan:${path}`] ?? 0);
	return { block, anchors };
}

export function infraBlock(el: El, width: number, path: string, ctx: Ctx): { block: Block; anchors: Map<string, Anchor> } {
	const p = el.props;
	const zones = (p.zones ?? []).map((z: El) => ({ name: z.props.name, tone: z.props.tone, nodes: (z.props.nodes ?? []).map((n: El) => ({ id: n.props.id, label: n.props.label, kind: n.props.kind, status: n.props.status, detail: n.props.detail })) }));
	const links = (p.links ?? []).map((l: El) => ({ from: l.props.from, to: l.props.to, label: l.props.label, style: l.props.style }));
	const res = layoutOnce(el, width, () => infra(zones, links, { direction: p.direction ?? null, maxWidth: width }));
	const inner = resultBlock(res, p.title, path);
	const anchors = new Map<string, Anchor>();
	const dy = p.title ? 1 : 0;
	for (const n of res.nodes) anchors.set(n.id, { rect: { ...(n.area ?? n.rect), y: (n.area ?? n.rect).y + dy }, targetId: `node:${path}:${n.id}` });
	for (const z of res.zones ?? []) anchors.set(`zone:${z.name}`, { rect: { x: z.rect.x, y: z.rect.y + dy, w: z.rect.w, h: 1 } });
	for (const e of res.edges) {
		const c = e.labelCells[0] ?? e.cells[Math.floor(e.cells.length / 2)];
		if (c) anchors.set(`${e.from}>${e.to}`, { rect: { x: Math.max(0, c[0] - 1), y: c[1] + dy, w: Math.max(3, e.labelCells.length + 2), h: 1 } });
	}
	const block = panBlock(inner, width, `pan:${path}`, ctx);
	remapAnchors(anchors, inner, block, ctx.state.pan[`pan:${path}`] ?? 0);
	return { block, anchors };
}

export function graphBlock(el: El, width: number, path: string, ctx: Ctx): { block: Block; anchors: Map<string, Anchor> } {
	const p = el.props;
	const nodes = (p.nodes ?? []).map((n: El) => ({ id: n.props.id, label: n.props.label, kind: n.props.kind, status: n.props.status }));
	const edges = (p.edges ?? []).map((e: El) => ({ from: e.props.from, to: e.props.to, label: e.props.label, style: e.props.style }));
	const res = layoutOnce(el, width, () => graph(nodes, edges, { direction: p.direction ?? null, maxWidth: width }));
	const inner = resultBlock(res, p.title, path);
	const anchors = new Map<string, Anchor>();
	const dy = p.title ? 1 : 0;
	for (const n of res.nodes) anchors.set(n.id, { rect: { ...(n.area ?? n.rect), y: (n.area ?? n.rect).y + dy }, targetId: `node:${path}:${n.id}` });
	// an edge sits where its label is, or half way along it; the second edge between a pair is `a>b#2`
	const keys = graphEdgeKeys(res.edges);
	res.edges.forEach((e, i) => {
		const c = e.labelCells[0] ?? e.cells[Math.floor(e.cells.length / 2)];
		if (!c) return;
		const a: Anchor = { rect: { x: Math.max(0, c[0] - 1), y: c[1] + dy, w: Math.max(3, e.labelCells.length + 2), h: 1 } };
		// a label that stands on its own line (`──retry──`) has no blank beside it: the badge takes the dash after it, or before it
		if (e.labelCells.length) {
			const first = e.labelCells[0];
			const last = e.labelCells[e.labelCells.length - 1];
			const dash = (x: number) => ["─", "┄", "│", "┆"].includes(res.rows[first[1]]?.[x]?.ch ?? "");
			const blank = (x: number) => res.rows[first[1]]?.[x]?.ch === " ";
			if (!blank(last[0] + 1) && !blank(first[0] - 1)) {
				const x = dash(last[0] + 1) ? last[0] + 1 : dash(first[0] - 1) ? first[0] - 1 : -1;
				if (x >= 0) {
					a.badge = [x, first[1] + dy];
					a.badgeForce = true;
				}
			}
		}
		anchors.set(keys[i], a);
	});
	const block = panBlock(inner, width, `pan:${path}`, ctx);
	remapAnchors(anchors, inner, block, ctx.state.pan[`pan:${path}`] ?? 0);
	return { block, anchors };
}

/** after panning by `dx`, anchors must follow the targets they point at */
function remapAnchors(anchors: Map<string, Anchor>, inner: Block, panned: Block, dx: number) {
	if (panned === inner || !dx) return;
	for (const [, a] of anchors) {
		a.rect = { ...a.rect, x: a.rect.x - dx };
		if (a.badge) a.badge = [a.badge[0] - dx, a.badge[1]];
	}
}

export { offsetAnchors, panBlock, textWidth };
