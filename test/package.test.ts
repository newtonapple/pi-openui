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

test("the listing on npm and pi.dev: a short description, tidy keywords with pi-package, a preview picture that exists", () => {
	assert.ok(pkg.description.length >= 40 && pkg.description.length <= 160, `the description is ${pkg.description.length} characters: one sentence, short enough for a catalog card`);
	assert.ok(pkg.keywords.includes("pi-package"), "pi.dev lists npm packages that carry this keyword");
	assert.ok(pkg.keywords.includes("pi-extension"));
	assert.equal(new Set(pkg.keywords).size, pkg.keywords.length, "no keyword twice");
	for (const k of pkg.keywords) assert.match(k, /^[a-z0-9-]+$/, `keyword "${k}" is lower case`);
	const slug = pkg.repository.url.match(/github\.com\/([\w-]+\/pi-openui)/)[1];
	const m = new RegExp(`^https://raw\\.githubusercontent\\.com/${slug}/main/(docs/screenshots/[\\w-]+\\.png)$`).exec(pkg.pi.image);
	assert.ok(m, `pi.image is a raw GitHub URL of a screenshot: ${pkg.pi.image}`);
	assert.ok(existsSync(join(ROOT, m![1])), `${m![1]} exists, so the URL works once pushed`);
});

test("the README says how to install: from npm first, then git, with this package's real name", () => {
	const readme = readFileSync(join(ROOT, "README.md"), "utf8");
	const slug = pkg.repository.url.match(/github\.com\/([\w-]+\/pi-openui)/)[1];
	const install = readme.slice(readme.indexOf("## Install"), readme.indexOf("## Use it"));
	assert.ok(install.length > 200, "an Install section comes before the usage");
	for (const cmd of [`pi install npm:${pkg.name}`, `pi install git:github.com/${slug}`, `pi -e npm:${pkg.name}`, "pi list", "pi update --extensions", `pi remove npm:${pkg.name}`]) assert.ok(install.includes(cmd), `the install section has \`${cmd}\``);
	assert.ok(install.indexOf(`pi install npm:${pkg.name}`) < install.indexOf(`pi install git:`), "npm is the first way shown");
	// the pinned-version example is a real release, not necessarily the newest: it must not need editing at every release
	const pinned = new RegExp(`pi install npm:${pkg.name}@(\\d+\\.\\d+\\.\\d+)`).exec(install);
	assert.ok(pinned, "the install section shows how to install one version");
	assert.ok(new RegExp(`^## ${pinned![1].replace(/\./g, "\\.")} \\(`, "m").test(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8")), `${pinned![1]} is a version in the changelog`);
});

test("the changelog always has an Unreleased section on top and a heading for the version in package.json (what make publish checks)", () => {
	const text = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
	const headings = text.split("\n").filter((l) => l.startsWith("## "));
	assert.equal(headings[0], "## Unreleased");
	assert.match(headings[1], new RegExp(`^## ${pkg.version.replace(/\./g, "\\.")} \\(\\d{4}-\\d{2}-\\d{2}\\)$`), "the newest release is the version in package.json, with a date");
	// pi shows this file to users after an update, and reads the version from a heading like this one
	assert.match(headings[1], /^##\s+\[?\d+\.\d+\.\d+\]?/);
});

test("the README works where it is shown: GitHub, npm and pi.dev (no raw HTML, no relative link to a file the package does not ship)", () => {
	// pi.dev keeps markdown images and drops raw HTML (<table>, <img>: checked against other packages' pages), and it rewrites a
	// relative path to a CDN copy of the npm tarball, so a relative link works only for a file the tarball contains.
	const readme = readFileSync(join(ROOT, "README.md"), "utf8");
	const prose = readme.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
	assert.deepEqual([...new Set([...prose.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1]))], [], "no raw HTML tags: they vanish on pi.dev");
	const shipped = (target: string) => ["README.md", "LICENSE", "CHANGELOG.md", "package.json"].includes(target) || pkg.files.some((f: string) => target === f || target.startsWith(f + "/"));
	const relative = [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/^(https?:|#|mailto:)/.test(u));
	for (const u of relative) assert.ok(shipped(u.split("#")[0]), `${u} is a relative link to a file the npm package does not contain: it is a 404 on pi.dev. Make it an absolute GitHub URL`);
	const pictures = [...prose.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
	assert.ok(pictures.length >= 3, "the README shows its screenshots");
	for (const u of pictures) assert.match(u, /^https:\/\/raw\.githubusercontent\.com\/newtonapple\/pi-openui\/main\/docs\/screenshots\/[\w-]+\.png$/, "a picture is a markdown image with an absolute raw GitHub URL");
});
