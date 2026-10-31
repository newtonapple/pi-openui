// pi extension: render_widget (OpenUI Lang -> interactive terminal widget) plus a few commands.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { compile, LIMITS, reference, type Compiled, type El } from "../lang/library.ts";
import { markdownImages } from "../lang/md.ts";
import { LANG_SAMPLES } from "../lang/samples.ts";
import { getCapabilities } from "@earendil-works/pi-tui";
import { loadImage } from "./images.ts";
import { active, armNewest, entryOf, handleKey, hooks, OpenUIWidget, resetAll, toggleNotesNewest } from "./widget.ts";

const compiled = new Map<string, Compiled>();
let compiledChars = 0;
/** A source is the key, so the cache is bounded by size as well as count: 64 sources at the 100 KB limit would be 6 MB. */
const CACHE_CHARS = 2_000_000;
export function compileCached(source: string): Compiled {
	if (source.length > LIMITS.source) return compile(source); // rejected at once; never kept
	let c = compiled.get(source);
	if (!c) {
		c = compile(source);
		if (compiled.size >= 64 || compiledChars + source.length > CACHE_CHARS) {
			compiled.clear();
			compiledChars = 0;
		}
		compiled.set(source, c);
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

export default function (pi: ExtensionAPI) {
	hooks.sendLive = (text) => pi.sendUserMessage(text, { deliverAs: "followUp" });
	hooks.sendEcho = (text) => pi.sendMessage({ customType: "openui-click", content: `[widget click → assistant] ${text}`, display: true });

	pi.registerTool({
		name: "render_widget",
		label: "render_widget",
		description:
			"Draw an interactive widget in the terminal: dashboards, tables, charts (bar, line, area, pie, radar), diagrams (DAG, ER, infrastructure map, sequence), maps, tabs, buttons and choices. Pass OpenUI Lang as `source`. Call with reference=true once to get the component signatures. Clicking a Button or Choice sends its text back to you as the user's next message.",
		promptSnippet: "render_widget: draw an interactive terminal widget (dashboards, charts, diagrams) from OpenUI Lang",
		promptGuidelines: [
			"Before the first render_widget call in a session, call render_widget with reference=true to read the component signatures. Never guess a signature.",
			"After render_widget succeeds, reply with at most one short sentence. Do not repeat the widget's data in prose.",
			"If render_widget returns errors, fix exactly the errors listed and call it again with the full corrected source.",
			"Use plain text, not a widget, for a single value or a short answer. One widget per reply: use Tabs or Card to organise sections.",
			"A click on a widget Button or Choice arrives as your next user message: act on it, then render a NEW widget if needed.",
		],
		parameters: Type.Object({
			source: Type.Optional(Type.String({ description: "OpenUI Lang source: root = Stack([...]) first, one statement per line" })),
			reference: Type.Optional(Type.Boolean({ description: "Return the component reference instead of drawing" })),
		}),
		renderShell: "self",
		async execute(_id: string, params: { source?: string; reference?: boolean }) {
			if (params.reference || params.source === undefined) return { content: [{ type: "text" as const, text: reference() }], details: { kind: "reference" } };
			const c = compileCached(params.source);
			if (!c.ok) throw new Error(`The widget was not drawn: ${c.errors.length} error(s). Fix these and call render_widget again with the full corrected source.\n${c.errors.map((e) => `- ${e}`).join("\n")}`);
			const imgErrs = checkImages(c.root);
			if (imgErrs.length) throw new Error(`The widget was not drawn: ${imgErrs.length} error(s). Fix these and call render_widget again with the full corrected source.\n${imgErrs.map((e) => `- ${e}`).join("\n")}`);
			const hasImage = picturesIn(c.root).length > 0;
			const noPics = hasImage && getCapabilities().images !== "kitty";
			const note = [...c.warnings, ...(noPics ? ["this terminal cannot show pictures, so each Image is drawn as a labelled frame with its file details"] : [])];
			const noteText = note.length ? ` Notes: ${note.join("; ")}.` : "";
			return { content: [{ type: "text" as const, text: `Widget drawn. The user can see and click it in the terminal; do not repeat its contents.${noteText}` }], details: { kind: "widget", source: params.source } };
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
			const c = compileCached(String(result.details.source ?? ""));
			if (!c.ok || !c.root) return new Text(theme.fg("error", "widget could not be restored"), 0, 0);
			return new OpenUIWidget(ctx.toolCallId, c.root, theme, "live");
		},
	});

	pi.registerMessageRenderer("openui-widget", (message: any, _o: any, theme: any) => {
		const c = compileCached(String(message.details?.source ?? ""));
		if (!c.ok || !c.root) return undefined;
		return new OpenUIWidget(String(message.details.id), c.root, theme, message.details.mode === "live" ? "live" : "echo");
	});

	const draw = (source: string, title: string, ctx: any) => {
		const c = compileCached(source);
		if (!c.ok) return ctx.ui.notify(`${title}: ${c.errors.slice(0, 3).join(" | ")}`, "error");
		pi.sendMessage({ customType: "openui-widget", content: `[widget: ${title}]`, display: true, details: { id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, source, mode: "echo" } });
	};

	pi.registerCommand("openui-gallery", {
		description: "Draw one example per OpenUI component (or a key prefix: dashboard, table, tabs, line, pie, radar, image, dag, erd, infra, sequence, geo ...). Clicks echo locally.",
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

	let unsub: (() => void) | undefined;
	pi.on("session_start", async (_e: any, ctx: any) => {
		if (!ctx.hasUI) return;
		unsub?.();
		unsub = ctx.ui.onTerminalInput((data: string) => (handleKey(data) ? { consume: true } : undefined));
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
