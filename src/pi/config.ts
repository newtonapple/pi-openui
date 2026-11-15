// The user's settings for pi-openui: one JSON file next to pi's own, `openui.json` in pi's agent directory.
//
//   { "table": { "minColumnWidth": 12 }, "scroll": { "step": 8 } }
//
// Why not pi's settings.json: pi documents no place in it for another package's keys and may rewrite the file. Why not a
// per-project file: pi asks for trust before it reads those, and how wide a screen is belongs to the user, not the project.
// Everything here takes the file system and the environment as arguments, so the hostile cases are plain tests, and nothing
// throws on bad input: a bad value is the default plus a sentence the person can act on.
//
// A setting is one row of SETTINGS: its place in the file, its environment variable, its range and its default. Adding one is
// adding a row (and a field to `Settings`); validation, the environment, saving and /openui-config all read the table.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Settings {
	/** the narrowest a table column is squeezed to before the table scrolls sideways instead */
	tableMinCol: number;
	/** cells one tap on a fine arrow (‹ ›) scrolls; the page arrows (« ») scroll three quarters of the pane */
	scrollStep: number;
}

export const DEFAULTS: Settings = { tableMinCol: 12, scrollStep: 8 };
export const TABLE_MIN_COL_RANGE = [4, 40] as const;
export const SCROLL_STEP_RANGE = [1, 40] as const;

interface Def {
	/** the dotted name, `section.key` in the file */
	key: SettingKey;
	field: keyof Settings;
	env: string;
	range: readonly [number, number];
	what: string;
}
export type SettingKey = "table.minColumnWidth" | "scroll.step";

const SETTINGS: Def[] = [
	{ key: "table.minColumnWidth", field: "tableMinCol", env: "PI_OPENUI_TABLE_MIN_COL", range: TABLE_MIN_COL_RANGE, what: "the narrowest a table column is squeezed to before the table scrolls" },
	{ key: "scroll.step", field: "scrollStep", env: "PI_OPENUI_SCROLL_STEP", range: SCROLL_STEP_RANGE, what: "cells one tap on a fine arrow scrolls" },
];
const def = (key: string): Def | undefined => SETTINGS.find((d) => d.key === key);
const rangeOf = (d: Def) => `a whole number from ${d.range[0]} to ${d.range[1]}`;

type Env = Record<string, string | undefined>;
type Source = "default" | "file" | "env";

export interface Parsed {
	settings: Settings;
	problems: string[];
	sources: Record<keyof Settings, Source>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A number into the setting's range. A problem is reported when it had to move. */
function fit(d: Def, n: number, where: string, problems: string[]): number {
	const [lo, hi] = d.range;
	const v = Math.min(hi, Math.max(lo, Math.round(n)));
	if (v !== Math.round(n)) problems.push(`${where} is ${n}; ${d.key} must be from ${lo} to ${hi}, so ${v} is used`);
	return v;
}

/** What the file (already parsed, or undefined when there is none) and the environment say. Never throws. */
export function parseSettings(raw: unknown, env: Env): Parsed {
	const problems: string[] = [];
	const settings: Settings = { ...DEFAULTS };
	const sources = Object.fromEntries(SETTINGS.map((d) => [d.field, "default"])) as Record<keyof Settings, Source>;
	if (raw !== undefined && !isObject(raw)) problems.push("openui.json must hold a JSON object, so the defaults are used");
	for (const d of SETTINGS) {
		const [section, name] = d.key.split(".");
		if (isObject(raw)) {
			const sec = raw[section];
			if (sec !== undefined && !isObject(sec)) problems.push(`"${section}" in openui.json must be an object, so the defaults for it are used`);
			else if (isObject(sec) && sec[name] !== undefined) {
				const v = sec[name];
				if (typeof v === "number" && Number.isFinite(v)) {
					settings[d.field] = fit(d, v, `${d.key} in openui.json`, problems);
					sources[d.field] = "file";
				} else problems.push(`${d.key} in openui.json must be ${rangeOf(d)}, so ${DEFAULTS[d.field]} is used`);
			}
		}
		const e = env[d.env];
		if (e !== undefined && e.trim() !== "") {
			const n = Number(e);
			if (Number.isFinite(n)) {
				settings[d.field] = fit(d, n, d.env, problems);
				sources[d.field] = "env";
			} else problems.push(`${d.env}="${e}" is not a number, so it is ignored`);
		}
	}
	return { settings, problems: [...new Set(problems)], sources };
}

export function settingsPath(env: Env = process.env): string {
	return join(env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "openui.json");
}

type Read = (path: string, enc: "utf8") => string;

export function loadSettings(env: Env = process.env, read: Read = readFileSync as Read): Parsed & { path: string } {
	const path = settingsPath(env);
	let raw: unknown;
	const extra: string[] = [];
	try {
		raw = JSON.parse(read(path, "utf8"));
	} catch (e) {
		const code = (e as { code?: string }).code;
		if (code === "ENOENT") raw = undefined;
		else if (e instanceof SyntaxError) extra.push(`${path} is not valid JSON, so the defaults are used`);
		else extra.push(`${path} cannot be read (${code ?? (e as Error).message}), so the defaults are used`);
	}
	const parsed = parseSettings(raw, env);
	return { ...parsed, problems: [...extra, ...parsed.problems], path };
}

interface Fs {
	read: Read;
	write: (path: string, data: string) => void;
	mkdir: (dir: string) => void;
}
const realFs: Fs = { read: readFileSync as Read, write: (p, d) => writeFileSync(p, d), mkdir: (d) => void mkdirSync(d, { recursive: true }) };

/** Set (or, with undefined, remove) one setting, keeping every other key in the file. A file that is not JSON is never overwritten. */
export function saveSetting(path: string, key: SettingKey, value: number | undefined, fs: Fs = realFs): void {
	let obj: Record<string, unknown> = {};
	try {
		const parsed = JSON.parse(fs.read(path, "utf8"));
		if (!isObject(parsed)) throw new Error(`${path} is not a JSON object; fix or delete it`);
		obj = parsed;
	} catch (e) {
		const code = (e as { code?: string }).code;
		if (code !== "ENOENT") {
			if (e instanceof SyntaxError) throw new Error(`${path} is not valid JSON; fix or delete it`);
			throw e;
		}
	}
	const [section, name] = key.split(".");
	const sec = isObject(obj[section]) ? { ...(obj[section] as Record<string, unknown>) } : {};
	if (value === undefined) delete sec[name];
	else sec[name] = value;
	if (Object.keys(sec).length) obj[section] = sec;
	else delete obj[section];
	fs.mkdir(dirname(path));
	fs.write(path, JSON.stringify(obj, null, 2) + "\n");
}

export interface CommandResult {
	message: string;
	level: "info" | "warning" | "error";
	/** the settings now in force, when the command changed them */
	settings?: Settings;
}

/** `/openui-config`: show what is in force, set a setting, or reset one or all. */
export function runConfigCommand(args: string, env: Env = process.env, fs: Fs = realFs): CommandResult {
	const words = args.trim().split(/\s+/).filter(Boolean);
	const path = settingsPath(env);
	const names = SETTINGS.map((d) => d.key).join(" and ");
	if (!words.length) {
		const r = loadSettings(env, fs.read);
		const lines = SETTINGS.map((d) => `${d.key} = ${r.settings[d.field]} (${r.sources[d.field]}): ${d.what}; ${rangeOf(d)}`);
		return { level: "info", message: `${lines.join("\n")}\nFile: ${path}. Change one with /openui-config ${SETTINGS[1].key} ${DEFAULTS.scrollStep + 4}, put it back with /openui-config ${SETTINGS[1].key} reset, or reset everything with /openui-config reset.` };
	}
	const apply = (changes: Array<[Def, number | undefined]>): CommandResult => {
		try {
			for (const [d, v] of changes) saveSetting(path, d.key, v, fs);
		} catch (e) {
			return { level: "error", message: (e as Error).message };
		}
		const r = loadSettings(env, fs.read);
		const said = changes.map(([d, v]) => (v === undefined ? `Reset ${d.key} to ${DEFAULTS[d.field]}.` : `Saved ${d.key} = ${v} in ${path}.`)).join(" ");
		const wins = changes.filter(([d]) => r.sources[d.field] === "env");
		if (wins.length) return { level: "warning", message: `${said} But ${wins.map(([d]) => d.env).join(" and ")} is set and wins: ${wins.map(([d]) => `${d.key} = ${r.settings[d.field]}`).join(", ")} is in force.`, settings: r.settings };
		return { level: "info", message: said, settings: r.settings };
	};
	if (words[0] === "reset" && words.length === 1) return apply(SETTINGS.map((d) => [d, undefined]));
	const d = def(words[0]);
	if (!d) return { level: "error", message: `Unknown setting "${words[0]}". The settings are ${names}: /openui-config ${SETTINGS[0].key} 14, or /openui-config reset.` };
	const given = words[1];
	if (given === "reset") return apply([[d, undefined]]);
	if (given === undefined || !/^\d+$/.test(given)) return { level: "error", message: `${d.key} takes ${rangeOf(d)}${given === undefined ? "" : ` (got "${given}")`}.` };
	const n = Number(given);
	if (n < d.range[0] || n > d.range[1]) return { level: "error", message: `${d.key} takes ${rangeOf(d)} (got ${n}).` };
	return apply([[d, n]]);
}
