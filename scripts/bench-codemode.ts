// A/B harness: does drawing from a codemode script (openui_draw) cost less than the model writing the rows into render_widget?
//   BENCH_MODEL=provider/model node scripts/bench-codemode.ts            run it (SPENDS MODEL TOKENS)
//   node scripts/bench-codemode.ts --dry-run                              print the commands, run nothing
// BENCH_RUNS is the number of runs per size and arm (default 3). Data is synthetic: metrics CSVs of 10, 40 and 100 rows
// (100 is the Table row limit; the chart shows the top 10 so BarChart's 40-bar limit never decides the result).
// Not part of `npm test`. Each run is scored from its own session file.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSION = join(dirname(fileURLToPath(import.meta.url)), "..", ".pi", "extensions", "openui.ts");
const SIZES = [10, 40, 100];
// --no-extensions also drops pi's built-in codemode extension, so the codemode arm loads it back with -e builtin:codemode
const ARMS = { direct: ["--exclude-tools", "codemode"], codemode: ["-e", "builtin:codemode", "--tools", "+codemode"] } as const;
type Arm = keyof typeof ARMS;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

const dryRun = process.argv.includes("--dry-run");
const model = process.env.BENCH_MODEL ?? "";
const runs = Number(process.env.BENCH_RUNS ?? 3);
if (!dryRun && !model) {
	console.error("set BENCH_MODEL (for example provider/model-id); this script spends model tokens. Use --dry-run to see the commands.");
	process.exit(2);
}
if (!Number.isInteger(runs) || runs < 1) {
	console.error(`BENCH_RUNS must be a whole number of at least 1, got "${process.env.BENCH_RUNS}"`);
	process.exit(2);
}

/** Deterministic synthetic metrics: host, cpu %, mem %, p95 latency in ms. */
function metricsCsv(rows: number): string {
	let seed = 7;
	const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
	const lines = ["host,cpu,mem,p95_ms"];
	for (let i = 1; i <= rows; i++) lines.push(`host-${String(i).padStart(3, "0")},${Math.round(next() * 100)},${Math.round(20 + next() * 75)},${Math.round(40 + next() * 460)}`);
	return lines.join("\n") + "\n";
}

const prompt = (file: string) => `Read ${file}. Draw one widget with a table of every row and a bar chart of cpu for the 10 hosts with the highest cpu. Reply with one short sentence.`;

const work = mkdtempSync(join(tmpdir(), "bench-codemode-"));
for (const n of SIZES) writeFileSync(join(work, `metrics-${n}.csv`), metricsCsv(n));

function command(arm: Arm, size: number, sessionDir: string): string[] {
	return ["pi", "-p", ...(model ? ["--model", model] : ["--model", "<BENCH_MODEL>"]), "--no-extensions", "--no-skills", "--no-context-files", "--no-prompt-templates", "-e", EXTENSION, ...ARMS[arm], "--session-dir", sessionDir, prompt(`metrics-${size}.csv`)];
}
const quote = (a: string) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replaceAll("'", "'\\''")}'`);

interface Score {
	input: number;
	output: number;
	cacheRead: number;
	cost: number;
	assistantMessages: number;
	wallSeconds: number;
	drawn: boolean;
}

/** What one run cost, read from its session JSONL. */
function score(sessionDir: string, wallSeconds: number): Score {
	const s: Score = { input: 0, output: 0, cacheRead: 0, cost: 0, assistantMessages: 0, wallSeconds, drawn: false };
	const files = readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl"));
	for (const f of files) {
		for (const line of readFileSync(join(sessionDir, f), "utf8").split("\n")) {
			if (!line.trim()) continue;
			let e: any;
			try {
				e = JSON.parse(line);
			} catch {
				continue;
			}
			const m = e.message;
			if (e.type === "custom_message" && e.customType === "openui-widget") s.drawn = true;
			if (m?.role === "toolResult" && m.toolName === "render_widget" && !m.isError && m.details?.kind === "widget") s.drawn = true;
			if (m?.role === "assistant") {
				s.assistantMessages++;
				s.input += m.usage?.input ?? 0;
				s.output += m.usage?.output ?? 0;
				s.cacheRead += m.usage?.cacheRead ?? 0;
				s.cost += m.usage?.cost?.total ?? 0;
			}
		}
	}
	return s;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const rows: string[][] = [["rows", "arm", "runs", "input", "output", "cacheRead", "cost $", "assistant msgs", "wall s", "drawn"]];

for (const size of SIZES) {
	for (const arm of Object.keys(ARMS) as Arm[]) {
		const scores: Score[] = [];
		for (let i = 1; i <= runs; i++) {
			const sessionDir = join(work, `${arm}-${size}-${i}`);
			mkdirSync(sessionDir);
			const cmd = command(arm, size, sessionDir);
			if (dryRun) {
				console.log(`(cd ${quote(work)} && ${cmd.map(quote).join(" ")})`);
				continue;
			}
			const started = Date.now();
			const r = spawnSync(cmd[0], cmd.slice(1), { cwd: work, encoding: "utf8", timeout: RUN_TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] });
			const wall = (Date.now() - started) / 1000;
			if (r.error || r.status !== 0) console.error(`${arm} ${size} run ${i}: pi exited ${r.status ?? r.error?.message}: ${(r.stderr ?? "").slice(0, 300)}`);
			scores.push(score(sessionDir, wall));
		}
		if (dryRun || !scores.length) continue;
		const f = (get: (s: Score) => number, digits = 0) => mean(scores.map(get)).toFixed(digits);
		rows.push([String(size), arm, String(scores.length), f((s) => s.input), f((s) => s.output), f((s) => s.cacheRead), f((s) => s.cost, 4), f((s) => s.assistantMessages, 1), f((s) => s.wallSeconds, 1), `${scores.filter((s) => s.drawn).length}/${scores.length}`]);
	}
}

if (dryRun) {
	console.log(`\n(dry run: nothing was run. Data is in ${work}; the table would have ${SIZES.length * Object.keys(ARMS).length} rows, means over ${runs} run(s) per row.)`);
} else {
	const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
	for (const r of rows) console.log(r.map((cell, c) => cell.padStart(widths[c])).join("  "));
	console.log(`\nSessions are in ${work}`);
}
