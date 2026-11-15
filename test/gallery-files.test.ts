// docs/gallery.txt and docs/gallery-narrow.txt are every sample drawn as text (the second at 60 columns, the small-screen set).
// Reading them is how a change to how things look is reviewed in a diff; they must be what the code draws now.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { GALLERY_FILES, galleryText } from "../scripts/gallery-lib.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of GALLERY_FILES) {
	test(`${f.file} is what the samples draw at ${f.width} columns (run: npm run gallery:files)`, () => {
		assert.equal(readFileSync(join(root, f.file), "utf8"), galleryText(f.width, f.prefix));
	});
}

test("the narrow gallery shows the small-screen behaviors in plain text", () => {
	const text = readFileSync(join(root, "docs/gallery-narrow.txt"), "utf8");
	assert.match(text, / «  ‹ [█░]+ \d+–\d+\/\d+  ›  »/, "a pan bar");
	assert.ok(text.includes("Rolling restart in pro…"), "a cell cut to fit");
	assert.ok(text.includes("Infrastructure map") && text.includes("Deployments history"), "tabs that wrapped");
});
