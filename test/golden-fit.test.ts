// A widget that fits its pane must draw exactly as it did before panning existed. The expected pictures in test/golden/ were
// made from the code before the pan bar; a sample that was clipped then has no file (it is meant to change).
// UPDATE_GOLDEN=1 writes the file for every sample that is not clipped, and never overwrites one.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { compile } from "../src/lang/library.ts";
import { LANG_SAMPLES } from "../src/lang/samples.ts";
import { renderTree } from "../src/blocks/render.ts";
import { newState } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "golden");
const WIDTHS = [100, 140];

for (const s of LANG_SAMPLES) {
	for (const width of WIDTHS) {
		test(`${s.key} at ${width} columns draws as it did before panning`, () => {
			const c = compile(s.source);
			assert.deepEqual(c.errors, []);
			const { block } = renderTree(c.root!, width, newState());
			const text = rowsToLines(block.rows).join("\n") + "\n";
			const clipped = text.includes("select a node to pan") || block.targets.some((t) => (t.kind as string) === "pan");
			const file = join(dir, `fit-${s.key}-${width}.txt`);
			if (!existsSync(file)) {
				if (process.env.UPDATE_GOLDEN === "1" && !clipped) {
					mkdirSync(dir, { recursive: true });
					writeFileSync(file, text);
				}
				return; // clipped before: it is meant to change
			}
			assert.equal(text, readFileSync(file, "utf8"));
		});
	}
}
