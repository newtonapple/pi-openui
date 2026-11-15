// A picture is drawn over its reserved frame by the terminal. If the terminal (or what sits between it and pi, such as a phone
// app that reports no cell size) does not draw it, the frame is empty. The frame says what it is, under the picture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTree } from "../src/blocks/render.ts";
import { newState, type ImageService } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";

const svc: ImageService = {
	place: (_src, maxCols, maxRows) => ({ key: "k1", cols: Math.min(maxCols, 40), rows: Math.min(maxRows, 8) }),
	describe: () => "inline.png · 192×108 · png",
};
const draw = (width: number, extra = "") => {
	const c = compile(`root = Stack([i])\ni = Image("data:image/png;base64,AAAA", "Sunset over the ridge"${extra})`);
	assert.deepEqual(c.errors, []);
	const { block } = renderTree(c.root!, width, newState(), { images: svc });
	return { block, lines: rowsToLines(block.rows) };
};

test("a placed picture's frame says what it is, in the middle of the reserved area", () => {
	const { block, lines } = draw(60);
	const target = block.targets.find((t) => t.kind === "image")!;
	assert.ok(target.image, "still a picture target, so the terminal draws over it");
	const inside = lines.slice(target.rect.y + 1, target.rect.y + 1 + target.image!.rows).join("\n");
	assert.ok(inside.includes("Sunset over the ridge") || lines.join("\n").includes("Sunset over the ridge"));
	assert.ok(inside.includes("192×108"), inside);
	assert.ok(inside.includes("no picture? terminal can't show it"), `it explains an empty frame:\n${inside}`);
});

test("the placeholder fits every width and never overflows the reserved cells", () => {
	for (const width of [20, 24, 30, 40, 60, 100]) {
		const { block } = draw(width);
		const t = block.targets.find((x) => x.kind === "image")!;
		assert.ok(block.w <= width, `${width}: block ${block.w}`);
		for (let y = t.rect.y; y < t.rect.y + t.image!.rows; y++) assert.equal(block.rows[y].length, block.w);
	}
});

test("a tiny frame (two rows) still says something short", () => {
	const small: ImageService = { place: () => ({ key: "k", cols: 12, rows: 2 }), describe: () => "a.png · 10×10" };
	const c = compile(`root = Stack([i])\ni = Image("data:image/png;base64,AAAA")`);
	const { block } = renderTree(c.root!, 30, newState(), { images: small });
	const text = rowsToLines(block.rows).join("\n");
	assert.ok(/10×10|a\.png/.test(text), text);
});
