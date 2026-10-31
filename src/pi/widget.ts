// pi-tui component for a compiled OpenUI tree: themed colours, hover, click, keyboard, clipboard, pictures, notes.
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { drawBubble } from "../blocks/bubble.ts";
import { BADGE } from "../blocks/core.ts";
import { activate, describe, nextTarget, reveal, targetAt, type Env, type NavKey } from "../blocks/interact.ts";
import { buildMessage, cleanNote, NOTE_LIMITS, widgetTitle } from "../blocks/notes.ts";
import { renderTree } from "../blocks/render.ts";
import { newState, type Block, type Note, type Target, type WState } from "../blocks/types.ts";
import { cell, padRow, textCells } from "../blocks/util.ts";
import { rowsToLines, textWidth, truncateText, type Cell } from "../diagram/canvas.ts";
import { createPalette } from "../diagram/palette.ts";
import type { El } from "../lang/library.ts";
import { imageService } from "./images.ts";

const GUTTER = 2;
/**
 * The last column of every line is left empty. pi's fullscreen transcript paints its scrollbar over that column after the
 * component has drawn (always with `fullscreenScrollbar: "always"`, while scrolling by default), so anything there is hidden:
 * the notes chip lost its `]`, a card its right border, a chart its last axis label. pi's own text keeps a margin for the same
 * reason.
 */
const RIGHT = 1;
const CHIP = "notes:chip";
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
	/** the finished lines and what they were drawn from: pi asks for them on every frame, so an unchanged widget answers from here */
	lines: string[] | null;
	lineKey: string;
}

const entries = new Map<string, Entry>();
export const active: { id: string | null } = { id: null };
export const newestId: { id: string | null } = { id: null };
/** A dialog (the note editor) is open: our key and mouse handlers stand down so its keys are its own. */
export const dialog = { open: false };

/** Services the extension provides. Tests replace them. */
export const hooks = {
	requestRender: () => {},
	sendLive: (_text: string) => {},
	sendEcho: (_text: string) => {},
	/** Ask the user for the text of a note. Resolves undefined when they cancel. */
	prompt: async (_title: string, _initial: string): Promise<string | undefined> => undefined,
	/** Put text in pi's message box without sending it. */
	toEditor: (_text: string) => {},
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
		e = { root, state: newState(), mode, block: null, key: "", version: 0, warnings: [], notice: null, noticeTimer: null, lines: null, lineKey: "" };
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

// ---------- notes ----------

const chipLabel = (s: WState) => (s.noteMode ? "[ notes: on ]" : s.notes.length ? `[ notes ${s.notes.length} ]` : "[ notes ]");

function setMode(id: string, e: Entry, on: boolean) {
	e.state.noteMode = on;
	e.state.focus = null;
	e.state.hover = null;
	e.state.tip = null;
	e.version++;
	if (on) active.id = id;
	setNotice(id, null);
	hooks.requestRender();
}

async function writeNote(id: string, e: Entry, t: Target): Promise<void> {
	if (dialog.open || !t.item) return;
	const existing = e.state.notes.find((n) => n.itemId === t.id);
	if (!existing && e.state.notes.length >= NOTE_LIMITS.notes) {
		setNotice(id, `${NOTE_LIMITS.notes} notes is the most per widget.`);
		hooks.requestRender();
		return;
	}
	await ask(id, e, existing ?? null, { itemId: t.id, info: t.item });
}

async function editNote(id: string, e: Entry, noteId: number | undefined): Promise<void> {
	const n = e.state.notes.find((x) => x.id === noteId);
	if (n && !dialog.open) await ask(id, e, n, { itemId: n.itemId, info: n.info });
}

async function ask(id: string, e: Entry, existing: Note | null, about: { itemId: string; info: Note["info"] }): Promise<void> {
	dialog.open = true;
	let text: string | undefined;
	try {
		text = await hooks.prompt(`Note on ${about.info.short}${about.info.tab ? ` [tab ${about.info.tab}]` : ""}${existing ? " (editing)" : ""}`, existing?.text ?? "");
	} finally {
		dialog.open = false;
	}
	if (text === undefined) return; // cancelled
	let clean = cleanNote(text);
	if (clean.length > NOTE_LIMITS.note) {
		clean = clean.slice(0, NOTE_LIMITS.note).trimEnd();
		setNotice(id, `Note shortened to ${NOTE_LIMITS.note} characters.`);
	}
	if (!clean) {
		// saving an empty note removes it
		if (existing) e.state.notes = e.state.notes.filter((n) => n !== existing);
	} else if (existing) existing.text = clean;
	else e.state.notes.push({ id: ++e.state.noteSeq, itemId: about.itemId, info: about.info, text: clean });
	e.version++;
	hooks.requestRender();
}

function addToMessage(id: string, e: Entry) {
	const n = e.state.notes.length;
	if (!n) return;
	hooks.toEditor(buildMessage(e.state.notes, widgetTitle(e.root)));
	e.state.notes = [];
	e.state.noteMode = false;
	e.state.focus = null;
	// The next key is Enter, to send the message the user is about to read. It has to reach pi's editor, not this widget.
	if (active.id === id) active.id = null;
	e.version++;
	setNotice(id, `Added ${n} note${n === 1 ? "" : "s"} to your message. Read it, edit it, then press Enter to send.`);
	hooks.requestRender();
}

function clearNotes(id: string, e: Entry) {
	e.state.notes = [];
	e.state.focus = null;
	e.version++;
	setNotice(id, "Notes cleared.");
	hooks.requestRender();
}

/** One place for what a click or Enter does, so the mouse and the keyboard cannot drift apart. */
function perform(id: string, e: Entry, t: Target, shift = false): void {
	switch (t.kind) {
		case "notes":
			setMode(id, e, !e.state.noteMode);
			return;
		case "item": {
			// Shift picks the item one level up: a table row instead of its cell
			const up = shift && t.item?.parent ? e.block?.targets.find((x) => x.id === t.item!.parent) : undefined;
			void writeNote(id, e, up ?? t);
			return;
		}
		case "note":
			void editNote(id, e, t.noteId);
			return;
		case "noteadd":
			addToMessage(id, e);
			return;
		case "noteclear":
			clearNotes(id, e);
			return;
	}
	const changed = activate(t, e.state, envFor(id, e));
	afterActivate(id, e, t, changed);
}

// ---------- the component ----------

/** Restyle one cell for hover or focus. Replaces the cell: the originals belong to the cached layout and are shared by every redraw. */
const mark = (row: Cell[], x: number, suffix: string) => {
	const c = row[x];
	if (c.role.startsWith("note.")) return; // a tooltip badge or a pin keeps its own colour
	if (c.role) row[x] = cell(c.ch, `${c.role}.${suffix}`);
	else if (c.ch.trim()) row[x] = cell(c.ch, suffix);
};

export class OpenUIWidget {
	id: string;
	theme: any;
	private pal: ReturnType<typeof themePalette> | null = null;
	private root: El;
	private mode: Mode;
	constructor(id: string, root: El, theme: any, mode: Mode) {
		this.id = id;
		this.theme = theme;
		this.root = root;
		this.mode = mode;
		getEntry(id, root, mode);
	}

	private layout(width: number): Entry {
		// the entry is made again if the session's state was dropped while this widget was still on screen
		const e = getEntry(this.id, this.root, this.mode);
		const key = `${width}:${e.version}`;
		if (!e.block || e.key !== key) {
			const r = renderTree(e.root, width, e.state, { images: imageService });
			let block = r.block;
			// a footer row with the notes chip, when there is anything to attach a note to
			if (block.targets.some((t) => t.kind === "item")) {
				const w = Math.max(block.w, width);
				const label = chipLabel(e.state);
				const cw = textWidth(label);
				const chip: Cell[] = textCells(label, e.state.noteMode ? "notes.on" : "btn");
				const row = padRow([], w - cw).concat(chip);
				block = {
					w,
					rows: [...block.rows.map((x) => padRow(x, w)), row],
					targets: [...block.targets, { id: CHIP, kind: "notes", rect: { x: w - cw, y: block.rows.length, w: cw, h: 1 }, label: "notes" }],
				};
			}
			e.block = block;
			e.warnings = r.warnings;
			e.key = key;
		}
		return e;
	}

	/** the block as last laid out, for tests and the keyboard layer */
	lastBlock(): Block | null {
		return entries.get(this.id)?.block ?? null;
	}

	/**
	 * pi calls this for every widget in the transcript on every frame (up to 60 a second, and again for each mouse event), so
	 * the work is done once per distinct appearance. What changes the picture is in the key: the layout (width and version), the
	 * pointer and keyboard focus, whether the widget is armed or in notes mode, the notice and an open tooltip. It never throws:
	 * pi's render loop is not a place for an exception.
	 */
	render(width: number): string[] {
		try {
			const avail = Math.max(24, width - GUTTER - RIGHT);
			const e = this.layout(avail);
			const s = e.state;
			const key = `${e.key}|${s.hover}|${s.focus}|${s.tip}|${s.copied}|${s.noteMode}|${s.notes.length}|${e.notice}|${active.id === this.id}`;
			if (e.lines && e.lineKey === key) return e.lines;
			const lines = this.draw(e, width, avail);
			e.lines = lines;
			e.lineKey = key;
			return lines;
		} catch (err) {
			const msg = String((err as Error)?.message ?? err).replace(/\s+/g, " ").slice(0, 120);
			return [truncateToWidth(this.theme.fg("error", `! the widget could not be drawn: ${msg}`), Math.max(1, width))];
		}
	}

	private draw(e: Entry, width: number, avail: number): string[] {
		const block = e.block!;
		const notes = e.state.noteMode;
		// the cells themselves are shared with the layout: a cell is replaced, never changed (see `mark`)
		const rows: Cell[][] = block.rows.map((r) => r.slice());
		const gutter = new Set<number>();
		const paint = (id: string | null, suffix: string) => {
			if (!id) return;
			const t = block.targets.find((x) => x.id === id);
			if (!t) return;
			if (t.kind === "item" && t.item?.key === "") {
				// a whole component is too big to restyle: a bar in the left margin marks its rows
				for (let y = t.rect.y; y < t.rect.y + t.rect.h; y++) gutter.add(y);
				return;
			}
			if (t.kind === "image" && t.image) {
				// the picture itself cannot be styled: light up the frame around it
				const r = t.rect;
				for (let y = r.y - 1; y <= r.y + r.h; y++)
					for (let x = r.x - 1; x <= r.x + r.w; x++) {
						const onRing = y === r.y - 1 || y === r.y + r.h || x === r.x - 1 || x === r.x + r.w;
						if (onRing && rows[y]?.[x]) mark(rows[y], x, suffix);
					}
				return;
			}
			for (let y = t.rect.y; y < t.rect.y + t.rect.h; y++) for (let x = Math.max(0, t.rect.x); x < Math.min(block.w, t.rect.x + t.rect.w); x++) if (rows[y]?.[x]) mark(rows[y], x, suffix);
		};
		paint(e.state.hover, "hover");
		paint(e.state.focus, "focus");
		const current = block.targets.find((x) => x.id === (e.state.hover ?? e.state.focus));
		if (current?.tip?.hint && !notes) drawBubble(rows, block.w, current);

		// the footer: what the pointer or focus is on, a notice, or how to reach tooltips and notes
		const footerCells = (): Cell[] => {
			const tips = block.targets.filter((x) => x.tip).length;
			if (e.notice) return [...textCells("▸ ", "foot.mark"), ...textCells(e.notice, "foot.text")];
			if (current) return [...textCells("▸ ", "foot.mark"), ...textCells(describe(current), "foot.text")];
			if (notes) return [...textCells("Notes: click an element, or Tab to it and press Enter. Esc leaves.", "foot.text")];
			if (tips) return [...textCells(BADGE, "foot.mark"), ...textCells(` ${tips} element${tips === 1 ? " has a" : "s have"} tooltip${tips === 1 ? "" : "s"}: hover ${tips === 1 ? "it" : "one"}, or press Tab then Enter`, "foot.text")];
			return [];
		};
		const chipT = block.targets.find((t) => t.kind === "notes");
		const text = footerCells();
		if (chipT && rows[chipT.rect.y]) {
			const room = chipT.rect.x - 2;
			const cells = textCells(truncateText(text.map((c) => c.ch).join(""), Math.max(0, room)), "foot.text");
			text.forEach((c, i) => {
				if (cells[i]) cells[i] = cell(cells[i].ch, c.role); // cells are shared: build another, never change one
			});
			cells.forEach((c, i) => {
				if (i < rows[chipT.rect.y].length) rows[chipT.rect.y][i] = c;
			});
		} else if (text.length) rows.push(padRow(text, Math.min(avail, Math.max(text.length, 1))));

		const th = this.theme;
		const palette = (this.pal ??= themePalette(th));
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
		const armed = active.id === this.id;
		const edgeFor = (y: number) => (gutter.has(y) ? th.fg("accent", "┃") + " " : armed ? th.fg("accent", "▎") + " " : "  ");
		return lines.map((l, i) => (imageRows.has(i) ? edgeFor(i) + l : truncateToWidth(edgeFor(i) + l, width)));
	}

	handleMouse(ev: any) {
		try {
			return this.mouse(ev);
		} catch {
			return undefined; // pi's input handling is not a place for an exception either
		}
	}

	private mouse(ev: any) {
		const e = entries.get(this.id);
		if (!e || !e.block || dialog.open) return undefined;
		const t = targetAt(e.block, ev.x - GUTTER, ev.y, e.state.noteMode);
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
			perform(this.id, e, t, !!ev.shift);
			if (reveal(t, e.state)) e.version++;
			hooks.requestRender();
			return { handled: true, render: true };
		}
		return undefined;
	}

	/** pi calls this when the theme, the cell size or a converter changes: the colours (and a picture's size) are stale. */
	invalidate() {
		this.pal = null;
		const e = entries.get(this.id);
		if (!e) return;
		e.lines = null;
		if (e.block?.targets.some((t) => t.kind === "image")) {
			imageService.reset();
			e.version++;
		}
	}
}

/** Keyboard layer while a widget is armed. Returns true when the key was used. Never throws. */
export function handleKey(data: string): boolean {
	try {
		return keyInner(data);
	} catch {
		return false;
	}
}

function keyInner(data: string): boolean {
	if (!active.id || dialog.open) return false;
	const id = active.id;
	const e = entries.get(id);
	if (!e || !e.block) return false;
	const block = e.block;
	const notes = e.state.noteMode;
	if (matchesKey(data, Key.escape)) {
		if (e.state.tip) {
			e.state.tip = null;
			e.version++;
		} else if (notes) {
			setMode(id, e, false);
			return true;
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
		const t = nextTarget(block, e.state.focus, nav, notes);
		if (!t) return false;
		e.state.focus = t.id;
		e.state.hover = null; // the keyboard is in charge now: a stale pointer hover must not describe another target
		setNotice(id, null);
		if (reveal(t, e.state)) e.version++;
		hooks.requestRender();
		return true;
	}
	if (matchesKey(data, Key.enter) || matchesKey(data, Key.shift("enter"))) {
		const t = block.targets.find((x) => x.id === e.state.focus) ?? nextTarget(block, null, "next", notes);
		if (!t) return false;
		e.state.focus = t.id;
		e.state.hover = null;
		perform(id, e, t, matchesKey(data, Key.shift("enter")));
		hooks.requestRender();
		return true;
	}
	// Delete (or Backspace) on a note in the tray removes it
	if (matchesKey(data, Key.delete) || matchesKey(data, Key.backspace)) {
		const t = block.targets.find((x) => x.id === e.state.focus);
		if (t?.kind === "note") {
			e.state.notes = e.state.notes.filter((n) => n.id !== t.noteId);
			e.state.focus = null;
			e.version++;
			hooks.requestRender();
			return true;
		}
	}
	// The user started typing (a letter, a space, a paste): the keyboard belongs to the editor again. Without this, Enter
	// would keep re-firing the focused button instead of sending the message being typed.
	if ([...data].some((ch) => ch >= " " && ch !== "\x7f")) {
		active.id = null;
		e.state.focus = null;
		e.state.hover = null;
		if (e.state.noteMode) {
			e.state.noteMode = false;
			e.version++;
		}
		hooks.requestRender();
	}
	return false;
}

export function armNewest(): string | null {
	if (!newestId.id || !entries.has(newestId.id)) return null;
	active.id = newestId.id;
	const e = entries.get(newestId.id)!;
	if (!e.state.focus && e.block) e.state.focus = nextTarget(e.block, null, "next", e.state.noteMode)?.id ?? null;
	hooks.requestRender();
	return newestId.id;
}

/** Arm the newest widget and switch notes mode on or off. Returns false when there is no widget. */
export function toggleNotesNewest(): boolean {
	if (!newestId.id || !entries.has(newestId.id)) return false;
	const e = entries.get(newestId.id)!;
	setMode(newestId.id, e, !e.state.noteMode);
	return true;
}

/** Forget every widget's state (notes, focus, layouts). Called when a session ends: pi processes live for days. */
export function resetAll() {
	for (const e of entries.values()) if (e.noticeTimer) clearTimeout(e.noticeTimer);
	entries.clear();
	imageService.reset();
	active.id = null;
	newestId.id = null;
	dialog.open = false;
}
