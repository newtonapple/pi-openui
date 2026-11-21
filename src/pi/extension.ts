// pi extension: render_widget (OpenUI Lang -> interactive terminal widget) plus a few commands.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { fallbackLines } from "../blocks/fallback.ts";
import { compile, errorHelp, LANG_VERSION, LIMITS, reference, type Compiled, type El } from "../lang/library.ts";
import { markdownImages } from "../lang/md.ts";
import { LANG_SAMPLES } from "../lang/samples.ts";
import { getCapabilities } from "@earendil-works/pi-tui";
import { loadSettings, runConfigCommand } from "./config.ts";
import { recorder, runEventsCommand } from "./events.ts";
import { loadImage } from "./images.ts";
import { syncWidths } from "./widths.ts";
import { active, applySettings, armNewest, confirmDelivery, entryOf, handleKey, hooks, OpenUIWidget, resetAll, toggleNotesNewest } from "./widget.ts";

const compiled = new Map<string, Compiled>();
let compiledChars = 0;
/** A source is the key, so the cache is bounded by size as well as count: 64 sources at the 100 KB limit would be 6 MB. */
const CACHE_CHARS = 2_000_000;
export function compileCached(source: string, mode: "strict" | "restore" = "strict", from = 1): Compiled {
	if (source.length > LIMITS.source) return compile(source, { mode, from }); // rejected at once; never kept
	const key = `${mode}${mode === "restore" ? from : ""}\u0000${source}`;
	let c = compiled.get(key);
	if (!c) {
		c = compile(source, { mode, from });
		if (compiled.size >= 64 || compiledChars + source.length > CACHE_CHARS) {
			compiled.clear();
			compiledChars = 0;
		}
		compiled.set(key, c);
		compiledChars += source.length;
	}
	return c;
}

/** A picture the widget will draw: an Image component, or a `![alt](path)` line in a Markdown or an FAQ answer. */
export interface Picture {
	src: string;
	line: number;
	via: "Image" | "Markdown picture";
}

/** Every picture in a compiled tree, wherever it was written. */
export function picturesIn(el: El | undefined, out: Picture[] = []): Picture[] {
	if (!el || typeof el !== "object") return out;
	if (el.type === "Image") out.push({ src: String(el.props.src ?? ""), line: el.line, via: "Image" });
	const text = el.type === "Markdown" ? el.props.text : el.type === "FaqItem" ? el.props.answer : undefined;
	if (text !== undefined) for (const m of markdownImages(text)) out.push({ src: m.src, line: el.line, via: "Markdown picture" });
	for (const v of Object.values(el.props ?? {})) for (const x of Array.isArray(v) ? v : [v]) if (x && typeof x === "object") picturesIn(Array.isArray(x) ? undefined : (x as El), out);
	return out;
}

/** Problems the model can fix: the picture must exist and be a format a terminal can show. */
export function checkImages(root: El | undefined): string[] {
	const errs: string[] = [];
	for (const im of picturesIn(root)) {
		const r = loadImage(im.src);
		if ("error" in r) errs.push(`line ${im.line}: ${im.via} ${im.src.startsWith("data:") ? "data: URI" : `"${im.src.length > 80 ? im.src.slice(0, 77) + "..." : im.src}"`}: ${r.error}`);
	}
	return errs;
}

/** What every way of drawing checks before it draws: compile, then pictures. `errorText` is what the model reads when it fails. */
export interface SourceCheck {
	ok: boolean;
	errors: string[];
	/** the signature footer `errorText` ends with ("" when there is none); a script never sees `errorText`, so it gets this too */
	help: string;
	/** notes for the model on a widget that was drawn (compile warnings, pictures this terminal cannot show) */
	warnings: string[];
	errorText: string;
}

export function checkSource(source: string, again = "call render_widget again with the full corrected source"): SourceCheck {
	const c = compileCached(source);
	const fail = (errors: string[]): SourceCheck => {
		const help = errorHelp(c);
		const errorText = `The widget was not drawn: ${errors.length} error(s). Fix these and ${again}.\n${errors.map((e) => `- ${e}`).join("\n")}${help ? `\n${help}` : ""}`;
		return { ok: false, errors, help, warnings: [], errorText };
	};
	if (!c.ok) return fail(c.errors);
	const imgErrs = checkImages(c.root);
	if (imgErrs.length) return fail(imgErrs);
	const noPics = picturesIn(c.root).length > 0 && getCapabilities().images !== "kitty";
	const warnings = [...c.warnings, ...(noPics ? ["this terminal cannot show pictures, so each Image is drawn as a labelled frame with its file details"] : [])];
	return { ok: true, errors: [], help: "", warnings, errorText: "" };
}

/** The language version a stored widget was written under: a whole number from 1, else 1 (older sessions stored none). */
export const langOf = (details: any): number => (typeof details?.lang === "number" && Number.isInteger(details.lang) && details.lang >= 1 ? details.lang : 1);

/**
 * A widget read back from a session: compiled in restore mode (an older source keeps drawing), and when even that fails a card with
 * the reason and the start of the source. Never nothing.
 */
function restoredWidget(details: any, id: string, theme: any, mode: "live" | "echo") {
	const source = String(details?.source ?? "");
	const lang = langOf(details);
	const c = compileCached(source, "restore", lang);
	if (!c.ok || !c.root) return new Text(fallbackLines(source, c.errors, lang).map((l) => theme.fg("warning", l)).join("\n"), 0, 0);
	return new OpenUIWidget(id, c.root, theme, mode, c.notes);
}

export default function (pi: ExtensionAPI) {
	syncWidths(); // our grid must agree with this pi about which characters take two cells
	hooks.sendLive = (text) => pi.sendUserMessage(text, { deliverAs: "followUp" });
	hooks.sendEcho = (text) => pi.sendMessage({ customType: "openui-click", content: `[widget click → assistant] ${text}`, display: true });

	pi.registerTool({
		name: "render_widget",
		label: "render_widget",
		description:
			"Draw an interactive widget in the terminal: dashboards, tables, charts (bar, line, area, pie, radar), diagrams (DAG, state machines and workflows with loops, such as a review or retry loop, ER, infrastructure map, sequence), maps, tabs, buttons and choices. Pass OpenUI Lang as `source`. Call with reference=true once to get the component signatures. A Button click sends its text back to you as the user's next message. Choice answers are staged and arrive together as one message when the user presses Send answers.",
		promptSnippet: "render_widget: draw an interactive terminal widget (dashboards, charts, diagrams, state machines, workflows, review and retry loops) from OpenUI Lang",
		promptGuidelines: [
			"Before the first render_widget call in a session, call render_widget with reference=true to read the component signatures. Never guess a signature.",
			"After render_widget succeeds, reply with at most one short sentence. Do not repeat the widget's data in prose.",
			"If render_widget returns errors, fix exactly the errors listed and call it again with the full corrected source.",
			"Use plain text, not a widget, for a single value or a short answer. One widget per reply: use Tabs or Card to organise sections.",
			"A Button click arrives as your next user message: act on it, then render a NEW widget if needed. Choice answers arrive together as ONE message after the user presses Send answers, so ask all your questions in one widget (a Card or Tabs), then act on the answers.",
		],
		parameters: Type.Object({
			source: Type.Optional(Type.String({ description: "OpenUI Lang source: root = Stack([...]) first, one statement per line" })),
			reference: Type.Optional(Type.Boolean({ description: "Return the component reference instead of drawing" })),
		}),
		renderShell: "self",
		// A codemode script cannot draw: pi never renders a nested call, so it would report "Widget drawn" for a widget nobody sees.
		// "model-only" is still declared to the model, also under codemode.mode "only".
		exposure: "model-only",
		async execute(_id: string, params: { source?: string; reference?: boolean }) {
			if (params.reference || params.source === undefined) return { content: [{ type: "text" as const, text: reference() }], details: { kind: "reference" } };
			const check = checkSource(params.source);
			if (!check.ok) throw new Error(check.errorText);
			const noteText = check.warnings.length ? ` Notes: ${check.warnings.join("; ")}.` : "";
			return { content: [{ type: "text" as const, text: `Widget drawn. The user can see and click it in the terminal; do not repeat its contents.${noteText}` }], details: { kind: "widget", source: params.source, lang: LANG_VERSION } };
		},
		renderCall(args: any, theme: any) {
			const n = typeof args?.source === "string" ? args.source.split("\n").length : 0;
			const label = args?.reference ? "reference" : n ? `${n} lines of OpenUI` : "…";
			return new Text(theme.fg("toolTitle", theme.bold("render_widget")) + theme.fg("dim", ` ${label}`), 0, 0);
		},
		renderResult(result: any, _opts: any, theme: any, ctx: any) {
			if (ctx.isError) {
				// the model gets the whole list; show a person the same thing
				const lines = String(result?.content?.[0]?.text ?? "failed").split("\n").slice(0, 9);
				return new Text(lines.map((l) => theme.fg("error", l)).join("\n"), 0, 0);
			}
			if (result?.details?.kind !== "widget") return new Text(theme.fg("dim", "component reference loaded"), 0, 0);
			return restoredWidget(result.details, ctx.toolCallId, theme, "live");
		},
	});

	pi.registerMessageRenderer("openui-widget", (message: any, _o: any, theme: any) => {
		return restoredWidget(message.details, String(message.details?.id ?? "w-unknown"), theme, message.details?.mode === "live" ? "live" : "echo");
	});

	const MAX_DRAWS_PER_TURN = 8;
	let drawnThisTurn = 0;
	pi.on("agent_start", async () => {
		drawnThisTurn = 0;
	});

	pi.registerTool({
		name: "openui_draw",
		label: "openui_draw",
		description:
			"Codemode scripts only. Draw an OpenUI Lang widget from a script, so fetched data (metrics, database rows) is put into the widget without passing through the model. Read the language first with render_widget({reference: true}) as a direct tool call, not from a script. JSON.stringify of strings, numbers and arrays is valid OpenUI Lang, e.g. `Table(${JSON.stringify(cols)}, ${JSON.stringify(rows)})`. Keep fetched data with store() so a failed draw does not fetch again. Returns { drawn, errors, warnings }; on errors fix the source and call again. The widget appears in the transcript after this tool call finishes. At most 8 widgets per turn. Do not also call render_widget for the same widget.",
		parameters: Type.Object({
			source: Type.String({ description: "OpenUI Lang source: root = Stack([...]) first, one statement per line" }),
			title: Type.Optional(Type.String({ description: "Short name for the widget, shown in the transcript" })),
		}),
		outputSchema: Type.Object({ drawn: Type.Boolean(), errors: Type.Array(Type.String()), warnings: Type.Array(Type.String()) }),
		exposure: "codemode",
		async execute(_id: string, params: { source: string; title?: string }) {
			const check = checkSource(params.source, "call tools.openui_draw again with the full corrected source");
			// Returned, not thrown, so a script gets structuredContent either way. Only the script's own output reaches the model, and a
			// script receives structuredContent instead of the text, so the signature footer goes into `errors` as well as the text.
			const structuredContent = { drawn: check.ok, errors: check.help ? [...check.errors, check.help] : check.errors, warnings: check.warnings };
			if (!check.ok) return { isError: true, content: [{ type: "text" as const, text: check.errorText }], structuredContent };
			// pi draws every widget on every frame and a script loop costs no model turn, so a turn gets a few widgets, not any number
			if (++drawnThisTurn > MAX_DRAWS_PER_TURN) {
				const errors = [`at most ${MAX_DRAWS_PER_TURN} widgets per turn: draw one widget and use Tabs or Card for sections`];
				return { isError: true, content: [{ type: "text" as const, text: `The widget was not drawn: ${errors[0]}.` }], structuredContent: { drawn: false, errors, warnings: [] } };
			}
			const title = (params.title?.trim() || "OpenUI").slice(0, 80);
			// triggerTurn: false and no deliverAs. A script runs inside a tool call, so the agent is streaming. pi's sendCustomMessage
			// steers (or follows up) when streaming unless triggerTurn is false: that would start another model turn. With false it
			// parks the message and appends it after this turn's tool results, so the transcript order stays valid and the widget
			// shows once the turn's tool calls finish. Idle, it is just appended; no turn either way.
			await pi.sendMessage(
				{ customType: "openui-widget", content: `[widget: ${title}]`, display: true, details: { id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, source: params.source, mode: "live", lang: LANG_VERSION } },
				{ triggerTurn: false },
			);
			const noteText = check.warnings.length ? ` Notes: ${check.warnings.join("; ")}.` : "";
			return { content: [{ type: "text" as const, text: `Widget queued; it appears in the transcript after this tool call finishes.${noteText}` }], structuredContent };
		},
	});

	const draw = (source: string, title: string, ctx: any) => {
		const c = compileCached(source);
		if (!c.ok) return ctx.ui.notify(`${title}: ${c.errors.slice(0, 3).join(" | ")}`, "error");
		pi.sendMessage({ customType: "openui-widget", content: `[widget: ${title}]`, display: true, details: { id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, source, mode: "echo", lang: LANG_VERSION } });
	};

	pi.registerCommand("openui-gallery", {
		description: "Draw one example per OpenUI component, or those whose key starts with a prefix: dashboard, table, tabs, choice, line, pie, radar, image, dag, erd, infra, sequence, geo ... `wide` draws the examples that do not fit a phone (long tables, code, tabs, diagrams). Clicks echo locally.",
		handler: async (args: string, ctx: any) => {
			const which = args.trim() || "all";
			const picked = LANG_SAMPLES.filter((s) => which === "all" || s.key.startsWith(which));
			if (!picked.length) return ctx.ui.notify(`unknown example "${which}". Try: all, ${LANG_SAMPLES.map((s) => s.key).join(", ")}`, "warning");
			for (const s of picked) draw(s.source, s.title, ctx);
		},
	});

	pi.registerCommand("openui-file", {
		description: "Draw a widget from an OpenUI Lang file: /openui-file path/to/widget.oui",
		handler: async (args: string, ctx: any) => {
			const path = args.trim();
			if (!path) return ctx.ui.notify("usage: /openui-file path/to/widget.oui", "warning");
			try {
				draw(readFileSync(path, "utf8"), path.split("/").pop() ?? path, ctx);
			} catch (e) {
				ctx.ui.notify(`cannot read ${path}: ${(e as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("openui-config", {
		description: "Show or change pi-openui settings: /openui-config, /openui-config table.minColumnWidth 14, /openui-config reset",
		handler: async (args: string, ctx: any) => {
			const r = runConfigCommand(args);
			if (r.settings) applySettings(r.settings);
			ctx.ui.notify(r.message, r.level);
		},
	});

	pi.registerCommand("openui-events", {
		description: "See what your terminal sends for a tap, a swipe or a flick over a widget: /openui-events on, try them, /openui-events show (off, clear)",
		handler: async (args: string, ctx: any) => {
			const r = runEventsCommand(args);
			ctx.ui.notify(r.message, r.level);
		},
	});

	pi.registerCommand("openui-notes", {
		description: "Write notes on the newest widget: click an element (or Tab to it and press Enter), type, Enter to save. Then add them to your message.",
		handler: async (_a: string, ctx: any) => {
			if (!toggleNotesNewest()) ctx.ui.notify("no widget yet: run /openui-gallery", "warning");
		},
	});

	pi.registerCommand("openui-focus", {
		description: "Give the keyboard to the newest widget (Tab/arrows move, Enter activates, Esc leaves)",
		handler: async (_a: string, ctx: any) => {
			if (!armNewest()) ctx.ui.notify("no widget yet: run /openui-gallery", "warning");
		},
	});

	// pi reports every user message it takes, whoever sent it: that is how a widget learns its answers were delivered
	pi.on("message_start", async (event: any) => {
		const m = event?.message;
		if (m?.role !== "user") return;
		const words = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.filter((p: any) => p?.type === "text").map((p: any) => p.text).join("") : "";
		confirmDelivery(words);
	});

	const told = new Set<string>();
	let unsub: (() => void) | undefined;
	pi.on("session_start", async (_e: any, ctx: any) => {
		if (!ctx.hasUI) return;
		unsub?.();
		// the user's settings file: read once per session, and a problem in it is said once
		const loaded = loadSettings();
		applySettings(loaded.settings);
		for (const p of loaded.problems) if (!told.has(p)) {
			told.add(p);
			ctx.ui.notify(`openui: ${p}`, "warning");
		}
		hooks.queued = () => {
			try {
				return !!ctx.hasPendingMessages();
			} catch {
				return false; // a context from a replaced session
			}
		};
		unsub = ctx.ui.onTerminalInput((data: string) => {
			recorder.key(data); // only escape sequences and control keys, and only while /openui-events is on
			return handleKey(data) ? { consume: true } : undefined;
		});
		// the note editor is pi's own multi-line editor: Enter saves, Shift+Enter adds a line, Esc cancels
		hooks.prompt = (title: string, initial: string) => ctx.ui.editor(title, initial);
		hooks.toEditor = (text: string) => ctx.ui.pasteToEditor(text);
		ctx.ui.setWidget("openui-hint", (tui: any, theme: any) => {
			hooks.requestRender = () => tui.requestRender();
			return {
				render: (w: number) => {
					if (!active.id) return [];
					const e = entryOf(active.id);
					const keys = e?.state.noteMode
						? "notes: click or Enter writes a note  arrows/Tab move  Shift+Enter picks the parent  Esc leaves"
						: e?.state.focus && e.block?.targets.find((t: any) => t.id === e.state.focus)?.kind === "pan"
							? "left/right arrows scroll, Shift or PageUp/PageDown a page  Tab next  Esc leave"
							: e?.state.focus
							? "arrows move  Tab next  Enter activate  Esc close/leave"
							: "Tab or arrows select  Enter activate  Esc leave";
					return [truncateToWidth(theme.fg("accent", " openui ") + theme.fg("dim", keys), w)];
				},
				invalidate() {},
			};
		});
	});
	pi.on("session_shutdown", async () => {
		unsub?.();
		unsub = undefined;
		resetAll(); // a pi process lives for days across /new and resume: each session's widgets must not pile up
	});
}
