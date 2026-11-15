// What a pointer does to a block that is wider than its pane. Events in, actions out: no terminal and no pi, so the cases that
// matter (a sideways flick, a drag on the thumb, a tap after a flick) are tested with plain objects.
//
// Why a recognizer at all: pi-tui understands only the vertical wheel. A horizontal one (SGR buttons 66 and 67) reaches a
// widget as a `press` with button "right" or "none" that is never released, and while pi believes that press is still down
// it does not turn the next tap into a `click`. The recognizer pans on those presses, remembers that it saw one, and
// recognises the next tap itself from its press and release. Everything else about taps stays with pi's `click`.
import { panAreaAt, targetAt } from "./interact.ts";
import { clampPan, panFromTrack } from "./pan.ts";
import type { Block, Target } from "./types.ts";

/** The fields of pi's mouse event that are used. Coordinates are local to the block. */
export interface MouseIn {
	type: string;
	button: string;
	x: number;
	y: number;
	shift: boolean;
	alt: boolean;
	wheelDelta?: number;
}

export type Action =
	| { kind: "pan"; key: string; to: number; capture?: boolean }
	| { kind: "tap"; x: number; y: number }
	/** a click that was already handled as a tap */
	| { kind: "swallow" }
	| { kind: "none" };

/** Columns for one notch of a wheel or one horizontal flick event. */
export const WHEEL_COLUMNS = 3;

const NONE: Action = { kind: "none" };
const same = (a: { x: number; y: number } | null, x: number, y: number) => !!a && a.x === x && a.y === y;

export class Recognizer {
	/** pi has been sent a press that no release will match (a horizontal flick) */
	stuck = false;
	private pressAt: { x: number; y: number } | null = null;
	private ignoreClickAt: { x: number; y: number } | null = null;
	/** the track being dragged: where it is and what it scrolls */
	private drag: { key: string; track: Target["rect"]; total: number; view: number } | null = null;

	reset(): void {
		this.stuck = false;
		this.pressAt = null;
		this.ignoreClickAt = null;
		this.drag = null;
	}

	private shift(block: Block, pan: Record<string, number>, ev: MouseIn, columns: number): Action {
		const sc = panAreaAt(block, ev.x, ev.y)?.scroll;
		if (!sc) return NONE;
		return { kind: "pan", key: sc.key, to: clampPan((pan[sc.key] ?? 0) + columns, sc.total, sc.view) };
	}

	feed(ev: MouseIn, block: Block, pan: Record<string, number>): Action {
		switch (ev.type) {
			case "press": {
				if (ev.button === "none" || ev.button === "right") {
					// a horizontal wheel: "none" is SGR 67 (right), "right" is SGR 66 (left)
					const a = this.shift(block, pan, ev, ev.button === "none" ? WHEEL_COLUMNS : -WHEEL_COLUMNS);
					if (a.kind !== "none") this.stuck = true;
					return a;
				}
				this.ignoreClickAt = null; // a new gesture: the click that followed an earlier tap is long gone
				if (ev.button !== "left") return NONE;
				this.pressAt = { x: ev.x, y: ev.y };
				const t = targetAt(block, ev.x, ev.y);
				if (t?.kind === "pan" && t.scroll?.part === "track") {
					this.drag = { key: t.scroll.key, track: t.rect, total: t.scroll.total, view: t.scroll.view };
					return { kind: "pan", key: t.scroll.key, to: panFromTrack(ev.x, t.rect, t.scroll.total, t.scroll.view), capture: true };
				}
				return NONE;
			}
			case "drag": {
				const d = this.drag;
				if (!d || ev.button !== "left") return NONE;
				return { kind: "pan", key: d.key, to: panFromTrack(ev.x, d.track, d.total, d.view), capture: true };
			}
			case "release": {
				if (ev.button !== "left") return NONE;
				this.drag = null;
				const wasStuck = this.stuck;
				const press = this.pressAt;
				this.pressAt = null;
				this.stuck = false; // pi has seen a release: whatever it was holding is let go
				if (wasStuck && same(press, ev.x, ev.y)) {
					this.ignoreClickAt = { x: ev.x, y: ev.y };
					return { kind: "tap", x: ev.x, y: ev.y };
				}
				return NONE;
			}
			case "click": {
				this.stuck = false; // pi sent a click: it is healthy
				if (same(this.ignoreClickAt, ev.x, ev.y)) {
					this.ignoreClickAt = null;
					return { kind: "swallow" };
				}
				this.ignoreClickAt = null;
				return NONE;
			}
			case "wheel": {
				if (!ev.shift && !ev.alt) return NONE; // the plain wheel scrolls the transcript
				const d = Math.sign(ev.wheelDelta ?? 0);
				return d ? this.shift(block, pan, ev, d * WHEEL_COLUMNS) : NONE;
			}
			default:
				return NONE;
		}
	}
}
