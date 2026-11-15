// Every sample drawn as text, at a width: what `npm run gallery` prints, and what docs/gallery.txt and docs/gallery-narrow.txt hold.
// Shared by scripts/langgallery.ts, scripts/gen-gallery.ts and test/gallery-files.test.ts.
import { renderTree } from "../src/blocks/render.ts";
import { newState } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";

/** The samples whose key starts with `prefix` (all of them without one), drawn at `width` columns as lines of text. */
export function galleryLines(width: number, prefix = "", palette?: Parameters<typeof rowsToLines>[1]): string[] {
	const out: string[] = [];
	for (const s of LANG_SAMPLES.filter((x) => !prefix || x.key.startsWith(prefix))) {
		const c = compile(s.source);
		out.push("", `=== ${s.title}`);
		if (!c.ok) {
			out.push("COMPILE ERRORS:", ...c.errors);
			continue;
		}
		const { block, warnings } = renderTree(c.root!, width, newState());
		out.push(...rowsToLines(block.rows, palette));
		if (warnings.length) out.push(`warnings: ${JSON.stringify(warnings)}`);
	}
	return out;
}

/** The two files under docs/: everything at 100 columns, and the small-screen set at 60. */
export const GALLERY_FILES: Array<{ file: string; width: number; prefix: string }> = [
	{ file: "docs/gallery.txt", width: 100, prefix: "" },
	{ file: "docs/gallery-narrow.txt", width: 60, prefix: "wide" },
];

export const galleryText = (width: number, prefix: string): string => galleryLines(width, prefix).join("\n") + "\n";
