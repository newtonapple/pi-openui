// Documentation stays true: examples compile, every argument is explained, generated pages are current, links resolve.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateDocs } from "../scripts/gen_docs.ts";
import { DOCS } from "../src/lang/docs.ts";
import { compile, LIB, SPECS } from "../src/lang/library.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("every component has a page, and every argument of it and its helpers is explained", () => {
	const top = SPECS.filter((s) => !s.helper).map((s) => s.name);
	assert.deepEqual(top.filter((n) => !DOCS[n]), [], "undocumented components");
	const missing: string[] = [];
	for (const [name, doc] of Object.entries(DOCS)) {
		assert.ok(LIB.has(name), `${name} is a real component`);
		for (const h of doc.helpers ?? []) assert.ok(LIB.get(h)?.helper, `${h} is a helper`);
		for (const comp of [name, ...(doc.helpers ?? [])]) for (const p of LIB.get(comp)!.params) if (!doc.args[`${comp}.${p.name}`]?.trim()) missing.push(`${comp}.${p.name}`);
		for (const key of Object.keys(doc.args)) {
			const [c, a] = key.split(".");
			assert.ok([name, ...(doc.helpers ?? [])].includes(c) && LIB.get(c)!.params.some((p) => p.name === a), `${name}: note for ${key} matches nothing`);
		}
	}
	assert.deepEqual(missing, [], "arguments without a note");
	// every helper belongs to some page
	const covered = new Set(Object.values(DOCS).flatMap((d) => d.helpers ?? []));
	const orphans = SPECS.filter((s) => s.helper && s.name !== "Tooltip" && !covered.has(s.name)).map((s) => s.name);
	assert.deepEqual(orphans, [], "helpers no page documents");
});

test("every example in the docs compiles, and is not trivially tiny", () => {
	for (const [name, doc] of Object.entries(DOCS)) {
		const r = compile(doc.example);
		assert.deepEqual(r.errors, [], `${name} example`);
		assert.ok(doc.example.includes(name + "(") || name === "Stack" || name === "Text", `${name} example uses ${name}`);
	}
});

test("every example in the generated pages compiles (what the reader copies is what was tested)", () => {
	const files = generateDocs();
	let n = 0;
	for (const [path, text] of Object.entries(files)) {
		for (const m of text.matchAll(/```openui\n([\s\S]*?)```/g)) {
			n++;
			assert.deepEqual(compile(m[1]).errors, [], `${path}: example ${n}`);
		}
	}
	assert.ok(n >= 24, `checked ${n} examples`);
});

test("the generated component pages on disk are up to date (run: npm run docs)", () => {
	for (const [path, text] of Object.entries(generateDocs())) {
		const disk = existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8") : null;
		assert.equal(disk, text.endsWith("\n") ? text : text + "\n", `${path} is stale: run npm run docs`);
	}
});

function markdownFiles(dir: string, out: string[] = []): string[] {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === "node_modules" || e.name.startsWith(".git")) continue;
		const p = join(dir, e.name);
		if (e.isDirectory()) markdownFiles(p, out);
		else if (e.name.endsWith(".md")) out.push(p);
	}
	return out;
}

test("every relative link and image in the docs points at a file that exists", () => {
	const broken: string[] = [];
	for (const file of markdownFiles(ROOT)) {
		// code is not a link: a page about image syntax has to be able to show it
		const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
		const refs = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).concat([...text.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]));
		for (const ref of refs) {
			// an absolute link into this repository (the README uses them, see package.test.ts) must name a file that exists
			const own = /^https:\/\/(?:github\.com\/newtonapple\/pi-openui\/(?:blob|tree)|raw\.githubusercontent\.com\/newtonapple\/pi-openui)\/main\/([^#?]*)/.exec(ref);
			if (own) {
				if (!existsSync(join(ROOT, own[1]))) broken.push(`${file.replace(ROOT + "/", "")} -> ${ref}`);
				continue;
			}
			if (/^(https?:|mailto:|#)/.test(ref)) continue;
			const target = resolve(dirname(file), ref.split("#")[0]);
			if (!existsSync(target)) broken.push(`${file.replace(ROOT + "/", "")} -> ${ref}`);
		}
	}
	assert.deepEqual(broken, []);
});

test("every screenshot is used by a page, and every page screenshot exists", () => {
	const used = new Set<string>();
	for (const doc of Object.values(DOCS)) for (const s of doc.shots) used.add(s.file);
	for (const s of ["table-tooltip", "table-panel", "line-tooltip", "pie-tooltip"]) used.add(s);
	const onDisk = readdirSync(join(ROOT, "docs/screenshots")).filter((f) => f.endsWith(".png")).map((f) => f.replace(/\.png$/, ""));
	assert.deepEqual([...used].filter((f) => !onDisk.includes(f)), [], "referenced but missing");
	// the README, the interaction guide, and package.json (pi.image is the preview picture on pi.dev)
	const readme = ["README.md", "docs/interaction.md", "package.json"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
	const unused = onDisk.filter((f) => !used.has(f) && !readme.includes(`screenshots/${f}.png`));
	assert.deepEqual(unused, [], "screenshots nothing links to");
});
