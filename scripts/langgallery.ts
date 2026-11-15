// node scripts/langgallery.ts [key prefix] [--width=100] [--plain]   (colour by default)
// The prefix is matched the way /openui-gallery matches it: `wide` is every small-screen example, e.g. `wide --width=60 --plain`.
import { ansiPalette } from "../src/diagram/palette.ts";
import { galleryLines } from "./gallery-lib.ts";

const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith("--"));
const width = Number((args.find((a) => a.startsWith("--width=")) ?? "--width=100").slice(8));
console.log(galleryLines(width, key, args.includes("--plain") ? undefined : ansiPalette).join("\n"));
