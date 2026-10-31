// The release flow in a sandbox: the first release, and a normal one. See release-sandbox.ts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { sandbox, skip, snapshot, withEntry, ROOT, type Sandbox } from "./release-sandbox.ts";

test("the first release (already versioned): make publish tag push publishes, tags the published commit, and pushes both", { skip }, () => {
	const s = sandbox();
	try {
		const head = s.git("rev-parse", "HEAD");
		const r = s.make(["publish", "tag", "push"]);
		assert.equal(r.status, 0, r.out);
		assert.equal(s.state().published["demo-pkg@0.1.0"].gitHead, head);
		assert.equal(s.git("cat-file", "-t", "refs/tags/v0.1.0"), "tag", "an annotated tag, not a lightweight one");
		assert.equal(s.git("rev-parse", "v0.1.0^{commit}"), head);
		assert.match(s.git("tag", "-n9", "v0.1.0"), /First version\./, "the tag carries the changelog notes");
		assert.equal(s.remoteRef("refs/tags/v0.1.0^{commit}"), head, "the tag is on origin");
		assert.equal(s.remoteRef("refs/heads/main"), head);
		assert.deepEqual(s.state().calls.filter((c) => c.startsWith("publish")), ["publish"], "published exactly once");
	} finally {
		s.cleanup();
	}
});

test("make release BUMP=patch: tests, version and changelog in one commit, publish, tag the published commit, push", { skip }, () => {
	const s = sandbox();
	try {
		assert.equal(s.make(["publish", "tag", "push"]).status, 0);
		withEntry(s, "- Added a feature.");
		const r = s.make(["release", "BUMP=patch"]);
		assert.equal(r.status, 0, r.out);
		assert.equal(s.pkg().version, "0.1.1");
		const changelog = readFileSync(join(s.work, "CHANGELOG.md"), "utf8");
		assert.match(changelog, /^# Changelog\n\n## Unreleased\n\n## 0\.1\.1 \(2026-03-04\)\n\n- Added a feature\.\n\n## 0\.1\.0 \(2026-01-01\)/);
		assert.equal(s.git("log", "-1", "--format=%s"), "Release v0.1.1");
		assert.match(s.git("log", "-1", "--format=%b"), /Added a feature/, "the commit body is the release notes");
		assert.deepEqual(s.git("show", "--name-only", "--format=", "HEAD").split("\n").sort(), ["CHANGELOG.md", "package.json"], "the release commit is the version and the changelog, nothing else");
		const release = s.git("rev-parse", "HEAD");
		assert.equal(s.state().published["demo-pkg@0.1.1"].gitHead, release, "published from the release commit");
		assert.equal(s.git("rev-parse", "v0.1.1^{commit}"), release);
		assert.equal(s.remoteRef("refs/heads/main"), release, "pushed");
		assert.equal(s.remoteRef("refs/tags/v0.1.1^{commit}"), release, "tag pushed");
		const calls = s.state().calls;
		assert.ok(calls.indexOf("test") < calls.indexOf("version patch --no-git-tag-version") && calls.indexOf("version patch --no-git-tag-version") < calls.lastIndexOf("publish"), `order: ${calls.join(", ")}`);
		assert.match(r.out, /Released demo-pkg 0\.1\.1/);
	} finally {
		s.cleanup();
	}
});
