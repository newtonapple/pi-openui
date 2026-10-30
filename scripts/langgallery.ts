// node scripts/langgallery.ts [key] [--width=100] [--plain]   (colour by default)
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";
import { renderTree } from "../src/blocks/render.ts";
import { newState } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { ansiPalette } from "../src/diagram/palette.ts";

const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith("--"));
const width = Number((args.find((a) => a.startsWith("--width=")) ?? "--width=100").slice(8));
for (const s of LANG_SAMPLES.filter((x) => !key || x.key === key)) {
	const c = compile(s.source);
	console.log(`\n=== ${s.title}`);
	if (!c.ok) { console.log("COMPILE ERRORS:\n" + c.errors.join("\n")); continue; }
	const { block, warnings } = renderTree(c.root!, width, newState());
	console.log(rowsToLines(block.rows, args.includes("--plain") ? undefined : ansiPalette).join("\n"));
	if (warnings.length) console.log("warnings:", warnings);
}
