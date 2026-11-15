import { textWidth, truncateText, type Cell, type Rect } from "../diagram/canvas.ts";
import type { Block } from "./types.ts";
import { frozenFor, pinBudget } from "./pan.ts";
import { cell, fromRows, padRow, textCells } from "./util.ts";

export interface TableAnchors {
	rows: Rect[];
	cols: Rect[];
	cells: Rect[][];
}

const NUMERIC = /^[-+]?[\d.,]+\s*(%|ms|s|kb|mb|gb|tb|x)?$/i;

/**
 * `opts.minCol` is the user's minimum column width. With it, a table that does not fit shrinks its widest columns only down to
 * min(natural, minCol); if even that does not fit, every column takes its natural width and the block is wider than the pane (the
 * caller scrolls it): a table that scrolls cuts nothing, whatever a cell holds. Without it (a markdown table, which has nowhere to scroll) the old rule stands: columns shrink
 * to three characters and no further. `edges` are the left borders of the columns, so a scroll step can land on one.
 *
 * `opts.pin` lists the columns (indexes) that stay in place while the table scrolls; left out, nothing is pinned and the whole table
 * scrolls. Only a table that is wider than the pane has pinned columns, and then they are drawn first, in the order they have in the
 * table (`order` says which column is where). They take at most half the pane (`pinBudget`): they are considered in the order
 * listed, and one that does not fit is skipped. It is never squeezed: a pinned column that lost text could not be scrolled to.
 * `frozen` is their width with their borders, 0 when nothing is pinned.
 */
export interface TableBlock {
	block: Block;
	anchors: TableAnchors;
	edges: number[];
	frozen: number;
	order: number[];
	/** per body row and drawn column: the cell was cut to fit (it ends in an ellipsis). Only a table that fits by squeezing cuts anything. */
	cut: boolean[][];
	/** per drawn column: the header was cut */
	headCut: boolean[];
}

export function tableBlock(columns: string[], rows: Array<Array<string | number>>, width: number, opts: { minCol?: number; pin?: number[] } = {}): TableBlock {
	const n = Math.max(1, columns.length);
	const str = (v: string | number) => String(v ?? "").replace(/\s+/g, " ").trim();
	const data0 = rows.map((r) => columns.map((_, i) => str(r[i] ?? "")));
	const heads0 = columns.map(str);
	const numeric0 = heads0.map((_, i) => data0.length > 0 && data0.every((r) => r[i] === "" || NUMERIC.test(r[i])));
	const nat = heads0.map((h, i) => Math.max(textWidth(h), ...data0.map((r) => textWidth(r[i])), 1));
	const avail = Math.max(n, width - (3 * n + 1));
	const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
	const minCol = opts.minCol ?? 3;
	const floors = nat.map((x) => Math.min(x, minCol));
	let w = nat.slice();
	let order = heads0.map((_, i) => i);
	let frozen = 0;
	if (sum(w) > avail) {
		if (sum(floors) <= avail || opts.minCol === undefined) {
			// shrink the widest column, one character at a time, never below its floor
			let total = sum(w);
			while (total > avail) {
				let k = -1;
				for (let i = 0; i < n; i++) if (w[i] > floors[i] && (k < 0 || w[i] > w[k])) k = i;
				if (k < 0) break;
				w[k]--;
				total--;
			}
		} else {
			// the floors do not fit either: every column at its natural width, the table is wider than the pane and scrolls, and what
			// the model asked to pin is pinned if there is room for it
			w = nat.slice();
			const budget = pinBudget(width);
			const chosen: number[] = [];
			let used = 1; // the left border
			for (const i of opts.pin ?? []) {
				if (!Number.isInteger(i) || i < 0 || i >= n || chosen.includes(i)) continue;
				if (used + w[i] + 3 > budget) continue; // not squeezed: text that is cut here could never be scrolled to
				used += w[i] + 3;
				chosen.push(i);
			}
			if (chosen.length && chosen.length < n) {
				chosen.sort((a, b) => a - b);
				order = [...chosen, ...order.filter((i) => !chosen.includes(i))];
				frozen = used;
			}
		}
	}
	// from here on the columns are in the order they are drawn
	const by = <T>(a: T[]): T[] => order.map((i) => a[i]);
	const heads = by(heads0);
	const data = data0.map(by);
	const numeric = by(numeric0);
	w = by(w);
	const total = w.reduce((a, b) => a + b, 0) + 3 * n + 1;
	const line = (l: string, m: string, r: string): Cell[] => {
		const out: Cell[] = [cell(l, "table.border")];
		w.forEach((cw, i) => {
			for (let k = 0; k < cw + 2; k++) out.push(cell("─", "table.border"));
			out.push(cell(i === n - 1 ? r : m, "table.border"));
		});
		return out;
	};
	const rowCells = (vals: string[], role: string, align: boolean[]): Cell[] => {
		const out: Cell[] = [cell("│", "table.border")];
		vals.forEach((v, i) => {
			const t = truncateText(v, w[i]);
			const tw = textWidth(t);
			const pad = w[i] - tw;
			out.push(cell(" "));
			if (align[i]) for (let k = 0; k < pad; k++) out.push(cell(" "));
			out.push(...textCells(t, role));
			if (!align[i]) for (let k = 0; k < pad; k++) out.push(cell(" "));
			out.push(cell(" "), cell("│", "table.border"));
		});
		return out;
	};
	const out: Cell[][] = [line("┌", "┬", "┐")];
	out.push(rowCells(heads, "table.head", heads.map(() => false)));
	out.push(line("├", "┼", "┤"));
	data.forEach((r) => out.push(rowCells(r, "", numeric)));
	out.push(line("└", "┴", "┘"));
	const colX: number[] = [];
	let x = 1;
	w.forEach((cw) => {
		colX.push(x + 1);
		x += cw + 3;
	});
	const anchors: TableAnchors = {
		cols: w.map((cw, i) => ({ x: colX[i], y: 1, w: cw, h: 1 })),
		rows: data.map((_, ri) => ({ x: 0, y: 3 + ri, w: total, h: 1 })),
		cells: data.map((_, ri) => w.map((cw, i) => ({ x: colX[i], y: 3 + ri, w: cw, h: 1 }))),
	};
	return {
		block: fromRows(total, out.map((r) => padRow(r, total))),
		anchors,
		edges: colX.map((x) => x - 2),
		frozen,
		order,
		cut: data.map((r) => r.map((v, i) => textWidth(v) > w[i])),
		headCut: heads.map((h, i) => textWidth(h) > w[i]),
	};
}

/**
 * How `panBlock` should scroll a table. With the first column frozen the window starts F cells after the offset, so an offset that
 * puts a column border there is the border's position minus F (and the start, 0, stays a place to stop). Without that a step lands
 * in the middle of a column.
 */
export function tablePan(t: { edges: number[]; frozen: number }, width: number): { edges: number[]; frozen: number } {
	const F = frozenFor(t.frozen, width);
	return { edges: F ? [0, ...t.edges.map((e) => e - F).filter((e) => e > 0)] : t.edges, frozen: t.frozen };
}

/**
 * The columns a Table's `pin` names, as indexes: by header, the way the table draws it (spacing collapsed). Undefined when the
 * model did not say (the first column is pinned then); a name that matches nothing is left out.
 */
export function pinIndexes(pin: unknown, columns: string[]): number[] | undefined {
	if (!Array.isArray(pin)) return undefined;
	const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
	const heads = columns.map(norm);
	return pin.map((name) => heads.indexOf(norm(name))).filter((i) => i >= 0);
}

/**
 * The cells a table cut to fit, each with what it takes to read it whole: the anchor key a tooltip would use (`cell:3.Notes`,
 * `col:Notes`), where it is drawn, its full text as it was written, and a short name for the hover line. For a Table and a
 * Markdown table alike.
 */
export function cutCells(t: TableBlock, columns: string[], rows: Array<Array<string | number>>): Array<{ key: string; rect: Rect; full: string; label: string }> {
	const out: Array<{ key: string; rect: Rect; full: string; label: string }> = [];
	const head = columns.map((c) => String(c ?? ""));
	t.headCut.forEach((cut, ci) => {
		if (cut) out.push({ key: `col:${head[t.order[ci]]}`, rect: t.anchors.cols[ci], full: head[t.order[ci]].trim(), label: `column ${head[t.order[ci]].replace(/\s+/g, " ").trim()}` });
	});
	t.cut.forEach((row, ri) =>
		row.forEach((cut, ci) => {
			const col = t.order[ci];
			if (cut) out.push({ key: `cell:${ri + 1}.${head[col]}`, rect: t.anchors.cells[ri][ci], full: String(rows[ri]?.[col] ?? "").trim(), label: `${head[col].replace(/\s+/g, " ").trim()}, row ${ri + 1}` });
		}),
	);
	return out;
}
