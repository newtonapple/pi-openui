// Panning a block that is wider than its pane: the maths, and the one-row bar that tells the reader it can be scrolled.
// Pure: no widget, no terminal, no pi.
import type { Cell, Rect } from "../diagram/canvas.ts";
import { cell, textCells } from "./util.ts";

/** One step of a tap or a key: three quarters of the view, so a little of what was on screen stays as a landmark. */
export const panStep = (view: number): number => Math.max(1, Math.floor((view * 3) / 4));

/** The offset kept inside 0..total-view. A block that fits has nothing to pan. */
export function clampPan(pan: number, total: number, view: number): number {
	const max = Math.max(0, Math.floor(total) - Math.floor(view));
	return Math.max(0, Math.min(Math.round(pan), max));
}

/** Where the thumb sits in a track `track` cells long: as long as the view is of the whole, at least one cell. */
export function thumbCells(track: number, pan: number, total: number, view: number): { start: number; len: number } {
	if (track <= 0) return { start: 0, len: 0 };
	if (total <= view) return { start: 0, len: track };
	const len = Math.max(1, Math.min(track, Math.round((track * view) / total)));
	const max = total - view;
	const start = Math.round(((track - len) * clampPan(pan, total, view)) / max);
	return { start: Math.max(0, Math.min(track - len, start)), len };
}

/** The offset that puts the middle of the thumb under cell `x` (a tap or a drag on the track). */
export function panFromTrack(x: number, track: { x: number; w: number }, total: number, view: number): number {
	const { len } = thumbCells(track.w, 0, total, view);
	const room = track.w - len;
	if (room <= 0 || total <= view) return 0;
	const start = Math.max(0, Math.min(room, x - track.x - len / 2));
	return clampPan((start / room) * (total - view), total, view);
}

/**
 * One tap on an arrow. Plain: `panStep` either way. With `edges` (the left edges of a table's columns, in block cells): the
 * farthest edge within one step, so a column is never left cut in half after a tap, and a left tap undoes a right tap.
 */
export function stepPan(pan: number, dir: -1 | 1, total: number, view: number, edges?: number[]): number {
	const step = panStep(view);
	let to = pan + dir * step;
	if (edges?.length) {
		const hit = dir === 1 ? edges.filter((e) => e > pan && e <= pan + step) : edges.filter((e) => e < pan && e >= pan - step);
		if (hit.length) to = dir === 1 ? Math.max(...hit) : Math.min(...hit);
	}
	return clampPan(to, total, view);
}

/** Cells one tap on a fine arrow moves, unless the user's `scroll.step` says otherwise (src/pi/config.ts). */
export const DEFAULT_FINE_STEP = 8;

/** One tap on a fine arrow: exactly `cells`, clamped. No snapping: this is for reading along. */
export function fineStepPan(pan: number, dir: -1 | 1, total: number, view: number, cells: number): number {
	return clampPan(pan + dir * Math.max(1, Math.round(cells)), total, view);
}

export interface BarLayout {
	/** the outer arrows, a page at a time; absent when the bar is too narrow for them */
	pageLeft?: Rect;
	/** the inner arrows, a few cells at a time */
	left: Rect;
	track: Rect;
	right: Rect;
	pageRight?: Rect;
	/** the range shown, e.g. `1–63/175`; empty when the bar is too narrow for it */
	label: string;
}

const ARROW = 3; // a finger needs more than one cell: ` ‹ `
const MIN_TRACK = 6;

/** ` « ‹ ████░░░░ 1–63/175 › » `: page arrows outside, fine arrows inside, the track and the range between. */
export function barLayout(width: number, pan: number, total: number, view: number): BarLayout {
	const paged = width - 4 * ARROW >= MIN_TRACK;
	const side = paged ? 2 * ARROW : ARROW;
	const mid = Math.max(0, width - 2 * side);
	let label = `${pan + 1}–${Math.min(total, pan + view)}/${total}`;
	let track = mid - (label.length + 2);
	if (track < MIN_TRACK) {
		label = "";
		track = mid;
	}
	const at = (x: number): Rect => ({ x, y: 0, w: ARROW, h: 1 });
	return {
		...(paged ? { pageLeft: at(0), pageRight: at(width - ARROW) } : {}),
		left: at(paged ? ARROW : 0),
		right: at(width - side),
		track: { x: side, y: 0, w: Math.max(0, track), h: 1 },
		label,
	};
}

/** ` « ‹ ████░░░░░░░░ 1–63/175  › » `: exactly `width` cells. An arrow that cannot move is dim. */
export function barRow(width: number, pan: number, total: number, view: number): Cell[] {
	const l = barLayout(width, pan, total, view);
	const canLeft = pan > 0;
	const canRight = pan < total - view;
	const t = thumbCells(l.track.w, pan, total, view);
	const arrow = (glyph: string, on: boolean): Cell[] => [cell(" "), cell(glyph, on ? "btn" : "text.muted"), cell(" ")];
	const row: Cell[] = [...(l.pageLeft ? arrow("«", canLeft) : []), ...arrow("‹", canLeft)];
	for (let i = 0; i < l.track.w; i++) row.push(i >= t.start && i < t.start + t.len ? cell("█", "btn") : cell("░", "text.muted"));
	if (l.label) row.push(cell(" "), ...textCells(l.label, "text.muted"), cell(" "));
	const right: Cell[] = [...arrow("›", canRight), ...(l.pageRight ? arrow("»", canRight) : [])];
	while (row.length < width - right.length) row.push(cell(" "));
	return [...row, ...right].slice(0, width);
}

/** Pinned columns never take more than this share of the pane: a pinned part that fills it would leave nothing to scroll. */
export const PIN_SHARE = 0.5;
export const pinBudget = (view: number): number => Math.floor(view * PIN_SHARE);

/** How many cells at the left stay put while the rest scrolls: `frozen` when it is within the budget, else none. */
export const frozenFor = (frozen: number, view: number): number => (frozen > 0 && frozen <= pinBudget(view) ? frozen : 0);

/**
 * Move an anchor (a rect and perhaps a badge position) to where its column is after the block was scrolled by `dx` with `frozen`
 * columns kept in place. What is behind the frozen part is cut off, so a badge or a hit area never lands on the frozen column;
 * what is entirely behind it keeps a rect one cell wide at the edge with no width (nothing to hit, nothing to draw).
 */
export function shiftAnchor<T extends { rect: Rect; badge?: [number, number] }>(a: T, dx: number, frozen: number): void {
	const r = a.rect;
	if (!dx) return;
	if (!frozen) {
		a.rect = { ...r, x: r.x - dx };
		if (a.badge) a.badge = [a.badge[0] - dx, a.badge[1]];
		return;
	}
	if (r.x < frozen) {
		if (r.x + r.w > frozen) a.rect = { ...r, w: r.w - dx }; // a row across the frozen part: its far end moves
		return; // in the frozen part: stays
	}
	let x = r.x - dx;
	let w = r.w;
	if (x < frozen) {
		w -= frozen - x;
		x = frozen;
	}
	a.rect = { ...r, x, w: Math.max(0, w) };
	if (a.badge) a.badge = a.badge[0] - dx >= frozen && w > 0 ? [a.badge[0] - dx, a.badge[1]] : undefined;
}
