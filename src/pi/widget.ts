// pi-tui component for a compiled OpenUI tree: themed colours, hover, click, keyboard, clipboard.
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { activate, describe, nextTarget, reveal, targetAt, type Env, type NavKey } from "../blocks/interact.ts";
import { drawBubble } from "../blocks/bubble.ts";
import { BADGE } from "../blocks/core.ts";
import { renderTree } from "../blocks/render.ts";
import { newState, type Block, type Target, type WState } from "../blocks/types.ts";
import { rowsToLines, type Cell } from "../diagram/canvas.ts";
import { createPalette } from "../diagram/palette.ts";
import type { El } from "../lang/library.ts";
import { imageService } from "./images.ts";

const GUTTER = 2;
const SERIES = ["accent", "success", "warning", "error", "syntaxKeyword", "syntaxString", "syntaxType", "syntaxNumber"];
const sgr = (open: string, close: string) => (s: string) => `\x1b[${open}m${s}\x1b[${close}m`;

export function themePalette(theme: any) {
	const f = (token: string) => (s: string) => theme.fg(token, s);
	const colors = theme.colors ?? {};
	return createPalette({
		good: f("success"),
		bad: f("error"),
		warn: f("warning"),
		accent: f("accent"),
		info: f("accent"),
		muted: f("muted"),
		dim: f("dim"),
		bold: sgr("1", "22"),
		italic: sgr("3", "23"),
		underline: sgr("4", "24"),
		strike: sgr("9", "29"),
		code: f("mdCode"),
		keyword: f("syntaxKeyword"),
		string: f("syntaxString"),
		number: f("syntaxNumber"),
		comment: f("syntaxComment"),
		fn: f("syntaxFunction"),
		type: f("syntaxType"),
		link: f("mdLink"),
		series: SERIES.map(f),
		bubble: (s) => theme.bg("selectedBg", theme.fg("text", s)),
		pie: (a, b) => (s) => {
			if (a !== null && b !== null && typeof theme.style === "function" && colors[SERIES[b % 8]]) return theme.style(s, { fg: SERIES[a % 8], bg: colors[SERIES[b % 8]] });
			return theme.fg(SERIES[((a ?? b) as number) % 8], s);
		},
	});
}

export type Mode = "live" | "echo";

interface Entry {
	root: El;
	state: WState;
	mode: Mode;
	block: Block | null;
	key: string;
	version: number;
	warnings: string[];
	notice: string | null;
	noticeTimer: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, Entry>();
export const active: { id: string | null } = { id: null };
export const newestId: { id: string | null } = { id: null };

/** Services the extension provides. Tests replace them. */
export const hooks = {
	requestRender: () => {},
	sendLive: (_text: string) => {},
	sendEcho: (_text: string) => {},
	copy: (text: string) => {
		try {
			process.stdout.write(`\x1b]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`);
		} catch {
			/* no terminal */
		}
	},
};

export const entryOf = (id: string): Entry | undefined => entries.get(id);

// pi converts JPEG, GIF and WebP lazily after startup: when a picture becomes drawable, lay every widget out again
imageService.onLate = () => {
	for (const e of entries.values()) e.version++;
	hooks.requestRender();
};

function getEntry(id: string, root: El, mode: Mode): Entry {
	let e = entries.get(id);
	if (!e) {
		e = { root, state: newState(), mode, block: null, key: "", version: 0, warnings: [], notice: null, noticeTimer: null };
		entries.set(id, e);
		newestId.id = id;
	}
	return e;
}

function envFor(id: string, e: Entry): Env {
	return {
		send: (t) => (e.mode === "live" ? hooks.sendLive(t) : hooks.sendEcho(t)),
		copy: (t) => hooks.copy(t),
		note: (t) => setNotice(id, t),
	};
}

function setNotice(id: string, text: string | null) {
	const e = entries.get(id);
	if (!e) return;
	e.notice = text;
	if (e.noticeTimer) clearTimeout(e.noticeTimer);
	e.noticeTimer = text
		? setTimeout(() => {
				e.notice = null;
				hooks.requestRender();
			}, 4000)
		: null;
	if (e.noticeTimer && typeof (e.noticeTimer as any).unref === "function") (e.noticeTimer as any).unref();
}

function afterActivate(id: string, e: Entry, t: Target, layoutChanged: boolean) {
	if (layoutChanged) e.version++;
	if (t.kind === "copy") {
		const timer = setTimeout(() => {
			if (e.state.copied === t.id) {
				e.state.copied = null;
				e.version++;
				hooks.requestRender();
			}
		}, 1800);
		if (typeof (timer as any).unref === "function") (timer as any).unref();
	}
	void id;
}

const markRole = (c: Cell, suffix: string) => {
	if (c.role.startsWith("note.")) return; // a tooltip badge keeps its own colour
	if (c.role) c.role = `${c.role}.${suffix}`;
	else if (c.ch.trim()) c.role = suffix;
};

export class OpenUIWidget {
	id: string;
	theme: any;
	constructor(id: string, root: El, theme: any, mode: Mode) {
		this.id = id;
		this.theme = theme;
		getEntry(id, root, mode);
	}

	private layout(width: number): Entry {
		const e = entries.get(this.id)!;
		const key = `${width}:${e.version}`;
		if (!e.block || e.key !== key) {
			const r = renderTree(e.root, width, e.state, { images: imageService });
			e.block = r.block;
			e.warnings = r.warnings;
			e.key = key;
		}
		return e;
	}

	/** the block as last laid out, for tests and the keyboard layer */
	lastBlock(): Block | null {
		return entries.get(this.id)?.block ?? null;
	}

	render(width: number): string[] {
		const avail = Math.max(24, width - GUTTER);
		const e = this.layout(avail);
		const block = e.block!;
		const rows: Cell[][] = block.rows.map((r) => r.map((c) => ({ ...c })));
		const paint = (id: string | null, suffix: string) => {
			if (!id) return;
			const t = block.targets.find((x) => x.id === id);
			if (!t) return;
			if (t.kind === "image" && t.image) {
				// the picture itself cannot be styled: light up the frame around it
				const r = t.rect;
				for (let y = r.y - 1; y <= r.y + r.h; y++)
					for (let x = r.x - 1; x <= r.x + r.w; x++) {
						const onRing = y === r.y - 1 || y === r.y + r.h || x === r.x - 1 || x === r.x + r.w;
						if (onRing && rows[y]?.[x]) markRole(rows[y][x], suffix);
					}
				return;
			}
			for (let y = t.rect.y; y < t.rect.y + t.rect.h; y++) for (let x = Math.max(0, t.rect.x); x < Math.min(block.w, t.rect.x + t.rect.w); x++) if (rows[y]?.[x]) markRole(rows[y][x], suffix);
		};
		paint(e.state.hover, "hover");
		paint(e.state.focus, "focus");
		const current = block.targets.find((x) => x.id === (e.state.hover ?? e.state.focus));
		if (current?.tip?.hint) drawBubble(rows, block.w, current);
		const th = this.theme;
		const palette = themePalette(th);
		const lines = rowsToLines(rows, palette);
		// pictures: the rows are reserved and framed; the first row of each carries the terminal's image command
		const imageRows = new Set<number>();
		for (const t of block.targets) {
			if (t.kind !== "image" || !t.image) continue;
			const seq = imageService.sequence(t.image.key);
			const row = rows[t.rect.y];
			if (!seq || !row) continue;
			const left = rowsToLines([row.slice(0, t.rect.x)], palette, false)[0] ?? "";
			const right = rowsToLines([row.slice(t.rect.x + t.image.cols)], palette)[0] ?? "";
			// Kitty places the picture at the cursor and leaves the cursor there: step over it before the rest of the row
			lines[t.rect.y] = left + seq + `\x1b[${t.image.cols}C` + right;
			imageRows.add(t.rect.y);
		}
		for (const w of e.warnings) lines.push(th.fg("warning", `! ${w}`));
		const focusT = current;
		const tips = block.targets.filter((x) => x.tip).length;
		if (e.notice) lines.push(th.fg("accent", "▸ ") + e.notice);
		else if (focusT) lines.push(th.fg("accent", "▸ ") + th.fg("dim", describe(focusT)));
		else if (tips) lines.push(th.fg("accent", BADGE) + th.fg("dim", ` ${tips} element${tips === 1 ? " has a" : "s have"} tooltip${tips === 1 ? "" : "s"}: hover ${tips === 1 ? "it" : "one"}, or press Tab then Enter`));
		const armed = active.id === this.id;
		const edge = armed ? th.fg("accent", "▎") + " " : "  ";
		return lines.map((l, i) => (imageRows.has(i) ? edge + l : truncateToWidth(edge + l, width)));
	}

	handleMouse(ev: any) {
		const e = entries.get(this.id);
		if (!e || !e.block) return undefined;
		const t = targetAt(e.block, ev.x - GUTTER, ev.y);
		if (ev.type === "move") {
			const id = t?.id ?? null;
			if (id === e.state.hover) return undefined;
			e.state.hover = id;
			return { handled: !!t, render: true };
		}
		if (ev.type === "click" && ev.button === "left" && t) {
			active.id = this.id;
			e.state.focus = t.id;
			setNotice(this.id, null);
			const changed = activate(t, e.state, envFor(this.id, e));
			afterActivate(this.id, e, t, changed);
			if (reveal(t, e.state)) e.version++;
			hooks.requestRender();
			return { handled: true, render: true };
		}
		return undefined;
	}

	invalidate() {}
}

/** Keyboard layer while a widget is armed. Returns true when the key was used. */
export function handleKey(data: string): boolean {
	if (!active.id) return false;
	const id = active.id;
	const e = entries.get(id);
	if (!e || !e.block) return false;
	const block = e.block;
	if (matchesKey(data, Key.escape)) {
		if (e.state.tip) {
			e.state.tip = null;
			e.version++;
		} else {
			active.id = null;
			e.state.focus = null;
		}
		hooks.requestRender();
		return true;
	}
	let nav: NavKey | null = null;
	if (matchesKey(data, Key.tab)) nav = "next";
	else if (matchesKey(data, Key.shift("tab"))) nav = "prev";
	else if (matchesKey(data, Key.left)) nav = "left";
	else if (matchesKey(data, Key.right)) nav = "right";
	else if (matchesKey(data, Key.up)) nav = "up";
	else if (matchesKey(data, Key.down)) nav = "down";
	if (nav) {
		const t = nextTarget(block, e.state.focus, nav);
		if (!t) return false;
		e.state.focus = t.id;
		e.state.hover = null; // the keyboard is in charge now: a stale pointer hover must not describe another target
		setNotice(id, null);
		if (reveal(t, e.state)) e.version++;
		hooks.requestRender();
		return true;
	}
	if (matchesKey(data, Key.enter)) {
		const t = block.targets.find((x) => x.id === e.state.focus) ?? nextTarget(block, null, "next");
		if (!t) return false;
		e.state.focus = t.id;
		e.state.hover = null;
		const changed = activate(t, e.state, envFor(id, e));
		afterActivate(id, e, t, changed);
		hooks.requestRender();
		return true;
	}
	// The user started typing (a letter, a space, a paste): the keyboard belongs to the editor again. Without this, Enter
	// would keep re-firing the focused button instead of sending the message being typed.
	if ([...data].some((ch) => ch >= " " && ch !== "\x7f")) {
		active.id = null;
		e.state.focus = null;
		e.state.hover = null;
		hooks.requestRender();
	}
	return false;
}

export function armNewest(): string | null {
	if (!newestId.id || !entries.has(newestId.id)) return null;
	active.id = newestId.id;
	const e = entries.get(newestId.id)!;
	if (!e.state.focus && e.block) e.state.focus = nextTarget(e.block, null, "next")?.id ?? null;
	hooks.requestRender();
	return newestId.id;
}

export function resetAll() {
	for (const e of entries.values()) if (e.noticeTimer) clearTimeout(e.noticeTimer);
	entries.clear();
	active.id = null;
	newestId.id = null;
}
