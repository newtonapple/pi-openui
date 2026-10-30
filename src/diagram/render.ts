// DiagramResult -> terminal lines (legend, footnotes, focus, horizontal crop).

import { rowsToLines, type Cell, type Palette } from "./canvas.ts";
import type { DiagramResult } from "./layeredDiagram.ts";

export interface RenderOpts {
	palette?: Palette;
	/** node id to highlight */
	focusId?: string | null;
	hoverId?: string | null;
	/** crop to this many columns starting at panX */
	maxWidth?: number;
	panX?: number;
	title?: string;
	legend?: boolean;
}

function textRow(text: string, role: string): Cell[] {
	return Array.from(text).map((ch) => ({ ch, role }));
}

export function toLines(res: DiagramResult, opts: RenderOpts = {}): string[] {
	let rows: Cell[][] = res.rows.map((r) => r.map((c) => ({ ...c })));
	const mark = (id: string | null | undefined, suffix: string) => {
		if (!id) return;
		const n = res.nodes.find((x) => x.id === id);
		if (!n) return;
		for (let y = n.rect.y; y < n.rect.y + n.rect.h; y++)
			for (let x = n.rect.x; x < n.rect.x + n.rect.w; x++) {
				const c = rows[y]?.[x];
				if (c && c.role) c.role = `${c.role}.${suffix}`;
			}
	};
	mark(opts.hoverId, "hover");
	mark(opts.focusId, "focus");
	const pad = (r: Cell[], w: number) => (r.length >= w ? r : r.concat(Array.from({ length: w - r.length }, () => ({ ch: " ", role: "" }))));
	if (opts.maxWidth !== undefined && res.width > opts.maxWidth) {
		const px = Math.max(0, Math.min(opts.panX ?? 0, res.width - opts.maxWidth));
		rows = rows.map((r) => {
			let seg = pad(r, res.width).slice(px, px + opts.maxWidth!);
			// do not start or end in the middle of a wide character
			if (seg.length && seg[0].ch === "") seg[0] = { ch: " ", role: "" };
			if (seg.length && px + opts.maxWidth! < res.width && seg[seg.length - 1].ch !== "" && false) seg = seg.slice();
			return seg;
		});
	}
	const out: Cell[][] = [];
	if (opts.title) out.push(textRow(opts.title, "title"));
	out.push(...rows);
	if (opts.legend !== false && res.legend.length) {
		const parts: Cell[] = [];
		res.legend.forEach((e, i) => {
			if (i) parts.push(...textRow("  ", "legend"));
			parts.push(...textRow(e.glyph, e.role), ...textRow(` ${e.text}`, "legend"));
		});
		out.push([], parts);
	}
	for (const f of res.footnotes) out.push(textRow(f, "legend"));
	return rowsToLines(out, opts.palette);
}
