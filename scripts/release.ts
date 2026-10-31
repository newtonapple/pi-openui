// The parts of a release that are easy to get wrong, in one place so they can be tested: the changelog, and the checks before
// each step that cannot be undone. The Makefile drives it; docs/releasing.md explains the order and the reasons.
//
//   node scripts/release.ts preflight start     before a version bump: on the branch, clean, in step with origin, something to release
//   node scripts/release.ts version <bump>      bump package.json, move "Unreleased" to the new version, run the tests, commit
//   node scripts/release.ts preflight publish   before `npm publish`: clean, not behind, changelog heading, not on npm, no tag, logged in
//   node scripts/release.ts wait-published      after `npm publish`: wait until the registry shows the version (it is not instant)
//   node scripts/release.ts tag                 tag the commit npm says it published
//   node scripts/release.ts push                push the branch and the tag
//   node scripts/release.ts changelog check|notes <version>
//
// NPM, GIT and BRANCH come from the environment (the Makefile exports them), so tests can stand in for npm.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ---------- the changelog ----------

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const UNRELEASED = /^## Unreleased\s*$/i;

/** The lines of the section whose heading is at `start`: up to the next level-2 heading. Sub-headings (###) stay inside. */
function sectionEnd(lines: string[], start: number): number {
	let end = start + 1;
	while (end < lines.length && !/^## /.test(lines[end])) end++;
	return end;
}

const trimBlank = (lines: string[]): string[] => {
	let a = 0;
	let b = lines.length;
	while (a < b && !lines[a].trim()) a++;
	while (b > a && !lines[b - 1].trim()) b--;
	return lines.slice(a, b);
};

/** What is waiting under "## Unreleased", or null when there is no such heading. */
export function unreleasedBody(text: string): string | null {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const start = lines.findIndex((l) => UNRELEASED.test(l));
	return start < 0 ? null : trimBlank(lines.slice(start + 1, sectionEnd(lines, start))).join("\n");
}

export function hasVersion(text: string, version: string): boolean {
	return new RegExp(`^## ${escapeRe(version)} \\(`, "m").test(text.replace(/\r\n/g, "\n"));
}

/** The notes of one version (its heading excluded), or null. */
export function sectionFor(text: string, version: string): string | null {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const start = lines.findIndex((l) => new RegExp(`^## ${escapeRe(version)} \\(`).test(l));
	return start < 0 ? null : trimBlank(lines.slice(start + 1, sectionEnd(lines, start))).join("\n");
}

/**
 * Move what is under "## Unreleased" to a heading for `version`, and leave a fresh, empty "## Unreleased" above it. Refuses to
 * release nothing, to reuse a version, or to guess when there is no "Unreleased" heading.
 */
export function releaseChangelog(text: string, version: string, date: string): string {
	if (!SEMVER.test(version)) throw new Error(`"${version}" is not a version like 1.2.3`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`"${date}" is not a date like 2026-10-30`);
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const start = lines.findIndex((l) => UNRELEASED.test(l));
	if (start < 0) throw new Error('CHANGELOG.md has no "## Unreleased" heading. Add one above the newest version and list what changed under it');
	if (hasVersion(text, version)) throw new Error(`CHANGELOG.md already has a heading for ${version}`);
	const end = sectionEnd(lines, start);
	const body = trimBlank(lines.slice(start + 1, end));
	if (!body.length) throw new Error('Nothing to release: list what changed under "## Unreleased" in CHANGELOG.md first');
	const after = lines.slice(end);
	const out = [...lines.slice(0, start), "## Unreleased", "", `## ${version} (${date})`, "", ...body, ...(after.length ? ["", ...after] : [""])];
	return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
}

// ---------- running things ----------

const NPM = process.env.NPM || "npm";
const GIT = process.env.GIT || "git";
const BRANCH = process.env.BRANCH || "main";

interface Ran {
	ok: boolean;
	out: string;
	err: string;
}
function sh(cmd: string, input?: string): Ran {
	const r = spawnSync(cmd, { shell: true, encoding: "utf8", maxBuffer: 1 << 26, ...(input !== undefined ? { input } : {}) });
	// only the end is trimmed: `git status --porcelain` starts with a significant space
	return { ok: r.status === 0, out: (r.stdout ?? "").replace(/\s+$/, ""), err: (r.stderr ?? "").replace(/\s+$/, "") };
}

const readPkg = (): { name: string; version: string } => JSON.parse(readFileSync("package.json", "utf8"));
const readChangelog = (): string => (existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf8") : "");
const today = (): string => process.env.RELEASE_DATE || new Date().toLocaleDateString("en-CA");

class Report {
	problems: string[] = [];
	ok(what: string) {
		console.log(`  ok    ${what}`);
	}
	fail(what: string, hint?: string) {
		console.log(`  FAIL  ${what}${hint ? `\n        ${hint}` : ""}`);
		this.problems.push(what);
	}
	check(good: boolean, what: string, hint?: string) {
		if (good) this.ok(what);
		else this.fail(what, hint);
	}
	done(): never {
		if (this.problems.length) {
			console.log(`\n${this.problems.length} problem${this.problems.length === 1 ? "" : "s"}: nothing was changed.`);
			process.exit(1);
		}
		process.exit(0);
	}
}

/** Is this version on the registry? "unknown" when the registry could not be asked: that must stop a release, not pass it. */
export function published(name: string, version: string): { state: "yes" | "no" | "unknown"; detail: string } {
	const r = sh(`${NPM} view ${name}@${version} version`);
	if (r.ok && r.out) return { state: "yes", detail: r.out };
	if (/E404|404 Not Found|is not in this registry/i.test(r.err + r.out)) return { state: "no", detail: "" };
	return { state: "unknown", detail: r.err.split("\n")[0] || "no answer" };
}

function repoChecks(r: Report, opts: { allowAhead: boolean }) {
	const branch = sh(`${GIT} rev-parse --abbrev-ref HEAD`).out;
	r.check(branch === BRANCH, `on ${BRANCH}`, `you are on "${branch}": run \`git switch ${BRANCH}\``);
	const dirty = sh(`${GIT} status --porcelain`).out;
	r.check(!dirty, "no uncommitted changes", `commit or stash first:\n${dirty.split("\n").slice(0, 5).map((l) => `          ${l}`).join("\n")}`);
	const fetched = sh(`${GIT} fetch origin`);
	if (!fetched.ok) return r.fail("could not reach origin", fetched.err.split("\n")[0]);
	const counts = sh(`${GIT} rev-list --left-right --count HEAD...origin/${BRANCH}`);
	const [ahead, behind] = counts.out.split(/\s+/).map(Number);
	if (!counts.ok) return r.fail(`could not compare with origin/${BRANCH}`, counts.err);
	r.check(behind === 0, `not behind origin/${BRANCH}`, `origin has ${behind} commit(s) you do not: \`git pull --ff-only\``);
	if (opts.allowAhead) r.ok(ahead ? `${ahead} commit(s) not pushed yet (pushed after publishing)` : "in step with origin");
	else r.check(ahead === 0, `in step with origin/${BRANCH}`, `${ahead} commit(s) are not pushed: push them first so the release is built on what is public`);
}

// ---------- the commands ----------

function preflightStart() {
	console.log("Before the version bump:");
	const r = new Report();
	repoChecks(r, { allowAhead: false });
	const body = unreleasedBody(readChangelog());
	if (body === null) r.fail('CHANGELOG.md has no "## Unreleased" heading', "add one above the newest version");
	else r.check(body.length > 0, 'something under "## Unreleased"', 'list what changed under "## Unreleased" in CHANGELOG.md first');
	r.done();
}

function preflightPublish() {
	const { name, version } = readPkg();
	console.log(`Before publishing ${name}@${version}:`);
	const r = new Report();
	repoChecks(r, { allowAhead: true });
	r.check(hasVersion(readChangelog(), version), `CHANGELOG.md has a heading for ${version}`, `run \`make version BUMP=...\`, or add "## ${version} (date)" above the newest version`);
	const p = published(name, version);
	if (p.state === "unknown") r.fail(`could not ask npm whether ${version} exists`, p.detail);
	else r.check(p.state === "no", `${version} is not on npm yet`, "a published version cannot be replaced: bump the version (make version BUMP=patch)");
	const local = sh(`${GIT} rev-parse -q --verify refs/tags/v${version}`).ok;
	const remote = sh(`${GIT} ls-remote --tags origin refs/tags/v${version}`).out;
	r.check(!local && !remote, `no tag v${version} yet`, `v${version} already exists${remote ? " on origin" : ""}: a tag is made after publishing, not before`);
	const who = sh(`${NPM} whoami`);
	r.check(who.ok && !!who.out, who.ok ? `logged in to npm as ${who.out}` : "logged in to npm", "run `npm login` first (this Makefile does not log in)");
	r.done();
}

function versionBump(bump: string) {
	if (!bump) {
		console.error("BUMP is required: patch, minor, major, or an exact version.  make version BUMP=patch");
		process.exit(1);
	}
	if (!/^(patch|minor|major|prepatch|preminor|premajor|prerelease|\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?)$/.test(bump)) {
		console.error(`BUMP "${bump}" is not patch, minor, major, a pre* bump or an exact version like 1.2.3`);
		process.exit(1);
	}
	const before = readPkg().version;
	const bumped = sh(`${NPM} version ${bump} --no-git-tag-version`);
	if (!bumped.ok) {
		console.error(bumped.err || bumped.out);
		process.exit(1);
	}
	const { version } = readPkg();
	const revert = () => sh(`${GIT} checkout -- package.json CHANGELOG.md${existsSync("package-lock.json") ? " package-lock.json" : ""}`);
	let notes = "";
	try {
		const text = readChangelog();
		writeFileSync("CHANGELOG.md", releaseChangelog(text, version, today()));
		notes = sectionFor(readChangelog(), version) ?? "";
	} catch (e) {
		revert();
		console.error(`${(e as Error).message}\npackage.json is back at ${before}.`);
		process.exit(1);
	}
	// The tests run on the bumped tree, before anything is committed: some things only break once the version changes (a README
	// that names the current version, say). If they fail, put everything back, so there is no half-made release to untangle.
	console.log(`Running the tests on ${version}...`);
	const tested = sh(`${NPM} test`);
	if (!tested.ok) {
		revert();
		const tail = (tested.out + "\n" + tested.err).split("\n").filter((l) => /not ok|✖|fail|Error|error/i.test(l)).slice(-12).join("\n");
		console.error(`The tests fail on ${version}, so nothing was changed (package.json and CHANGELOG.md are back as they were).\n${tail}`);
		process.exit(1);
	}
	const files = ["package.json", "CHANGELOG.md", ...(existsSync("package-lock.json") ? ["package-lock.json"] : [])];
	const added = sh(`${GIT} add ${files.join(" ")}`);
	const committed = added.ok && sh(`${GIT} commit -q -F -`, `Release v${version}\n\n${notes}\n`);
	if (!added.ok || !committed || !committed.ok) {
		sh(`${GIT} reset -q HEAD -- ${files.join(" ")}`);
		revert();
		sh(`${GIT} checkout -- CHANGELOG.md`);
		console.error(`could not commit the release: ${(committed && committed.err) || added.err}\npackage.json and CHANGELOG.md are back as they were.`);
		process.exit(1);
	}
	console.log(`Release commit v${version} (${sh(`${GIT} rev-parse --short HEAD`).out}): version ${before} -> ${version}, changelog moved from Unreleased.`);
}

const sleep = (seconds: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, seconds) * 1000);

/**
 * `npm publish` returns when npm has accepted the package, which is before the registry shows it ("it may take a few minutes to
 * become available"). The tag step asks the registry what was published, so publishing waits here until it can see the version.
 * The version is published either way: on a timeout nothing is undone, and `make tag push` finishes the job.
 */
function waitPublished() {
	const { name, version } = readPkg();
	const limit = Number(process.env.RELEASE_WAIT_SECONDS ?? 300);
	const every = Number(process.env.RELEASE_POLL_SECONDS ?? 5);
	const started = Date.now();
	console.log(`Waiting for npm to show ${name}@${version} (up to ${limit} s)...`);
	for (;;) {
		const p = published(name, version);
		const seen = Math.round((Date.now() - started) / 1000);
		if (p.state === "yes") return console.log(`npm shows ${name}@${version} (${seen} s).`);
		if (Date.now() - started >= limit * 1000) {
			console.error(`${name}@${version} was published, but npm still does not show it after ${seen} s${p.state === "unknown" ? ` (${p.detail})` : ""}.\nNothing is tagged or pushed yet. In a minute, run:  make tag push`);
			process.exit(1);
		}
		sleep(every);
	}
}

function tagIt() {
	const { name, version } = readPkg();
	const tag = `v${version}`;
	const p = published(name, version);
	if (p.state !== "yes") {
		console.error(p.state === "no" ? `${name}@${version} is not on npm, so there is nothing to tag yet: publish first.` : `could not ask npm about ${version}: ${p.detail}`);
		process.exit(1);
	}
	// tag exactly what npm published, whatever has been committed since
	const head = sh(`${NPM} view ${name}@${version} gitHead`).out;
	if (!/^[0-9a-f]{40}$/.test(head)) {
		console.error(`npm did not record the commit ${version} was published from. Tag it by hand: git tag -a ${tag} <commit> && git push origin ${tag}`);
		process.exit(1);
	}
	if (!sh(`${GIT} cat-file -e ${head}^{commit}`).ok) {
		console.error(`npm says ${version} was published from ${head.slice(0, 7)}, which is not in this clone: git fetch, then try again.`);
		process.exit(1);
	}
	const existing = sh(`${GIT} rev-parse -q --verify refs/tags/${tag}^{commit}`);
	if (existing.ok) {
		if (existing.out === head) return console.log(`${tag} already points at ${head.slice(0, 7)}, the commit npm published.`);
		console.error(`${tag} exists and points at ${existing.out.slice(0, 7)}, not at ${head.slice(0, 7)}, the commit npm published. Not touching it.`);
		process.exit(1);
	}
	const notes = sectionFor(readChangelog(), version) ?? "";
	const made = sh(`${GIT} tag -a ${tag} ${head} -F -`, `${tag}\n\n${notes}\n`);
	if (!made.ok) {
		console.error(made.err);
		process.exit(1);
	}
	console.log(`Tagged ${tag} at ${head.slice(0, 7)}, the commit npm published.`);
}

function pushIt() {
	const { version } = readPkg();
	const tag = `v${version}`;
	if (!sh(`${GIT} rev-parse -q --verify refs/tags/${tag}`).ok) {
		console.error(`there is no tag ${tag} to push: run \`make tag\` after publishing.`);
		process.exit(1);
	}
	for (const ref of [BRANCH, tag]) {
		const r = sh(`${GIT} push origin ${ref}`);
		if (!r.ok) {
			console.error(`pushing ${ref} failed:\n${r.err}\nIf git asks for a password, run \`gh auth setup-git\` once, then \`make push\`.`);
			process.exit(1);
		}
		console.log(`pushed ${ref}`);
	}
}

function changelogCommand(sub: string, version: string) {
	const text = readChangelog();
	if (sub === "check") {
		if (!hasVersion(text, version)) {
			console.error(`CHANGELOG.md has no heading for ${version}`);
			process.exit(1);
		}
		return;
	}
	if (sub === "notes") {
		const s = sectionFor(text, version);
		if (s === null) {
			console.error(`CHANGELOG.md has no heading for ${version}`);
			process.exit(1);
		}
		return console.log(s);
	}
	console.error("usage: release.ts changelog check|notes <version>");
	process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [cmd, a = "", b = ""] = process.argv.slice(2);
	if (cmd === "preflight" && a === "start") preflightStart();
	else if (cmd === "preflight" && a === "publish") preflightPublish();
	else if (cmd === "version") versionBump(a);
	else if (cmd === "wait-published") waitPublished();
	else if (cmd === "tag") tagIt();
	else if (cmd === "push") pushIt();
	else if (cmd === "changelog") changelogCommand(a, b);
	else {
		console.error("usage: release.ts preflight start|publish | version <bump> | wait-published | tag | push | changelog check|notes <version>");
		process.exit(1);
	}
}
