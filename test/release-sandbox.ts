// A sandbox for the release tests: a throwaway git repo with a local bare "origin", this repository's Makefile and
// scripts/release.ts, and a stand-in for npm. Not a test file itself (the glob is test/*.test.ts).
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const hasMake = spawnSync("make", ["--version"]).status === 0;
export const skip = hasMake ? false : "make is not installed";

const FAKE_NPM = `
// A stand-in for npm: it answers whoami, view, publish, test and pack, and leaves everything else (version) to the real npm.
const fs = require("fs");
const cp = require("child_process");
const [cmd, ...args] = process.argv.slice(2);
const file = process.env.FAKE_NPM_STATE;
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { published: {}, calls: [] };
state.calls.push([cmd, ...args].join(" "));
fs.writeFileSync(file, JSON.stringify(state));
const save = () => fs.writeFileSync(file, JSON.stringify(state));
if (cmd === "whoami") {
	if (process.env.FAKE_LOGGED_OUT) { console.error("npm error code ENEEDAUTH"); process.exit(1); }
	console.log("tester");
} else if (cmd === "view") {
	if (process.env.FAKE_OFFLINE) { console.error("npm error code ECONNREFUSED"); process.exit(1); }
	const rec = state.published[args[0]];
	if (!rec) { console.error("npm error code E404\\nnpm error 404 Not Found - GET https://registry.npmjs.org/x"); process.exit(1); }
	console.log(args[1] === "gitHead" ? rec.gitHead : rec.version);
} else if (cmd === "publish") {
	if (process.env.FAKE_PUBLISH_FAIL) { console.error("npm error code EOTP"); process.exit(1); }
	const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
	state.published[pkg.name + "@" + pkg.version] = { version: pkg.version, gitHead: cp.execSync("git rev-parse HEAD").toString().trim() };
	save();
} else if (cmd === "test" || cmd === "pack") {
	// nothing to do
} else {
	process.exit(cp.spawnSync("npm", [cmd, ...args], { stdio: "inherit" }).status ?? 1);
}
`;

export interface Sandbox {
	dir: string;
	work: string;
	origin: string;
	git: (...a: string[]) => string;
	make: (args: string[], env?: Record<string, string>) => { status: number; out: string };
	state: () => { published: Record<string, { version: string; gitHead: string }>; calls: string[] };
	commit: (msg: string) => void;
	pkg: () => { version: string };
	remoteRef: (ref: string) => string;
	cleanup: () => void;
}

export function sandbox(): Sandbox {
	const dir = mkdtempSync(join(tmpdir(), "openui-release-"));
	const work = join(dir, "work");
	const origin = join(dir, "origin.git");
	const run = (cwd: string, ...a: string[]) => {
		const r = spawnSync("git", a, { cwd, encoding: "utf8" });
		if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
		return r.stdout.trim();
	};
	mkdirSync(work);
	run(dir, "init", "-q", "--bare", "-b", "main", origin);
	run(work, "init", "-q", "-b", "main");
	for (const [k, v] of [["user.name", "Test"], ["user.email", "t@example.com"], ["commit.gpgsign", "false"], ["tag.gpgsign", "false"]]) run(work, "config", k, v);
	run(work, "remote", "add", "origin", origin);
	mkdirSync(join(work, "scripts"));
	copyFileSync(join(ROOT, "Makefile"), join(work, "Makefile"));
	copyFileSync(join(ROOT, "scripts/release.ts"), join(work, "scripts/release.ts"));
	writeFileSync(join(work, "package.json"), JSON.stringify({ name: "demo-pkg", version: "0.1.0", type: "module" }, null, 2) + "\n");
	writeFileSync(join(work, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## 0.1.0 (2026-01-01)\n\n- First version.\n");
	writeFileSync(join(dir, "fake-npm.js"), FAKE_NPM);
	run(work, "add", "-A");
	run(work, "commit", "-q", "-m", "Initial");
	run(work, "push", "-q", "-u", "origin", "main");
	const stateFile = join(dir, "state.json");
	return {
		dir,
		work,
		origin,
		git: (...a) => run(work, ...a),
		make(args, env = {}) {
			const r = spawnSync("make", args, { cwd: work, encoding: "utf8", env: { ...process.env, NPM: `node ${join(dir, "fake-npm.js")}`, FAKE_NPM_STATE: stateFile, RELEASE_DATE: "2026-03-04", ...env } });
			return { status: r.status ?? -1, out: (r.stdout ?? "") + (r.stderr ?? "") };
		},
		state: () => {
			try {
				return JSON.parse(readFileSync(stateFile, "utf8"));
			} catch {
				return { published: {}, calls: [] };
			}
		},
		commit(msg) {
			writeFileSync(join(work, `file-${Math.random().toString(36).slice(2)}.txt`), msg);
			run(work, "add", "-A");
			run(work, "commit", "-q", "-m", msg);
		},
		pkg: () => JSON.parse(readFileSync(join(work, "package.json"), "utf8")),
		remoteRef: (ref) => spawnSync("git", ["rev-parse", "-q", "--verify", ref], { cwd: origin, encoding: "utf8" }).stdout.trim(),
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

/** Add an entry under Unreleased, commit and push it, the way a maintainer does before a release. */
export function withEntry(s: Sandbox, entry = "- Added a feature.") {
	const text = readFileSync(join(s.work, "CHANGELOG.md"), "utf8").replace("## Unreleased\n", `## Unreleased\n\n${entry}\n`);
	writeFileSync(join(s.work, "CHANGELOG.md"), text);
	s.git("add", "-A");
	s.git("commit", "-q", "-m", "Add a feature");
	s.git("push", "-q", "origin", "main");
}

/** Everything that matters about the state, to prove a refusal changed nothing. */
export const snapshot = (s: Sandbox) => JSON.stringify({ head: s.git("rev-parse", "HEAD"), tags: s.git("tag"), pkg: s.pkg(), published: Object.keys(s.state().published), origin: s.remoteRef("refs/heads/main"), originTags: s.remoteRef("refs/tags/v0.1.1") });

