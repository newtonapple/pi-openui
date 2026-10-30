// Interaction logic, independent of any terminal: hit testing, activation, keyboard navigation, pan reveal.
import type { Block, Target, WState } from "./types.ts";

export interface Env {
	/** send text to the assistant as the user's next turn */
	send(text: string): void;
	/** put text on the clipboard */
	copy(text: string): void;
	/** show a short notice under the widget */
	note(text: string): void;
}

const area = (t: Target) => t.rect.w * t.rect.h;

/** The most specific target at a point: an exact cell match (a pie wedge) beats a rectangle, a small rectangle beats a big one. */
export function targetAt(block: Block, x: number, y: number): Target | null {
	let best: Target | null = null;
	let bestScore = Infinity;
	for (const t of block.targets) {
		const r = t.rect;
		const inRect = x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && r.x + r.w > 0 && r.x < block.w;
		const inCells = !!t.cells && t.cells.some(([cx, cy]) => cx === x && cy === y);
		if (!inRect && !inCells) continue;
		const score = inCells ? 0 : area(t);
		if (score < bestScore) {
			bestScore = score;
			best = t;
		}
	}
	return best;
}

export function readingOrder(block: Block): Target[] {
	return [...block.targets].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x || a.id.localeCompare(b.id));
}

export type NavKey = "next" | "prev" | "left" | "right" | "up" | "down";

export function nextTarget(block: Block, currentId: string | null, key: NavKey): Target | null {
	const order = readingOrder(block);
	if (!order.length) return null;
	const cur = order.find((t) => t.id === currentId) ?? null;
	if (key === "next" || key === "prev") {
		if (!cur) return key === "next" ? order[0] : order[order.length - 1];
		const i = order.indexOf(cur);
		return order[(i + (key === "next" ? 1 : -1) + order.length) % order.length];
	}
	if (!cur) return order[0];
	const cx = (t: Target) => t.rect.x + t.rect.w / 2;
	const cy = (t: Target) => t.rect.y + t.rect.h / 2;
	const horizontal = key === "left" || key === "right";
	// "right of" means the rectangles are separated along that axis: a full-width row below is below, not to the right
	const inDirection = order.filter((t) => {
		if (t === cur) return false;
		const r = t.rect;
		const c = cur.rect;
		return key === "left" ? r.x + r.w <= c.x : key === "right" ? r.x >= c.x + c.w : key === "up" ? r.y + r.h <= c.y : r.y >= c.y + c.h;
	});
	// targets that share the row (sideways) or the column (up and down) win over anything nearer on another line
	const overlaps = (t: Target) => (horizontal ? t.rect.y < cur.rect.y + cur.rect.h && cur.rect.y < t.rect.y + t.rect.h : t.rect.x < cur.rect.x + cur.rect.w && cur.rect.x < t.rect.x + t.rect.w);
	const aligned = inDirection.filter(overlaps);
	const pool = aligned.length ? aligned : inDirection;
	let best: Target | null = null;
	let bestScore = Infinity;
	for (const t of pool) {
		const along = Math.abs(horizontal ? cx(t) - cx(cur) : cy(t) - cy(cur));
		const across = Math.abs(horizontal ? cy(t) - cy(cur) : cx(t) - cx(cur));
		// cells are about twice as tall as wide, so a line of difference weighs more than a column
		const score = along + across * (horizontal ? 3 : 2);
		if (score < bestScore) {
			bestScore = score;
			best = t;
		}
	}
	return best ?? cur;
}

const lastColon = (id: string) => id.lastIndexOf(":");

/** Apply a target's action. Returns true when the layout changed and the block must be rebuilt. */
export function activate(t: Target, state: WState, env: Env): boolean {
	switch (t.kind) {
		case "tab": {
			const k = lastColon(t.id);
			const path = t.id.slice(4, k);
			const i = Number(t.id.slice(k + 1));
			if (state.tab[path] === i) return false;
			state.tab[path] = i;
			state.tip = null;
			return true;
		}
		case "faq":
			state.faq[t.id] = !state.faq[t.id];
			return true;
		case "choice": {
			const k = lastColon(t.id);
			const path = t.id.slice(7, k);
			state.picked[path] = t.label;
			if (t.send) env.send(t.send);
			return true;
		}
		case "button":
			if (t.send) env.send(t.send);
			if (t.openUrl) {
				env.copy(t.openUrl);
				env.note(`link copied: ${t.openUrl}`);
			}
			return false;
		case "copy":
			if (t.copy !== undefined) env.copy(t.copy);
			state.copied = t.id;
			return true;
		case "node":
		case "image":
		case "tip": {
			const tip = t.tip;
			if (!tip || !(tip.detail || tip.code || tip.link)) return false;
			state.tip = state.tip === t.id ? null : t.id;
			return true;
		}
	}
	return false;
}

/** Scroll a wide diagram so the target is visible. Returns true when the pan changed. */
export function reveal(t: Target, state: WState): boolean {
	const p = t.pan;
	if (!p) return false;
	const cur = state.pan[p.key] ?? 0;
	let next = cur;
	if (p.x < cur) next = Math.max(0, p.x - 2);
	else if (p.x + p.w > cur + p.view) next = Math.min(p.total - p.view, p.x + p.w - p.view + 2);
	if (next === cur) return false;
	state.pan[p.key] = next;
	return true;
}

/** The one-line explanation shown for a hovered or focused target. */
export function describe(t: Target): string {
	const bits: string[] = [];
	switch (t.kind) {
		case "button":
			bits.push(`[${t.label}]`, t.send ? `sends "${t.send.length > 70 ? t.send.slice(0, 69) + "…" : t.send}"` : t.openUrl ? `link ${t.openUrl}` : "");
			break;
		case "choice":
			bits.push(t.label, "choose to answer");
			break;
		case "tab":
			bits.push(`tab ${t.label}`);
			break;
		case "faq":
			bits.push(t.label, "Enter to open or close");
			break;
		case "copy":
			bits.push("copy the code to the clipboard");
			break;
		case "image":
			bits.push(t.label);
			break;
		default:
			bits.push(t.label);
	}
	if (t.tip?.hint) bits.push(t.tip.hint);
	if (t.tip && (t.tip.detail || t.tip.code || t.tip.link)) bits.push("Enter for details");
	return bits.filter(Boolean).join("  ·  ");
}
