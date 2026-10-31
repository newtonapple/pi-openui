// The package manifest. `pi install <source>` finds the extension only through the `pi` key (it is not in a conventional
// extensions/ folder), and pi supplies its own packages to extensions: they must be peers, never bundled dependencies.
// Without the `pi` key an install "succeeds" and then pi fails with "Cannot find module".
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

/** The modules a source file imports: static `import ... from "x"`, `export ... from "x"`, and `import("x")`. */
function imports(file: string): string[] {
	const text = readFileSync(file, "utf8");
	return [...text.matchAll(/^\s*(?:import|export)\b[^"'\n]*?\bfrom\s+"([^"]+)"/gm), ...text.matchAll(/^\s*import\s+"([^"]+)"/gm), ...text.matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
}

function sources(dir: string, out: string[] = []): string[] {
	for (const f of readdirSync(dir)) {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) sources(p, out);
		else if (f.endsWith(".ts")) out.push(p);
	}
	return out;
}

test("the pi key points at the extension, and the extension is a default-exported function", async () => {
	assert.deepEqual(pkg.pi.extensions, ["./src/pi/extension.ts"]);
	for (const e of pkg.pi.extensions) assert.ok(existsSync(join(ROOT, e)), `${e} exists`);
	assert.ok(pkg.keywords.includes("pi-package"), "the keyword that lists it in pi's package gallery");
	const text = readFileSync(join(ROOT, "src/pi/extension.ts"), "utf8");
	assert.match(text, /export default function/);
});

test("the project-local shim and the manifest load the same file", () => {
	const shim = readFileSync(join(ROOT, ".pi/extensions/openui.ts"), "utf8");
	assert.match(shim, /export \{ default \} from "\.\.\/\.\.\/src\/pi\/extension\.ts"/);
});

test("every package pi supplies that the source imports is a peer dependency, and none is a dependency", () => {
	const host = ["@earendil-works/pi-ai", "@earendil-works/pi-agent-core", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"];
	const used = new Set<string>();
	for (const f of sources(join(ROOT, "src"))) for (const m of imports(f)) if (host.includes(m)) used.add(m);
	assert.ok(used.size >= 3, `the source imports ${[...used].join(", ")}`);
	for (const name of used) assert.equal(pkg.peerDependencies?.[name], "*", `${name} is a peer dependency with range "*"`);
	for (const name of host) assert.equal(pkg.dependencies?.[name], undefined, `${name} is not bundled: a second copy would split pi's classes and registries`);
});

test("the extension imports nothing that needs installing: no runtime dependency outside pi and node", () => {
	const ok = (m: string) => m.startsWith("node:") || m.startsWith(".") || m.startsWith("@earendil-works/") || m === "typebox";
	const bad: string[] = [];
	for (const f of sources(join(ROOT, "src"))) for (const m of imports(f)) if (!ok(m)) bad.push(`${f.replace(ROOT + "/", "")}: ${m}`);
	assert.deepEqual(bad, []);
	assert.equal(pkg.dependencies, undefined);
});

test("it is licensed and described for publishing: MIT file and field, repository, and a files list that ships only the source", () => {
	assert.equal(pkg.license, "MIT");
	const text = readFileSync(join(ROOT, "LICENSE"), "utf8");
	assert.match(text, /^MIT License\n\nCopyright \(c\) \d{4} \S/);
	assert.match(text, /Permission is hereby granted, free of charge/);
	assert.equal(pkg.repository.type, "git");
	assert.match(pkg.repository.url, /^git\+https:\/\/github\.com\/[\w-]+\/pi-openui\.git$/);
	const slug = pkg.repository.url.match(/github\.com\/([\w-]+\/pi-openui)/)[1];
	assert.equal(pkg.homepage, `https://github.com/${slug}#readme`);
	assert.equal(pkg.bugs.url, `https://github.com/${slug}/issues`);
	assert.deepEqual(pkg.files, ["src", "CHANGELOG.md"], "npm ships the source and the changelog, not the tests and screenshots");
	const readme = readFileSync(join(ROOT, "README.md"), "utf8");
	assert.ok(readme.includes(`git:github.com/${slug}`), "the README's install command names the same repository");
	assert.ok(!readme.includes("<owner>"), "no placeholder left in the README");
	assert.match(readme, /## License\n\n\[MIT\]\(LICENSE\)/);
});
