// What a widget shows when its source cannot be drawn again (a language change an old session was never migrated across, or a
// source from a newer version than this extension). Never a blank: the reader gets the reason and the start of the source.
// Pure: lines of plain text; the caller colours them.

const SOURCE_LINES = 12;
const WIDTH = 80;

/** One short line of plain text: control and escape characters are what a stored source must never be allowed to send to a terminal. */
const tidy = (s: string, max: number): string => {
	const clean = s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ");
	return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
};

export function fallbackLines(source: string, errors: string[], lang: number): string[] {
	const lines = [`This widget could not be drawn again (OpenUI Lang v${lang}).`];
	if (errors.length) lines.push(`Why: ${tidy(errors[0], WIDTH)}`);
	const text = String(source ?? "");
	if (text.trim()) {
		lines.push("The source it was drawn from:");
		const all = text.split("\n");
		for (const l of all.slice(0, SOURCE_LINES)) lines.push(`  ${tidy(l, WIDTH)}`);
		if (all.length > SOURCE_LINES) lines.push(`  … ${all.length - SOURCE_LINES} more line${all.length - SOURCE_LINES === 1 ? "" : "s"}`);
	}
	return lines;
}
