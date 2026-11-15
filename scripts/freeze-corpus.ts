// Adds to the compatibility corpus (test/compat/corpus) and records every file's hash in test/compat/MANIFEST.json.
//   node scripts/freeze-corpus.ts
// It writes a file for each sample in src/lang/samples.ts that has none yet, lists any new .oui file in the manifest, and stops with an
// error if a listed file no longer matches its hash. It never overwrites or deletes: a corpus file is a source an older version wrote,
// and the point of keeping it is that it does not change. See "Language changes are additive" in AGENTS.md.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LANG_SAMPLES } from "../src/lang/samples.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "compat");
const corpus = join(root, "corpus");
const manifestPath = join(root, "MANIFEST.json");
mkdirSync(corpus, { recursive: true });

let added = 0;
for (const s of LANG_SAMPLES) {
	const file = join(corpus, `${s.key}.oui`);
	if (existsSync(file)) continue;
	writeFileSync(file, s.source.endsWith("\n") ? s.source : s.source + "\n");
	console.log(`wrote  ${s.key}.oui`);
	added++;
}

const sha = (f: string) => createHash("sha256").update(readFileSync(join(corpus, f))).digest("hex");
const listed: Record<string, string> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")).files : {};
let bad = 0;
for (const f of readdirSync(corpus).filter((x) => x.endsWith(".oui")).sort()) {
	if (!listed[f]) {
		listed[f] = sha(f);
		console.log(`listed ${f}`);
		added++;
	} else if (listed[f] !== sha(f)) {
		console.error(`CHANGED ${f}: it is not what was frozen. Restore it with git checkout; never edit a corpus file.`);
		bad++;
	}
}
for (const f of Object.keys(listed)) if (!existsSync(join(corpus, f))) (console.error(`MISSING ${f}: a corpus file is never deleted.`), bad++);
if (bad) process.exit(1);
const sorted = Object.fromEntries(Object.entries(listed).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(manifestPath, JSON.stringify({ note: "sha256 of every file in corpus/. Append-only; see scripts/freeze-corpus.ts", files: sorted }, null, 2) + "\n");
console.log(added ? `${added} change(s)` : "nothing to add");
