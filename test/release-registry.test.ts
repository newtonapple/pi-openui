// A registry that is slow to show a version it has just accepted, in a sandbox: make publish waits for it, and if it never shows,
// make tag push finishes later. See release-sandbox.ts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { sandbox, skip, snapshot, withEntry, ROOT, type Sandbox } from "./release-sandbox.ts";

test("a registry that is slow to show a new version: make publish waits for it, so make tag does not race it", { skip }, () => {
	const s = sandbox();
	try {
		const r = s.make(["publish", "tag", "push"], { FAKE_VIEW_LAG: "3", RELEASE_POLL_SECONDS: "0.05", RELEASE_WAIT_SECONDS: "20" });
		assert.equal(r.status, 0, r.out);
		assert.match(r.out, /Waiting for npm to show demo-pkg@0\.1\.0/);
		assert.equal(s.git("rev-parse", "v0.1.0^{commit}"), s.state().published["demo-pkg@0.1.0"].gitHead, "tagged the published commit once npm showed it");
		assert.equal(s.remoteRef("refs/tags/v0.1.0^{commit}"), s.git("rev-parse", "HEAD"));
		const views = s.state().calls.filter((c) => c.startsWith("view demo-pkg@0.1.0")).length;
		assert.ok(views >= 4, `it looked again and again until the version appeared (${views} looks)`);
	} finally {
		s.cleanup();
	}
});

test("a registry that never shows it in time: published, but nothing tagged or pushed, and make tag push finishes it later", { skip }, () => {
	const s = sandbox();
	try {
		const head = s.git("rev-parse", "HEAD");
		const r = s.make(["publish", "tag", "push"], { FAKE_VIEW_LAG: "1000", RELEASE_POLL_SECONDS: "0.1", RELEASE_WAIT_SECONDS: "1" });
		assert.notEqual(r.status, 0);
		assert.match(r.out, /was published, but npm still does not show it/);
		assert.match(r.out, /make tag push/, "it says how to finish");
		assert.ok(s.state().published["demo-pkg@0.1.0"], "it is on npm");
		assert.equal(s.git("tag"), "", "nothing was tagged");
		assert.equal(s.remoteRef("refs/tags/v0.1.0"), "", "nothing was pushed");
		// a minute later npm shows it
		const later = s.make(["tag", "push"]);
		assert.equal(later.status, 0, later.out);
		assert.equal(s.git("rev-parse", "v0.1.0^{commit}"), head);
		assert.equal(s.remoteRef("refs/tags/v0.1.0^{commit}"), head);
	} finally {
		s.cleanup();
	}
});
