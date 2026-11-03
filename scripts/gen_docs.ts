// Builds docs/components/*.md from the signature table (src/lang/library.ts) and the guidance (src/lang/docs.ts).
//   node scripts/gen_docs.ts          writes the files
//   test/docs.test.ts                 fails when the files on disk are not what this would write
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS, TOOLTIP_DOC, type ComponentDoc } from "../src/lang/docs.ts";
import { LIB, LIMITS, SPECS, TARGET_HELP, showType, type Param } from "../src/lang/library.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const sig = (name: string): string => {
	const s = LIB.get(name)!;
	return `${s.name}(${s.params.map((p) => `${p.name}${p.opt ? "?" : ""}: ${showType(p.t)}`).join(", ")})`;
};

/** The size limit of an argument, read from the signature table so a page cannot disagree with the validator. */
function limitNote(p: Param): string {
	const bits: string[] = [];
	const t = p.t;
	if (typeof t === "object" && "arr" in t) {
		const rows = typeof t.arr === "object" && "arr" in t.arr;
		if (t.max !== undefined) bits.push(`at most ${t.max} ${rows ? "rows" : "items"}`);
		if (rows && (t.arr as { max?: number }).max !== undefined) bits.push(`each at most ${(t.arr as { max?: number }).max} cells`);
	}
	if (p.max) bits.push(`${p.max.toLocaleString("en")} characters at most`);
	return bits.length ? `Limit: ${bits.join(", ")}.` : "";
}

function argTable(comp: string, doc: ComponentDoc): string {
	const spec = LIB.get(comp)!;
	const rows = spec.params.map((p, i) => `| ${i + 1} | \`${p.name}\` | \`${showType(p.t).replace(/\|/g, "\\|")}\` | ${p.opt ? "no" : "yes"} | ${[(doc.args[`${comp}.${p.name}`] ?? "").replace(/\n/g, " "), limitNote(p)].filter(Boolean).join(" ")} |`);
	return `| # | Argument | Type | Required | Notes |\n|---|---|---|---|---|\n${rows.join("\n")}`;
}

export function componentPage(name: string): string {
	const doc = DOCS[name];
	const spec = LIB.get(name)!;
	const out: string[] = [`# ${name}`, "", doc.summary, ""];
	for (const s of doc.shots) out.push(`![${s.caption}](../screenshots/${s.file}.png)`, `<sub>${s.caption}</sub>`, "");
	out.push("## Signature", "", "```text", sig(name), ...(doc.helpers ?? []).map(sig), "```", "");
	out.push("## When to use", "", ...doc.use.map((u) => `- ${u}`), "");
	if (doc.avoid) out.push(`Not for: ${doc.avoid}`, "");
	out.push("## Arguments", "");
	out.push(`### ${name}`, "", argTable(name, doc), "");
	for (const h of doc.helpers ?? []) {
		out.push(`### ${h}`, "", argTable(h, doc), "");
		void LIB.get(h)!.desc;
	}
	out.push("## Example", "", "```openui", doc.example.trim(), "```", "");
	if (doc.exampleNote) out.push(doc.exampleNote, "");
	if (doc.interaction?.length) out.push("## Interaction", "", ...doc.interaction.map((i) => `- ${i}`), "");
	if (LIB.get(name)!.params.some((p) => p.name === "tooltips")) out.push("## Tooltips", "", `${TARGET_HELP[name] ?? ""} See [Tooltip](Tooltip.md). Write \`null\` for each skipped optional argument before \`tooltips\`, which is always last.`, "");
	out.push("## Tips and pitfalls", "", ...doc.tips.map((t) => `- ${t}`), "");
	out.push("## Related", "", doc.related.map((r) => `[${r}](${r}.md)`).join(" · "), "");
	void spec;
	return out.join("\n");
}

export function tooltipPage(): string {
	const hosts = SPECS.filter((s) => s.params.some((p) => p.name === "tooltips")).map((s) => s.name);
	const out: string[] = ["# Tooltip", "", TOOLTIP_DOC.summary, ""];
	for (const s of TOOLTIP_DOC.shots) out.push(`![${s.caption}](../screenshots/${s.file}.png)`, `<sub>${s.caption}</sub>`, "");
	out.push("## Signature", "", "```text", sig("Tooltip"), "```", "");
	out.push("A Tooltip draws nothing by itself. It goes in the `tooltips` argument of the component it describes, which is always that component's last argument.", "");
	out.push("## Arguments", "", "| # | Argument | Type | Required | Notes |", "|---|---|---|---|---|");
	const notes: Record<string, string> = {
		target: "Which element of the host. See the table below.",
		hint: "Shown on hover in a bubble. 140 characters at most.",
		detail: "The body of the panel that opens on click or Enter. 800 characters at most, markdown.",
		code: "A command or snippet in the panel, highlighted for `language`. 40 lines at most.",
		language: "`python`, `js`, `bash`, `sql`, `yaml`, `json`, `go` or `rust`.",
		tone: "`info` (default), `good`, `warn` or `bad`: the colour of the `◆` badge and the panel border.",
		link: "An `http://` or `https://` link shown in the panel. A terminal cannot open it, so it is text to copy.",
		linkLabel: "Text shown instead of the bare link.",
	};
	LIB.get("Tooltip")!.params.forEach((p, i) => out.push(`| ${i + 1} | \`${p.name}\` | \`${showType(p.t).replace(/\|/g, "\\|")}\` | ${p.opt ? "no" : "yes"} | ${notes[p.name] ?? ""} |`));
	out.push("", "## Targets by host", "", "| Host | `target` |", "|---|---|");
	for (const h of hosts) out.push(`| [${h}](${h}.md) | ${TARGET_HELP[h]} |`);
	out.push("", "A target that matches nothing is a validation error that lists the valid targets, so the assistant can correct it. Two Tooltips on one target, a hint over 140 characters, and a link that is not `http(s)` are errors too.", "");
	out.push("## How it looks", "", "- The element shows a `◆` in the tone colour: on the top border of a box, after the text of a one-line element, on the curve at an annotated point.", "- Hover (or Tab to it) and a bubble with the hint appears next to it. The bubble is drawn over rows the widget already has, so nothing moves.", "- Click or press Enter to open the panel under the widget. Esc closes it.", "- Without a hint or detail there is nothing to show; one is enough.", "");
	out.push("## Example", "", "```openui", `root = Stack([c])
c = PieChart(["qwen3", "llama", "free"], [38, 52, 14], null, null, [t1, t2])
t1 = Tooltip("llama", "Biggest tenant", "Serves the support bot. Pinned to two nodes.", "vllm serve llama-3.3-70b --tensor-parallel-size 2", "bash", "info")
t2 = Tooltip("free", "Room for one more model", null, null, null, "good")`, "```", "");
	out.push("## Tips and pitfalls", "", "- Add one only where there is something worth saying: about 8 per component at most (more than 12 is an error).", "- Put the point in `hint`; use `detail` and `code` for the rest.", "");
	return out.join("\n");
}

export function indexPage(): string {
	const groups = ["Layout and text", "Data", "Interactive", "Rich content", "Charts", "Diagrams and maps"] as const;
	const out: string[] = ["# Components", "", "Every component the assistant can draw. Each page shows what it looks like, its signature, every argument, an example that is checked by the test suite, and the interactions it supports.", "", "A widget is written in OpenUI Lang: one `name = Component(...)` per line, positional arguments only, `root = Stack([...])` first. The assistant gets the full reference from `render_widget` with `reference=true`.", ""];
	for (const g of groups) {
		const names = Object.entries(DOCS).filter(([, d]) => d.group === g).map(([n]) => n);
		if (!names.length) continue;
		out.push(`## ${g}`, "", "<table>");
		for (let i = 0; i < names.length; i += 3) {
			out.push("<tr>");
			for (const n of names.slice(i, i + 3)) {
				const d = DOCS[n];
				out.push(`<td valign="top" width="33%"><a href="${n}.md"><img src="../screenshots/${d.shots[0].file}.png" width="300" alt="${n}"></a><br><b><a href="${n}.md">${n}</a></b><br><sub>${d.summary.split(". ")[0].replace(/`/g, "").replace(/\.$/, "")}</sub></td>`);
			}
			for (let k = names.slice(i, i + 3).length; k < 3; k++) out.push("<td></td>");
			out.push("</tr>");
		}
		out.push("</table>", "");
	}
	out.push("## Used by every host", "", `[Tooltip](Tooltip.md): ${TOOLTIP_DOC.summary.split(". ")[0].replace(/`/g, "")}.`, "");
	out.push("## Size limits", "", "A widget over a limit is not drawn, and the error names the limit and the line, so the assistant can shrink it. The limits keep every redraw cheap: pi draws all widgets on every frame, and a terminal shows about one screen anyway. Each component page repeats its own.", "");
	out.push("| What | Limit |", "|---|---|");
	const rows: Array<[string, string]> = [
		["The whole source", `${LIMITS.source / 1000} KB`],
		["Components in one widget", `${LIMITS.elements}`],
		["Nesting", `${LIMITS.depth} levels`],
		["Children of a Stack, Card or tab", `${LIMITS.children}`],
		["Tabs", `${LIMITS.tabs}`],
		["A string", `${LIMITS.string} characters (Text ${LIMITS.text}, Markdown and CodeBlock ${LIMITS.markdown}, a table cell ${LIMITS.cell})`],
		["Table", `${LIMITS.tableRows} rows by ${LIMITS.tableCols} columns`],
		["BarChart", `${LIMITS.bars} bars`],
		["LineChart, AreaChart", `${LIMITS.points} points, ${LIMITS.series} series`],
		["RadarChart", `${LIMITS.axes} axes, ${LIMITS.series} series`],
		["Dag", `${LIMITS.dagNodes} nodes, ${LIMITS.dagEdges} edges`],
		["Erd", `${LIMITS.entities} entities, ${LIMITS.fields} fields each, ${LIMITS.relations} relations`],
		["InfraMap", `${LIMITS.infraNodes} nodes, ${LIMITS.infraLinks} links, ${LIMITS.zones} zones`],
		["SequenceDiagram", `${LIMITS.steps} steps, 10 participants`],
		["GeoMap", `${LIMITS.geoPoints} points, ${LIMITS.links} links`],
		["Faq", `${LIMITS.faq} items`],
		["Pictures", `${LIMITS.images} (Image components and markdown picture lines together)`],
		["CodeBlock", `${LIMITS.codeLines} lines`],
		["Choice", `${LIMITS.choices} per widget, a question ${LIMITS.question} characters, an option ${LIMITS.option}, ${LIMITS.choiceOptions} options, an Other answer ${LIMITS.other}`],
		["Rows drawn", "1500 (the rest is cut and the widget says so)"],
	];
	for (const [what, limit] of rows) out.push(`| ${what} | ${limit} |`);
	out.push("");
	return out.join("\n");
}

/** path (relative to the repo) -> contents */
export function generateDocs(): Record<string, string> {
	const files: Record<string, string> = { "docs/components/README.md": indexPage(), "docs/components/Tooltip.md": tooltipPage() };
	for (const name of Object.keys(DOCS)) files[`docs/components/${name}.md`] = componentPage(name);
	return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const files = generateDocs();
	mkdirSync(join(ROOT, "docs/components"), { recursive: true });
	for (const [p, text] of Object.entries(files)) writeFileSync(join(ROOT, p), text.endsWith("\n") ? text : text + "\n");
	console.log(`wrote ${Object.keys(files).length} pages to docs/components/`);
}
