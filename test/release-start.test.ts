// What the start of a release refuses, in a sandbox: each refusal says why and changes nothing. See release-sandbox.ts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { sandbox, skip, snapshot, withEntry, ROOT, type Sandbox } from "./release-sandbox.ts";

test("a refused start changes nothing: dirty tree, wrong branch, behind or ahead of origin, empty Unreleased, no BUMP", { skip }, () => {
	const cases: Array<[string, (s: Sandbox) => void, string[], RegExp]> = [
		["uncommitted changes", (s) => writeFileSync(join(s.work, "stray.txt"), "x"), ["release", "BUMP=patch"], /no uncommitted changes/],
		["another branch", (s) => s.git("switch", "-q", "-c", "topic"), ["release", "BUMP=patch"], /on main/],
		["unpushed commits", (s) => s.commit("local only"), ["release", "BUMP=patch"], /in step with origin\/main/],
		["behind origin", (s) => {
			const other = join(s.dir, "other");
			spawnSync("git", ["clone", "-q", s.origin, other]);
			writeFileSync(join(other, "x.txt"), "x");
			for (const a of [["config", "user.name", "T"], ["config", "user.email", "t@e.com"], ["add", "-A"], ["commit", "-q", "-m", "elsewhere"], ["push", "-q", "origin", "main"]]) spawnSync("git", a, { cwd: other });
		}, ["release", "BUMP=patch"], /not behind origin\/main/],
		["nothing under Unreleased", () => {}, ["release", "BUMP=patch"], /something under "## Unreleased"/],
		["no BUMP", (s) => withEntry(s), ["release"], /BUMP is required/],
		["a BUMP that is nonsense", (s) => withEntry(s), ["version", "BUMP=soon"], /is not patch, minor, major/],
	];
	for (const [name, setup, args, message] of cases) {
		const s = sandbox();
		try {
			setup(s);
			const before = snapshot(s);
			const r = s.make(args);
			assert.notEqual(r.status, 0, `${name}: refused`);
			assert.match(r.out, message, `${name}: says why\n${r.out}`);
			assert.equal(snapshot(s), before, `${name}: nothing changed`);
			assert.deepEqual(s.state().calls.filter((c) => /^(publish|version)/.test(c)), [], `${name}: npm was not asked to publish or bump`);
		} finally {
			s.cleanup();
		}
	}
});

test("tests that fail only on the bumped tree leave nothing behind: no release commit, version and changelog as they were", { skip }, () => {
	for (const args of [["version", "BUMP=patch"], ["release", "BUMP=patch"]]) {
		const s = sandbox();
		try {
			withEntry(s);
			const before = snapshot(s);
			const changelog = readFileSync(join(s.work, "CHANGELOG.md"), "utf8");
			const r = s.make(args, { FAKE_TEST_FAILS_ON: "0.1.1" });
			assert.notEqual(r.status, 0, `${args[0]}: refused\n${r.out}`);
			assert.match(r.out, /tests fail on 0\.1\.1/, `${args[0]}: says why`);
			assert.equal(snapshot(s), before, `${args[0]}: no commit, no tag, package.json back at 0.1.0, nothing published`);
			assert.equal(readFileSync(join(s.work, "CHANGELOG.md"), "utf8"), changelog, `${args[0]}: the changelog is as it was`);
			assert.equal(s.git("status", "--porcelain"), "", `${args[0]}: no leftover changes`);
			assert.deepEqual(s.state().calls.filter((c) => c === "publish"), [], `${args[0]}: nothing published`);
		} finally {
			s.cleanup();
		}
	}
});
