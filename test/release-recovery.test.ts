// Recovering from a failed publish, in a sandbox: the release commit is kept, nothing is tagged or pushed, and `make publish tag push` finishes it. See release-sandbox.ts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { sandbox, skip, snapshot, withEntry, ROOT, type Sandbox } from "./release-sandbox.ts";

test("a failed publish (a wrong 2FA code) leaves the release commit but no tag and nothing pushed; make publish tag push finishes it", { skip }, () => {
	const s = sandbox();
	try {
		assert.equal(s.make(["publish", "tag", "push"]).status, 0);
		withEntry(s);
		const before = s.remoteRef("refs/heads/main");
		const r = s.make(["release", "BUMP=minor"], { FAKE_PUBLISH_FAIL: "1" });
		assert.notEqual(r.status, 0);
		assert.equal(s.git("log", "-1", "--format=%s"), "Release v0.2.0", "the release commit is there, locally");
		assert.equal(s.git("tag"), "v0.1.0", "no new tag");
		assert.deepEqual(Object.keys(s.state().published), ["demo-pkg@0.1.0"], "nothing new on npm");
		assert.equal(s.remoteRef("refs/heads/main"), before, "origin has not moved: nothing was pushed");
		assert.equal(s.remoteRef("refs/tags/v0.2.0"), "");
		// fix the problem and finish: the checks allow being ahead of origin by the release commit
		const again = s.make(["publish", "tag", "push"]);
		assert.equal(again.status, 0, again.out);
		assert.ok(s.state().published["demo-pkg@0.2.0"]);
		assert.equal(s.remoteRef("refs/tags/v0.2.0^{commit}"), s.git("rev-parse", "HEAD"));
		assert.equal(s.remoteRef("refs/heads/main"), s.git("rev-parse", "HEAD"));
	} finally {
		s.cleanup();
	}
});
