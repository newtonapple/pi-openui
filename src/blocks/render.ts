// Dispatcher: a compiled element tree -> a Block (rows of cells + click/focus targets).
import type { El } from "../lang/library.ts";
import { barChart, lineArea, pieChart, radarChart } from "./charts.ts";
import { codeBlock } from "./code.ts";
import { addWholeItem, answerBar, button, callout, card, choice, faq, image, metric, stack, tabs, text, withTips, type Anchor } from "./core.ts";
import { dagBlock, erdBlock, graphBlock, infraBlock, panBlock } from "./diagrams.ts";
import { geoMap } from "./geo.ts";
import { markdownBlock } from "./markdown.ts";
import { sequence } from "./sequence.ts";
import { collectChoices } from "./choice.ts";
import { decorateNotes, widgetTitle } from "./notes.ts";
import { frozenFor, shiftAnchor } from "./pan.ts";
import { cutCells, pinIndexes, tableBlock, tablePan } from "./table.ts";
import type { Block, Ctx, Services, WState } from "./types.ts";
import { blank, textBlock, vstack } from "./util.ts";

/** Most rows one widget may have. The validation limits keep a widget far below this; it is the backstop, not the plan. */
export const MAX_ROWS = 1500;

function capRows(block: Block, warnings: string[]): Block {
	if (block.rows.length <= MAX_ROWS) return block;
	warnings.push(`${block.rows.length - MAX_ROWS} more rows are not drawn: a widget is limited to ${MAX_ROWS} rows. Show less`);
	return { w: block.w, rows: block.rows.slice(0, MAX_ROWS), targets: block.targets.filter((t) => t.rect.y + t.rect.h <= MAX_ROWS) };
}

export function renderTree(root: El, width: number, state: WState, services: Services = {}): { block: Block; warnings: string[] } {
	const warnings: string[] = [];
	const ctx: Ctx = { state, warnings, services, tabs: [], render: (el, w, path) => renderEl(el, w, path, ctx) };
	const w = Math.max(20, width);
	let base = capRows(renderEl(root, w, "0", ctx), warnings);
	// every Choice of the widget, also on tabs nobody opened, shares one bar under the widget (after the row cap, so it is never cut)
	const choices = collectChoices(root);
	if (choices.length) base = vstack([base, answerBar(choices, state, widgetTitle(root), w)], 1, Math.max(base.w, w));
	const block = decorateNotes(base, state, w);
	return { block, warnings };
}

/**
 * The net under every component. Each one shortens its own text or scrolls on its own, so nothing is wider than its pane today; a
 * component that is wider anyway (a new one, a layout that cannot give) gets the pan bar here, never a silent cut by the widget.
 */
export function guardWidth(block: Block, width: number, path: string, ctx: Ctx): Block {
	return block.w > width ? panBlock(block, width, `pan:${path}~`, ctx) : block;
}

export function renderEl(el: El, width: number, path: string, ctx: Ctx): Block {
	try {
		const block = guardWidth(renderInner(el, width, path, ctx), width, path, ctx);
		addWholeItem(el, block, path, ctx);
		return block;
	} catch (e) {
		ctx.warnings.push(`${el.type} could not be drawn: ${(e as Error).message}`);
		return textBlock(`[${el.type} could not be drawn]`, width, "text.warn");
	}
}

function renderInner(el: El, width: number, path: string, ctx: Ctx): Block {
	const p = el.props;
	switch (el.type) {
		case "Stack":
			return stack(el, width, ctx, path);
		case "Text":
			return text(el, width);
		case "Card":
			return card(el, width, ctx, path);
		case "Callout":
			return callout(el, width);
		case "Button":
			return button(el, width, path);
		case "Choice":
			return choice(el, width, ctx, path);
		case "Tabs":
			return tabs(el, width, ctx, path);
		case "Faq":
			return faq(el, width, ctx, path);
		case "Markdown":
			return markdownBlock(String(p.text ?? ""), width, ctx, path);
		case "CodeBlock": {
			const id = `copy:${path}`;
			return codeBlock(String(p.code ?? ""), p.language, p.title, width, id, ctx.state.copied === id, { ctx, key: `pan:${path}` });
		}
		case "Metric": {
			const m = metric(el, width, path);
			return withTips(el, m.block, m.anchors as Map<string, Anchor>, path, ctx, width);
		}
		case "Image": {
			const m = image(el, width, path, ctx);
			return withTips(el, m.block, m.anchors, path, ctx, width);
		}
		case "Table": {
			const cols: string[] = (p.columns ?? []).map(String);
			const t = tableBlock(p.columns ?? [], p.rows ?? [], width, { minCol: ctx.services.settings?.tableMinCol ?? 12, pin: pinIndexes(p.pin, cols) });
			const anchors = new Map<string, Anchor>();
			const pad = (c: { x: number; w: number }, y: number): [number, number] => [c.x + c.w, y];
			const lastCol = t.anchors.cols[t.anchors.cols.length - 1];
			t.anchors.rows.forEach((r, i) => anchors.set(`row:${i + 1}`, { rect: r, badge: lastCol ? pad(lastCol, r.y) : undefined }));
			// the columns may be drawn in another order (pinned ones first): the names follow them
			t.anchors.cols.forEach((r, i) => anchors.set(`col:${cols[t.order[i]]}`, { rect: r, badge: pad(r, r.y) }));
			t.anchors.cells.forEach((rs, ri) => rs.forEach((r, ci) => anchors.set(`cell:${ri + 1}.${cols[t.order[ci]]}`, { rect: r, badge: pad(r, r.y) })));
			// a cell that was cut to fit can be read whole: it gets a target (and a panel) of its own
			for (const c of cutCells(t, cols, p.rows ?? [])) {
				const a = anchors.get(c.key);
				if (a) Object.assign(a, { full: c.full, label: c.label });
			}
			const key = `pan:${path}`;
			const pb = panBlock(t.block, width, key, ctx, tablePan(t, width));
			if (pb !== t.block) for (const [, a] of anchors) shiftAnchor(a, ctx.state.pan[key] ?? 0, frozenFor(t.frozen, width));
			return withTips(el, pb, anchors, path, ctx, width);
		}
		case "BarChart": {
			const b = barChart(el, width);
			return withTips(el, b.block, b.anchors, path, ctx, width);
		}
		case "LineChart":
		case "AreaChart": {
			const c = lineArea(el, width, el.type === "AreaChart");
			return withTips(el, c.block, c.anchors, path, ctx, width);
		}
		case "PieChart": {
			const c = pieChart(el, width);
			return withTips(el, c.block, c.anchors, path, ctx, width);
		}
		case "RadarChart": {
			const c = radarChart(el, width);
			return withTips(el, c.block, c.anchors, path, ctx, width);
		}
		case "GeoMap": {
			const g = geoMap(el, width);
			return withTips(el, g.block, g.anchors, path, ctx, width);
		}
		case "Dag": {
			const d = dagBlock(el, width, path, ctx);
			return withTips(el, d.block, d.anchors, path, ctx, width);
		}
		case "Graph": {
			const d = graphBlock(el, width, path, ctx);
			return withTips(el, d.block, d.anchors, path, ctx, width);
		}
		case "Erd": {
			const d = erdBlock(el, width, path, ctx);
			return withTips(el, d.block, d.anchors, path, ctx, width);
		}
		case "InfraMap": {
			const d = infraBlock(el, width, path, ctx);
			return withTips(el, d.block, d.anchors, path, ctx, width);
		}
		case "SequenceDiagram": {
			const s = sequence(el, width, path);
			const b = panBlock(s.block, width, `pan:${path}`, ctx);
			if (b !== s.block) {
				const dx = ctx.state.pan[`pan:${path}`] ?? 0;
				for (const [, a] of s.anchors) {
					a.rect = { ...a.rect, x: a.rect.x - dx };
					if (a.badge) a.badge = [a.badge[0] - dx, a.badge[1]];
				}
			}
			return withTips(el, b, s.anchors, path, ctx, width);
		}
		default:
			ctx.warnings.push(`${el.type} cannot be drawn on its own`);
			return blank(width, 0);
	}
}

void vstack;
