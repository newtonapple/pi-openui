# Design

Why the code is shaped the way it is. For how to use it, see the [README](../README.md); for how it is tested, see
[testing.md](testing.md).

## Goal

Draw OpenUI Lang widgets (dashboards, charts, diagrams, maps) in pi's terminal UI, with a mouse and a keyboard path for
everything, using unicode. No browser, no HTML, no dependencies. The model writes the widget; the user looks at it and
answers it.

## Pipeline

```
source --parse--> statements --compile--> El tree --render--> Block --> lines (pi-tui)
                  (names, refs)  (typed, validated)  (cells + targets)       ^
                                                                     mouse and key events
```

1. **Parse** (`src/lang/parse.ts`). A hand-written parser for the positional subset: strings, numbers, booleans, null, arrays,
   objects, calls, `@Step(...)` actions and references. References may be used before they are defined. It recovers after a bad
   statement so one run reports every mistake, each with a line number, and it never throws.
2. **Compile** (`src/lang/library.ts`). One table of component signatures (`SPECS`). Compiling checks arity, types, enums,
   required arguments, unreachable and undefined names, cycles, and cross references (edge ids, relation names, tooltip
   targets, row lengths, series lengths). The result is a tree of `El` nodes or a list of errors. The same table writes the
   reference the model reads and the docs pages.
3. **Render** (`src/blocks/`). Every component becomes a `Block`: `w`, `rows` of `{ch, role}` cells, and `targets`, the
   rectangles you can hover or click. Layout helpers (`vstack`, `hstack`, `boxed`) shift the targets with the cells, so a
   target is correct however deeply it is nested. Roles are semantic ("box.failed", "series.2"); colours come later.
4. **Style and draw** (`src/pi/widget.ts`). A palette maps roles to the active pi theme. Hover and focus add a suffix to the
   role of the cells in a target. The widget returns lines to pi-tui, and handles `handleMouse`.
5. **Interact** (`src/blocks/interact.ts`, `src/pi/widget.ts`). Hit testing returns the most specific target at a cell: an
   exact cell match (a pie wedge) beats a rectangle, a small rectangle beats a big one. Activation changes widget state
   (selected tab, open FAQ, picked choice, open tooltip), the block is laid out again, and the pi renderer repaints.

## What a widget costs pi

pi calls `render()` on every component in the transcript on every frame, up to 60 a second, and again for each mouse event. A
widget is a long-lived part of that loop, so the cost is designed, not hoped for:

- **Limits at the door.** `LIMITS` in `library.ts` caps the source, nesting, element count and every list and string. A
  violation is a validation error with the number in it, so the model fixes it and nothing oversized is ever laid out.
  `compile()` cannot throw. Without this, a 2.5 MB Markdown took 4.7 s and 771 MB, a 120-node infrastructure map froze pi for
  5 s, and a 3,000-deep nesting overflowed the stack.
- **Routing has a budget.** All edges, retries and candidate layouts of one diagram share 2,000,000 search expansions (about
  half a second). When they run out the remaining edges are listed as "not drawn", which the decoder tests already treat as a
  valid outcome. The budget counts work, not time, so results do not depend on the machine.
- **A draw is cached.** `render()` returns the same lines until the layout, the pointer, the focus, the mode, a notice or the
  width changes. With 300 widgets in a transcript an unchanged frame costs 0.07 ms; it cost 8 ms for 17 before the cache.
- **Layouts are kept.** A diagram's layout depends only on the component and the width, so it is stored with the component
  (and freed with it). A note, a tab switch or a resize does not route the wires again.
- **Cells are shared.** A cell is an interned, frozen `{ch, role}`: a widget is mostly blanks and lines, and one object per
  cell cost 160 KB a widget (47 MB for 300). Sharing brought it to 59 KB (17 MB). Hover and focus build a new cell and never
  change one; freezing makes a mistake throw in the tests.
- **State is per session.** Widget state is dropped at `session_shutdown`, and a widget still on screen makes its state again
  on demand, so a pi process that lives for days does not collect every session's widgets.
- **The last column stays empty.** pi paints its fullscreen scrollbar over it, so the widget lays out one column narrower than
  the line. Anything drawn there would sit behind the scrollbar.
- **Nothing throws into pi.** `render`, `handleMouse` and `handleKey` catch what they cannot handle. A broken widget draws one
  error line.

`test/limits.test.ts` and `test/pi-resources.test.ts` hold these in place.

## State

Widget state lives outside the component, keyed by the tool call id (or the message id), because pi rebuilds message components
whenever it invalidates. State is in memory: a resumed session redraws widgets from the tool result's `details.source`, in their
initial state.

## Diagrams

See [diagrams.md](diagrams.md). The short version: a global grid router with one wire per edge, and a decoder oracle that reads the
finished glyphs back into edges so every test is a round trip.

## Decisions worth remembering

- **Our own parser instead of a library.** The first spike used `@openuidev/lang-core`. It has no React dependency but silently
  drops mistyped children, reports them only in a side field, and does not know about our argument order rules. Owning the
  parser and the signature table let validation, the model's reference and the docs come from one place, and removed the only
  dependency.
- **Errors go to the model.** Anything the model can get wrong is a validation error at tool-call time, with the valid choices
  listed. A warning drawn under the widget would only be seen by the user.
- **The terminal is a grid.** A cell holds one glyph and one style. Pie slices use half blocks with two colours per cell, curves
  and the map use braille (2x4 dots per cell), bars use eighth blocks. Pictures are the exception: they are placed by the
  terminal over cells the widget reserves and frames.
- **Border cells recolour.** Underline and reverse on line-art glyphs draw ticks and blocks, so hover and focus use colour there.
- **Glyphs come from the font.** Seven glyphs in the first version were missing from the terminal font and were replaced. A test
  now reads the font.
- **Typing wins.** A widget that kept the keyboard after a click would re-fire a button when the user pressed Enter to send a
  message. Any typed character disarms it.
- **Tooltips are the agent's; notes are the user's.** Tooltips are attached by the model and shown on hover. Notes are the
  user annotating an element of a widget and sending the notes back.
- **A picture in markdown is the Image component.** Our markdown renderer is its own (`src/blocks/markdown.ts`, cells and
  targets, not pi's `Markdown`, which has no image case either). A line that is only `![alt](path)` is handed to the same
  `image()` that draws the Image component, so pi-tui sizes and encodes it, and a terminal without graphics gets the same
  labelled frame. `src/lang/md.ts` defines what such a line is, for the renderer and the validator alike.
- **Notes go into the message box, never straight to the agent.** A note is a draft: the user reads the message, edits it and
  sends it. The words about an element come from the widget, so they are cleaned first (control characters, backticks, quotes,
  `@file` references), and the user's own text is left alone.
- **Notes need no new coordinates.** Every part a tooltip can target is also something a note can target, so both use the
  anchors a component already reports. `src/blocks/notes.ts` is pure: it knows items, words, pins, the tray and the message,
  and nothing about pi. `widget.ts` supplies the editor and the message box through two hooks.

## Status

All 23 components render and are interactive. See [testing.md](testing.md) for what was verified and how, and the
[README](../README.md#limits) for the known limits.
