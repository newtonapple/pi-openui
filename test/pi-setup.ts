// Shared by the suites that drive the pi component with pi's own TUI classes and pi's real theme. No model, no terminal.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";

export const PI = process.env.PI_PKG_RESOLVED;
export const skip = !PI || !existsSync(`${PI}/dist/modes/interactive/theme/theme.js`);

export const GUTTER = 2;
export const sample = (key: string) => LANG_SAMPLES.find((s) => s.key === key)!.source;
export const strip = (s: string) => s.replace(/\x1b\[[0-9;]*[mC]/g, "").replace(/\x1b_G[^\x1b]*\x1b\\/g, "");
/** What pi's renderer treats as an image line: it carries a Kitty (or iTerm2) image command. */
export const isImg = (l: string) => l.includes("\x1b_G") || l.includes("\x1b]1337;File=");

export async function setup() {
	const tui: any = await import("@earendil-works/pi-tui");
	const themeMod: any = await import(`${PI}/dist/modes/interactive/theme/theme.js`);
	const theme = themeMod.getThemeByName("dark") ?? themeMod.getThemeByName("nord");
	assert.ok(theme, "pi theme loads");
	const w: any = await import("../src/pi/widget.ts");
	w.resetAll();
	const sent: string[] = [];
	const echoed: string[] = [];
	const copied: string[] = [];
	// a healthy pi takes the message and says so (its message_start event); tests of a pi that does not override these
	w.hooks.sendLive = (t: string) => {
		sent.push(t);
		w.confirmDelivery(t);
	};
	w.hooks.queued = () => false;
	w.hooks.deliveryMs = 3000;
	w.hooks.sendEcho = (t: string) => echoed.push(t);
	w.hooks.copy = (t: string) => copied.push(t);
	w.hooks.requestRender = () => {};
	let n = 0;
	const make = (source: string, mode: "live" | "echo" = "echo") => {
		const c = compile(source);
		assert.deepEqual(c.errors, []);
		return new w.OpenUIWidget(`t${++n}`, c.root, theme, mode);
	};
	const click = (widget: any, t: any, dx = 0) => widget.handleMouse({ type: "click", button: "left", x: GUTTER + t.rect.x + Math.floor(t.rect.w / 2) + dx, y: t.rect.y });
	const move = (widget: any, t: any) => widget.handleMouse({ type: "move", button: "none", x: GUTTER + t.rect.x + Math.floor(t.rect.w / 2), y: t.rect.y });
	const find = (widget: any, pred: (t: any) => boolean) => {
		const t = widget.lastBlock().targets.find(pred);
		assert.ok(t, `no such target; have ${widget.lastBlock().targets.map((x: any) => x.kind + ":" + x.label).join(" | ")}`);
		return t;
	};
	return { tui, theme, w, sent, echoed, copied, make, click, move, find };
}
