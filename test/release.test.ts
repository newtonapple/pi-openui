// The release process, the quick parts: the changelog rewrite, `make help`, and the Makefile being wired to the real package. The
// flow and the refusals, run for real in a sandbox without publishing anything, are in release-flow.test.ts and
// release-checks.test.ts. See docs/releasing.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { hasVersion, releaseChangelog, sectionFor, unreleasedBody } from "../scripts/release.ts";
import { ROOT, sandbox, skip } from "./release-sandbox.ts";

const CHANGELOG = `# Changelog

## Unreleased

- Added the thing.
- Fixed the other thing.

### Notes

A sub-heading stays with its section.

## 0.1.10 (2026-01-01)

- Older.

## 0.1.1 (2025-12-01)

- Oldest.
`;

test("the changelog: Unreleased moves under the new version, and a fresh empty Unreleased is left above it", () => {
	const out = releaseChangelog(CHANGELOG, "0.2.0", "2026-02-03");
	assert.equal(out.split("\n").filter((l) => l.startsWith("## ")).join(" | "), "## Unreleased | ## 0.2.0 (2026-02-03) | ## 0.1.10 (2026-01-01) | ## 0.1.1 (2025-12-01)");
	assert.equal(unreleasedBody(out), "", "nothing waits under Unreleased any more");
	assert.equal(sectionFor(out, "0.2.0"), "- Added the thing.\n- Fixed the other thing.\n\n### Notes\n\nA sub-heading stays with its section.");
	assert.equal(sectionFor(out, "0.1.10"), "- Older.", "older sections are untouched");
	assert.ok(out.endsWith("- Oldest.\n") && !out.includes("\n\n\n"), "one newline at the end, never two blank lines in a row");
	assert.match(out, /^# Changelog\n\n## Unreleased\n\n## 0\.2\.0 \(2026-02-03\)\n\n- Added the thing\./);
});

test("the changelog: it refuses to release nothing, to reuse a version, to guess, or to accept nonsense", () => {
	assert.throws(() => releaseChangelog(CHANGELOG.replace(/- Added[\s\S]*?section\.\n/, ""), "0.2.0", "2026-02-03"), /Nothing to release/);
	assert.throws(() => releaseChangelog("# Changelog\n\n## 0.1.0 (2026-01-01)\n\n- x\n", "0.2.0", "2026-02-03"), /no "## Unreleased" heading/);
	assert.throws(() => releaseChangelog(CHANGELOG, "0.1.10", "2026-02-03"), /already has a heading for 0\.1\.10/);
	assert.throws(() => releaseChangelog(CHANGELOG, "v0.2", "2026-02-03"), /not a version/);
	assert.throws(() => releaseChangelog(CHANGELOG, "0.2.0", "yesterday"), /not a date/);
	assert.equal(releaseChangelog("## Unreleased\n\n- a\n", "1.0.0", "2026-02-03"), "## Unreleased\n\n## 1.0.0 (2026-02-03)\n\n- a\n", "also works on a file with no title and no older versions");
});

test("the changelog: versions are matched whole (0.1.1 is not 0.1.10), and pre-releases work", () => {
	assert.ok(hasVersion(CHANGELOG, "0.1.1") && hasVersion(CHANGELOG, "0.1.10"));
	assert.ok(!hasVersion(CHANGELOG, "0.1") && !hasVersion(CHANGELOG, "0.1.100"));
	assert.equal(sectionFor(CHANGELOG, "0.1.1"), "- Oldest.");
	assert.equal(sectionFor(CHANGELOG, "9.9.9"), null);
	const pre = releaseChangelog(CHANGELOG, "1.0.0-rc.1", "2026-02-03");
	assert.ok(hasVersion(pre, "1.0.0-rc.1"));
	assert.equal(unreleasedBody("# x\n"), null);
	assert.equal(unreleasedBody("## Unreleased\n\n\n"), "");
	assert.equal(unreleasedBody("## UNRELEASED\n- a\n"), "- a", "case does not matter");
});

test("make help lists the targets, and is what a bare `make` shows", { skip }, () => {
	const s = sandbox();
	try {
		const out = s.make([]);
		assert.equal(out.status, 0);
		for (const t of ["make release BUMP=", "make check", "make version", "make publish", "make tag", "make push", "make verify", "make github-release"]) assert.ok(out.out.includes(t), `mentions ${t}`);
		assert.ok(out.out.includes("demo-pkg") === false && out.out.includes("0.1.0"), "shows the current version");
		assert.equal(s.make(["help"]).out, out.out);
	} finally {
		s.cleanup();
	}
});

test("the real Makefile and script are wired to the real package: names, version and the targets it promises", () => {
	const make = readFileSync(join(ROOT, "Makefile"), "utf8");
	for (const target of ["help", "check", "test", "contents", "dry-run", "version", "publish", "tag", "push", "release", "github-release", "verify"]) assert.match(make, new RegExp(`^${target}:`, "m"), `target ${target}`);
	assert.match(make, /^export NPM GIT BRANCH$/m);
	assert.ok(!/^\t.*\bnpm login\b/m.test(make), "no recipe runs npm login");
	const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
	assert.equal(pkg.scripts.prepublishOnly, "npm test", "npm publish runs the tests even when it is not run through make");
});
