// Records the language's signatures in test/compat/signatures.json, so test/signatures.test.ts can tell when a change would break a
// source written for an earlier version.
//   node scripts/freeze-signatures.ts
// It only adds: a new component, a new trailing argument, a higher limit. If the language is no longer compatible with what was
// frozen (an argument inserted, moved, removed or made required; a lower limit) it prints why and writes nothing: fix the change,
// or (a real break) bump LANG_VERSION in src/lang/library.ts, add an alias or migration there, and only then edit the file by hand.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS, SPECS } from "../src/lang/library.ts";
import { mergeSnapshot, signatureProblems, snapshotOf, type Snapshot } from "../test/compat/signatures-lib.ts";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "compat", "signatures.json");
const now = snapshotOf(SPECS, LIMITS);
const NOTE = "Every component and argument the language has had, in order, and the highest value of each limit. Append-only: see scripts/freeze-signatures.ts and 'Language changes are additive' in AGENTS.md.";
const frozen: Snapshot = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { components: {}, limits: {} };
const problems = signatureProblems(frozen, now);
if (problems.length) {
	console.error("The language is not compatible with what was frozen:\n" + problems.map((p) => "  - " + p).join("\n"));
	process.exit(1);
}
const merged = mergeSnapshot(frozen, now);
if (JSON.stringify(merged) === JSON.stringify(frozen)) {
	console.log("nothing to add");
} else {
	writeFileSync(file, JSON.stringify({ note: NOTE, ...merged }, null, 1) + "\n");
	console.log("signatures.json updated");
}
