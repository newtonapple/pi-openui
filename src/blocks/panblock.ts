// The one place a block wider than its pane is cropped, scrolled and given its pan bar (see pan.ts for the maths).
import type { Ctx, Block, Target } from "./types.ts";
import { barLayout, barRow, clampPan, DEFAULT_FINE_STEP, frozenFor } from "./pan.ts";
import { cell, padRow } from "./util.ts";

/**
 * Crop a block wider than `width` to a window starting at the saved pan offset, and put a pan bar under it: the one place that
 * says "there is more" and the buttons that move it. A block that fits is returned as it is, with no bar.
 * `opts.edges` are the left edges of a table's columns, so a tap lands on a column. `opts.frozen` is how many cells at the left
 * stay in place while the rest scrolls (a table's first column), when that is at most 40% of the view.
 */
export function panBlock(inner: Block, width: number, key: string, ctx: Ctx, opts: { edges?: number[]; frozen?: number } = {}): Block {
	if (inner.w <= width) {
		delete ctx.state.pan[key]; // it fits now (the pane grew): nothing is left to scroll, and a later narrow pane starts at the left
		return inner;
	}
	const pan = clampPan(ctx.state.pan[key] ?? 0, inner.w, width);
	ctx.state.pan[key] = pan;
	const F = frozenFor(opts.frozen ?? 0, width);
	const rows = inner.rows.map((r) => {
		const full = padRow(r, inner.w);
		// the window starts after the frozen cells: at pan 0 this is the plain crop
		const seg = full.slice(F + pan, pan + width);
		if (seg.length && seg[0].ch === "") seg[0] = cell(" ");
		if (seg.length && pan + width < inner.w && seg[seg.length - 1].ch !== "" && full[pan + width]?.ch === "") seg[seg.length - 1] = cell(" ");
		return F ? full.slice(0, F).concat(seg) : seg;
	});
	const targets: Target[] = inner.targets.map((t) => {
		if (F && t.rect.x < F) return t; // in the frozen part, or a row across it: always where it is
		return { ...t, rect: { ...t.rect, x: t.rect.x - pan }, pan: { key, x: t.rect.x, w: t.rect.w, view: width, total: inner.w, ...(F ? { min: F } : {}) } };
	});
	const y = rows.length;
	const bar = barLayout(width, pan, inner.w, width);
	const step = ctx.services.settings?.scrollStep ?? DEFAULT_FINE_STEP;
	type Part = "left" | "right" | "pageleft" | "pageright" | "track";
	const scroll = (part: Part) => ({ key, part, total: inner.w, view: width, edges: opts.edges, step });
	const part = (id: Part, label: string, r: { x: number; w: number }): Target => ({ id: `bar:${key}:${id}`, kind: "pan", rect: { x: r.x, y, w: r.w, h: 1 }, label, scroll: scroll(id) });
	if (bar.pageLeft) targets.push(part("pageleft", "page left", bar.pageLeft));
	targets.push(part("left", "scroll left", bar.left), part("track", "scroll", bar.track), part("right", "scroll right", bar.right));
	if (bar.pageRight) targets.push(part("pageright", "page right", bar.pageRight));
	// the area carries the numbers a wheel or a drag needs (`part` means nothing here)
	targets.push({ id: `area:${key}`, kind: "panarea", rect: { x: 0, y: 0, w: width, h: y + 1 }, label: "", scroll: scroll("track") });
	return { w: width, rows: [...rows, barRow(width, pan, inner.w, width)], targets };
}
