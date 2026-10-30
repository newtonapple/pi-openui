// Lets tests import pi's own packages (@earendil-works/pi-tui, typebox) from the installed pi, without copying them.
import { register } from "node:module";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const candidates = [
	process.env.PI_PKG,
	"/opt/homebrew/opt/pi-coding-agent/libexec/lib/node_modules/@earendil-works/pi-coding-agent",
	"/opt/homebrew/Cellar/pi-coding-agent/1.4.0/libexec/lib/node_modules/@earendil-works/pi-coding-agent",
].filter(Boolean);
export const PI_ROOT = candidates.find((c) => existsSync(`${c}/package.json`));
if (PI_ROOT) {
	process.env.PI_PKG_RESOLVED = PI_ROOT;
	register("./pi-hooks.mjs", import.meta.url, { data: { parent: pathToFileURL(`${PI_ROOT}/dist/index.js`).href } });
}
