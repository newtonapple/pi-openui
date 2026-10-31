// What publishing and tagging refuse, in a sandbox: each refusal says why and changes nothing. See release-sandbox.ts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { sandbox, skip, snapshot, withEntry, ROOT, type Sandbox } from "./release-sandbox.ts";

test("a refused publish changes nothing: logged out, registry unreachable, version already on npm, tag already there, no changelog heading", { skip }, () => {
	const cases: Array<[string, (s: Sandbox) => void, Record<string, string>, RegExp]> = [
		["not logged in", () => {}, { FAKE_LOGGED_OUT: "1" }, /logged in to npm/],
		["registry unreachable", () => {}, { FAKE_OFFLINE: "1" }, /could not ask npm whether 0\.1\.0 exists/],
		["already published", (s) => s.make(["publish"]), {}, /0\.1\.0 is not on npm yet/],
		["tag already made", (s) => s.git("tag", "v0.1.0"), {}, /no tag v0\.1\.0 yet/],
		["no changelog heading", (s) => {
			writeFileSync(join(s.work, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- x\n");
			s.git("add", "-A");
			s.git("commit", "-q", "-m", "drop the heading");
		}, {}, /CHANGELOG\.md has a heading for 0\.1\.0/],
	];
	for (const [name, setup, env, message] of cases) {
		const s = sandbox();
		try {
			setup(s);
			const before = s.state().calls.filter((c) => c === "publish").length;
			const r = s.make(["publish"], env);
			assert.notEqual(r.status, 0, `${name}: refused\n${r.out}`);
			assert.match(r.out, message, `${name}: says why`);
			assert.equal(s.state().calls.filter((c) => c === "publish").length, before, `${name}: npm publish was not run`);
			assert.equal(s.git("tag").split("\n").filter(Boolean).length, name === "tag already made" ? 1 : 0, `${name}: no tag was made`);
		} finally {
			s.cleanup();
		}
	}
});

test("make tag only tags what npm published, and exactly that commit, even after later commits", { skip }, () => {
	const s = sandbox();
	try {
		let r = s.make(["tag"]);
		assert.notEqual(r.status, 0);
		assert.match(r.out, /not on npm, so there is nothing to tag yet/);
		assert.equal(s.git("tag"), "", "nothing tagged before publishing");
		r = s.make(["push"]);
		assert.notEqual(r.status, 0);
		assert.match(r.out, /there is no tag v0\.1\.0 to push/);
		const published = s.git("rev-parse", "HEAD");
		assert.equal(s.make(["publish"]).status, 0);
		s.commit("a later commit");
		assert.equal(s.make(["tag"]).status, 0);
		assert.equal(s.git("rev-parse", "v0.1.0^{commit}"), published, "the tag is on the published commit, not on HEAD");
		assert.notEqual(published, s.git("rev-parse", "HEAD"));
		const again = s.make(["tag"]);
		assert.equal(again.status, 0);
		assert.match(again.out, /already points at/, "running it twice is harmless");
	} finally {
		s.cleanup();
	}
});
