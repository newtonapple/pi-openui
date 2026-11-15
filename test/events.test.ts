// /openui-events: what does my terminal app send for a tap, a swipe, a flick? The widget records what reaches it, so the answer
// can be read instead of guessed. It must never record what the user types.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Recorder, describeKey, describeMouse, eventsPath, runEventsCommand } from "../src/pi/events.ts";

const ev = (o: object) => ({ type: "press", button: "left", x: 1, y: 2, shift: false, alt: false, ctrl: false, ...o });

test("a mouse event is one short line: what, which button, where, with which modifier", () => {
	assert.equal(describeMouse(ev({ type: "press", button: "none", x: 9, y: 1 })), "press btn=none x=9 y=1");
	assert.equal(describeMouse(ev({ type: "wheel", button: "none", x: 5, y: 1, shift: true, wheelDelta: 1 })), "wheel btn=none x=5 y=1 shift d=1");
	assert.equal(describeMouse(ev({ type: "drag", alt: true, ctrl: true })), "drag btn=left x=1 y=2 alt ctrl");
});

test("keys: escape sequences and control keys are recorded, what a person types is not", () => {
	assert.equal(describeKey("\x1b[C"), 'key "\\u001b[C"');
	assert.equal(describeKey("\r"), 'key "\\r"');
	assert.equal(describeKey("\t"), 'key "\\t"');
	assert.equal(describeKey("\x7f"), 'key "\\u007f"');
	for (const typed of ["a", "hello world", "my-secret-password", "日本語", " "]) assert.equal(describeKey(typed), null, typed);
	assert.equal(describeKey("\x1b[200~my pasted secret\x1b[201~"), "paste (16 characters, not recorded)", "a paste is counted, never copied");
	assert.ok((describeKey("\x1b[" + "9;".repeat(50)) ?? "").length < 60, "a long sequence is cut");
});

test("recording is off until asked; moves are counted, not logged; an event is written once with the time", () => {
	const lines: string[] = [];
	const r = new Recorder({ write: (l) => lines.push(l), now: () => 1000 });
	r.mouse(ev({ type: "press" }) as any);
	assert.deepEqual(lines, [], "off: nothing");
	r.start();
	r.mouse(ev({ type: "move" }) as any);
	r.mouse(ev({ type: "move" }) as any);
	r.mouse(ev({ type: "press", button: "none", x: 9, y: 1 }) as any);
	r.note("pan +3");
	r.key("\x1b[D");
	r.key("typed");
	assert.equal(r.count, 3, "the press, the note and the key; two moves are counted separately");
	assert.equal(lines.length, 3);
	assert.match(lines[0], /press btn=none x=9 y=1/);
	assert.match(lines[1], /-> pan \+3/);
	assert.match(lines[2], /key "\\u001b\[D"/);
	assert.equal(r.moves, 2);
});

test("it turns itself off after a while, and when told", () => {
	let t = 0;
	const lines: string[] = [];
	const r = new Recorder({ write: (l) => lines.push(l), now: () => t, minutes: 5 });
	r.start();
	t = 4 * 60_000;
	r.key("\x1b[A");
	assert.equal(lines.length, 1);
	t = 6 * 60_000;
	r.key("\x1b[B");
	assert.equal(lines.length, 1, "five minutes are up");
	assert.equal(r.on, false);
	r.start();
	r.stop();
	r.key("\x1b[C");
	assert.equal(lines.length, 1);
});

test("the file is bounded", () => {
	const lines: string[] = [];
	const r = new Recorder({ write: (l) => lines.push(l), now: () => 0, maxLines: 5 });
	r.start();
	for (let i = 0; i < 20; i++) r.key("\x1b[A");
	assert.equal(lines.length, 5);
});

test("/openui-events: on, off, show, clear, and a mistake", () => {
	const dir = mkdtempSync(join(tmpdir(), "openui-ev-"));
	const env = { PI_CODING_AGENT_DIR: dir };
	assert.equal(eventsPath(env), join(dir, "openui-events.log"));
	const r = new Recorder({ now: () => Date.now(), path: eventsPath(env) });
	assert.match(runEventsCommand("", r, env).message, /^off/i);
	const on = runEventsCommand("on", r, env);
	assert.equal(on.level, "info");
	assert.match(on.message, /swipe|tap/);
	assert.equal(r.on, true);
	r.mouse(ev({ type: "press", button: "none" }) as any);
	r.key("\x1b[C");
	assert.ok(existsSync(eventsPath(env)));
	const shown = runEventsCommand("show", r, env);
	assert.match(shown.message, /press btn=none/);
	assert.match(shown.message, /key "\\u001b\[C"/);
	assert.match(runEventsCommand("off", r, env).message, /^off/i);
	assert.equal(r.on, false);
	runEventsCommand("clear", r, env);
	assert.equal(readFileSync(eventsPath(env), "utf8"), "");
	assert.equal(runEventsCommand("wibble", r, env).level, "error");
});
