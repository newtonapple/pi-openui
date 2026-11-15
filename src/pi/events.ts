// What does my terminal app send for a tap, a swipe, a flick? Nobody can see it from outside (pi consumes the bytes), so a widget
// can record what reaches it: `/openui-events on`, tap and swipe over a widget, `/openui-events show`.
//
// It records mouse events, and keys only when they are escape sequences or control keys. What a person types is never written
// down (a letter is not recorded, a paste is counted but not copied), it switches itself off after five minutes, and the file
// is bounded.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type Env = Record<string, string | undefined>;

export const eventsPath = (env: Env = process.env): string => join(env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "openui-events.log");

/** `press btn=none x=9 y=1`, plus `shift`, `alt`, `ctrl` and `d=<wheel delta>` when there are any. */
export function describeMouse(ev: any): string {
	const bits = [`${ev.type} btn=${ev.button} x=${ev.x} y=${ev.y}`];
	if (ev.shift) bits.push("shift");
	if (ev.alt) bits.push("alt");
	if (ev.ctrl) bits.push("ctrl");
	if (ev.wheelDelta !== undefined) bits.push(`d=${ev.wheelDelta}`);
	return bits.join(" ");
}

const escaped = (s: string) =>
	s.replace(/[\x00-\x1f\x7f]/g, (c) => (c === "\r" ? "\\r" : c === "\n" ? "\\n" : c === "\t" ? "\\t" : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`));

/** A key worth recording (an escape sequence or a control key), or null for what a person types. A paste is counted, never copied. */
export function describeKey(data: string): string | null {
	if (data.startsWith("\x1b[200~")) return `paste (${data.replace(/^\x1b\[200~/, "").replace(/\x1b\[201~$/, "").length} characters, not recorded)`;
	if (!/^[\x00-\x1f\x7f]/.test(data)) return null;
	return `key "${escaped(data.length > 24 ? data.slice(0, 24) + "…" : data)}"`;
}

export interface RecorderOptions {
	write?: (line: string) => void;
	path?: string;
	now?: () => number;
	minutes?: number;
	maxLines?: number;
}

export class Recorder {
	on = false;
	count = 0;
	moves = 0;
	private startedAt = 0;
	private readonly opts: RecorderOptions;

	constructor(opts: RecorderOptions = {}) {
		this.opts = opts;
	}

	get path(): string {
		return this.opts.path ?? eventsPath();
	}
	private now(): number {
		return (this.opts.now ?? Date.now)();
	}
	/** still recording? Five minutes (or `minutes`) after start it is not. */
	private live(): boolean {
		if (this.on && this.now() - this.startedAt > (this.opts.minutes ?? 5) * 60_000) this.on = false;
		return this.on;
	}
	start(): void {
		this.on = true;
		this.count = 0;
		this.moves = 0;
		this.startedAt = this.now();
	}
	stop(): void {
		this.on = false;
	}
	private line(text: string): void {
		if (!this.live() || this.count >= (this.opts.maxLines ?? 2000)) return;
		this.count++;
		const at = new Date(this.now()).toISOString().slice(11, 23);
		const l = `${at} ${text}\n`;
		try {
			if (this.opts.write) this.opts.write(l);
			else {
				mkdirSync(dirname(this.path), { recursive: true });
				appendFileSync(this.path, l);
			}
		} catch {
			/* a diagnostic must never get in the way */
		}
	}
	mouse(ev: any): void {
		if (!this.live()) return;
		if (ev?.type === "move") this.moves++; // hover floods a log, and says nothing about a swipe
		else this.line(describeMouse(ev));
	}
	key(data: string): void {
		if (!this.live()) return;
		const d = describeKey(data);
		if (d) this.line(d);
	}
	/** what the widget made of the last event */
	note(text: string): void {
		this.line(`-> ${text}`);
	}
}

export const recorder = new Recorder();

export interface EventsResult {
	message: string;
	level: "info" | "warning" | "error";
}

const TIP = "Tap, swipe and flick over a widget (a mouse event only reaches the widget under it), press an arrow or two, then run /openui-events show.";

/** `/openui-events [on|off|show|clear]` */
export function runEventsCommand(args: string, r: Recorder = recorder, env: Env = process.env): EventsResult {
	const word = args.trim().toLowerCase();
	const path = r.path ?? eventsPath(env);
	switch (word) {
		case "":
			return { level: "info", message: r.on ? `Recording (${r.count} events so far). ${TIP}` : "Off. /openui-events on records what a tap, a swipe or a flick sends, for five minutes." };
		case "on":
			r.start();
			return { level: "info", message: `Recording for five minutes into ${path}. ${TIP}` };
		case "off":
			r.stop();
			return { level: "info", message: `Off. ${r.count} events recorded in ${path}.` };
		case "clear":
			try {
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, "");
			} catch (e) {
				return { level: "error", message: `Cannot clear ${path}: ${(e as Error).message}` };
			}
			return { level: "info", message: "Cleared." };
		case "show": {
			let text = "";
			try {
				text = readFileSync(path, "utf8");
			} catch {
				/* nothing yet */
			}
			const lines = text.split("\n").filter(Boolean);
			if (!lines.length) return { level: "info", message: `Nothing recorded yet. ${TIP}` };
			const tail = lines.slice(-25);
			return { level: "info", message: `${lines.length} events in ${path} (moves are counted, not logged: ${r.moves}). Last ${tail.length}:\n${tail.join("\n")}` };
		}
		default:
			return { level: "error", message: `Unknown "${args.trim()}". Use /openui-events on, off, show or clear.` };
	}
}
