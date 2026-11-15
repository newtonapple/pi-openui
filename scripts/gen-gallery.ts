// Writes docs/gallery.txt and docs/gallery-narrow.txt: `npm run gallery:files`. test/gallery-files.test.ts fails when they are stale.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GALLERY_FILES, galleryText } from "./gallery-lib.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of GALLERY_FILES) {
	writeFileSync(join(root, f.file), galleryText(f.width, f.prefix));
	console.log(`wrote ${f.file} (${f.width} columns${f.prefix ? `, samples "${f.prefix}…"` : ""})`);
}
