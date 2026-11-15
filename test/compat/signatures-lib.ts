// What "the language is backward compatible" means for the table of signatures (SPECS in src/lang/library.ts), as code. Shared
// by test/signatures.test.ts and scripts/freeze-signatures.ts. Pure.
import type { CompSpec, T } from "../../src/lang/library.ts";

export interface FrozenParam {
	name: string;
	t: T;
	opt: boolean;
	/** most characters of a string argument, when the argument says so */
	max?: number;
}
export interface Snapshot {
	/** why this file exists, for the person who finds it */
	note?: string;
	components: Record<string, { helper?: boolean; params: FrozenParam[] }>;
	limits: Record<string, number>;
}

export function snapshotOf(specs: readonly CompSpec[], limits: Record<string, number>): Snapshot {
	const components: Snapshot["components"] = {};
	for (const s of specs) components[s.name] = { ...(s.helper ? { helper: true } : {}), params: s.params.map((p) => ({ name: p.name, t: p.t, opt: !!p.opt, ...(p.max ? { max: p.max } : {}) })) };
	return { components, limits: { ...limits } };
}

const sameSet = (frozen: readonly string[], now: readonly string[]) => frozen.every((v) => now.includes(v));

/** Can everything that `old` accepted still be written? A type may accept more (a longer list, another choice), never less. */
export function compatible(old: T, now: T): boolean {
	if (typeof old === "string" || typeof now === "string") return old === now || (old === "string" && now === "cell");
	if ("enum" in old) return "enum" in now && sameSet(old.enum, now.enum);
	if ("comp" in old) return "comp" in now && sameSet(old.comp, now.comp);
	if (!("arr" in now)) return false;
	return compatible(old.arr, now.arr) && (old.max === undefined || now.max === undefined || now.max >= old.max) && (now.min === undefined || (old.min !== undefined && now.min <= old.min));
}

/** Every way `now` breaks a source written for `frozen`. Empty means it is compatible. */
export function signatureProblems(frozen: Snapshot, now: Snapshot): string[] {
	const out: string[] = [];
	for (const [name, f] of Object.entries(frozen.components)) {
		const c = now.components[name];
		if (!c) {
			out.push(`${name} was removed: a stored source that uses it would not compile. Keep it, or bump LANG_VERSION and add an alias or a migration`);
			continue;
		}
		f.params.forEach((fp, i) => {
			const cp = c.params[i];
			const where = `${name} argument ${i + 1}`;
			if (!cp) return void out.push(`${where} ("${fp.name}") was removed`);
			if (cp.name !== fp.name) return void out.push(`${where} was "${fp.name}" and is now "${cp.name}": an argument was inserted, moved or renamed. Add new arguments at the END`);
			if (fp.opt === false && cp.opt === false) {
				/* required then and now */
			} else if (fp.opt && !cp.opt) out.push(`${where} ("${fp.name}") was optional and is now required`);
			if (!compatible(fp.t, cp.t)) out.push(`${where} ("${fp.name}") accepts less than it did`);
			if (fp.max !== undefined && cp.max !== undefined && cp.max < fp.max) out.push(`${where} ("${fp.name}") allows ${cp.max} characters; it allowed ${fp.max}`);
		});
		c.params.slice(f.params.length).forEach((cp, k) => {
			if (!cp.opt) out.push(`${name} argument ${f.params.length + k + 1} ("${cp.name}") is new and required: a new argument must be optional`);
		});
	}
	for (const [key, v] of Object.entries(frozen.limits)) {
		if (!(key in now.limits)) out.push(`the limit "${key}" was removed`);
		else if (now.limits[key] < v) out.push(`the limit "${key}" is ${now.limits[key]}; it was ${v}. A lower limit refuses sources that were fine`);
	}
	return out;
}

/** The record after adding what is new in `now`: components, trailing arguments, and the highest value each limit has had. Never removes. */
export function mergeSnapshot(frozen: Snapshot, now: Snapshot): Snapshot {
	const out: Snapshot = JSON.parse(JSON.stringify(frozen));
	for (const [name, c] of Object.entries(now.components)) {
		const f = out.components[name];
		if (!f) out.components[name] = JSON.parse(JSON.stringify(c));
		else for (const p of c.params.slice(f.params.length)) f.params.push(JSON.parse(JSON.stringify(p)));
	}
	for (const [key, v] of Object.entries(now.limits)) out.limits[key] = Math.max(out.limits[key] ?? 0, v);
	return out;
}
