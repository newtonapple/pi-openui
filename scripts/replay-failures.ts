// Local-only replay of private session failures; never imported or run by npm test.
// Usage: node scripts/replay-failures.ts [sessions directory]
// Uses stored tool-result errors as the historical baseline, rather than recompiling on main.
// Prints no sources: only session basenames, counts, coverage, and an 80-character first-error preview.
import { createReadStream } from "node:fs";
import { opendir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { compile, errorHelp, SPECS } from "../src/lang/library.ts";

interface ContentBlock {
	type?: string;
	id?: string;
	name?: string;
	arguments?: { source?: unknown };
	text?: string;
}
interface SessionEntry {
	message?: {
		role?: string;
		content?: ContentBlock[];
		toolCallId?: string;
		isError?: boolean;
	};
}

async function* sessionFiles(dir: string): AsyncGenerator<string> {
	for await (const entry of await opendir(dir)) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* sessionFiles(path);
		else if (entry.isFile() && entry.name.endsWith(".jsonl")) yield path;
	}
}

async function main() {
	const dir = process.argv[2] ?? join(homedir(), ".pi", "agent", "sessions");
	const rows: string[][] = [];
	let files = 0;
	let errorsThen = 0;
	let errorsNow = 0;
	let compilesNow = 0;
	let covered = 0;
	const componentNames = new Set(SPECS.map((s) => s.name));
	let malformedLines = 0;
	for await (const path of sessionFiles(dir)) {
		files++;
		const pending = new Map<string, { source: string; line: number }>();
		const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
		let lineNumber = 0;
		for await (const line of lines) {
			lineNumber++;
			if (!line.trim()) continue;
			let entry: SessionEntry;
			try {
				entry = JSON.parse(line);
			} catch {
				malformedLines++;
				continue;
			}
			const message = entry?.message;
			if (!message) continue;
			if (message.role === "assistant" && Array.isArray(message.content)) {
				for (const block of message.content) {
					if (block?.type === "toolCall" && block.name === "render_widget" && typeof block.id === "string" && typeof block.arguments?.source === "string") {
						pending.set(block.id, { source: block.arguments.source, line: lineNumber });
					}
				}
			} else if (message.role === "toolResult" && typeof message.toolCallId === "string") {
				const call = pending.get(message.toolCallId);
				pending.delete(message.toolCallId);
				if (!call || message.isError !== true) continue;
				const text = Array.isArray(message.content) ? message.content.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n") : "";
				const before = (text.split("\nSignatures:")[0].match(/^- /gm) ?? []).length;
				const c = compile(call.source);
				const help = errorHelp(c);
				const everyErrorCovered = c.errors.every((message) => {
					const component = message.match(/\b[A-Z]\w*\b/g)?.find((name) => componentNames.has(name));
					return !component || help.includes(`- ${component}(`);
				});
				errorsThen += before;
				errorsNow += c.errors.length;
				if (c.ok) compilesNow++;
				if (everyErrorCovered) covered++;
				rows.push([basename(path), String(call.line), String(before), String(c.errors.length), c.ok ? "yes" : "no", help ? "yes" : "no", everyErrorCovered ? "yes" : "no", (c.errors[0] ?? "").slice(0, 80).replace(/\s/g, " ")]);
			}
		}
	}
	const headings = ["Session", "Line", "Errors then", "Errors now", "Compiles now", "Error help", "Every error covered", "First error now (80 chars)"];
	const widths = headings.map((heading, i) => Math.max(heading.length, ...rows.map((r) => r[i].length)));
	for (const row of [headings, ...rows]) console.log(row.map((value, i) => value.padEnd(widths[i])).join(" | ").trimEnd());
	console.log(`Totals: ${files} session files; ${rows.length} failed renders; errors then ${errorsThen}; errors now ${errorsNow}; compiles now ${compilesNow}; every error covered ${covered}; still failing ${rows.length - compilesNow}; malformed lines skipped ${malformedLines}.`);
}

main().catch(() => {
	// Avoid echoing a private session path or source via an exception message.
	console.error("Replay failed: could not read the sessions directory or a session file.");
	process.exitCode = 1;
});
