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
   (selected tab, open FAQ, staged answers, open tooltip), the block is laid out again, and the pi renderer repaints.

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

## Small screens

- **Pan rather than cut.** A block wider than the pane scrolls under a pan bar (`src/blocks/pan.ts`, `panblock.ts`); flowing things
  (rows of tiles and buttons, tabs, a box's title) wrap. A layout shrinks labels only to a floor, past which it scrolls.
- **A table scrolls whole or fits squeezed.** Its columns are squeezed only down to `table.minColumnWidth`; if even that does not
  fit, every column takes its natural width and the table scrolls, cutting nothing.
- **Pinned columns are the model's choice**, at most half the pane, skipped (never squeezed) when they would not fit, so no text is
  ever out of reach.
- **A cut cell is read through the tooltip panel.** A squeezed table knows which cells it cut (`TableBlock.cut`); each becomes a `tip`
  target whose panel shows the whole text as plain text. Reusing the tooltip machinery (hover line, Esc, one panel at a time, Tab and
  Enter) meant no new interaction code; the target has no `◆` badge because the ellipsis is the cue.
- **What is still cut:** a diagram's labels shrink to their floor before it scrolls, and chart legends and radar axes have fixed
  caps. See the table in [interaction.md](interaction.md#what-scrolls-what-wraps-what-is-cut).

## Compatibility

A session stores the widget's OpenUI Lang source (`details.source`) and nothing that was drawn. When the session opens, the source
is compiled and drawn again by whatever version is installed. Two things follow.

- **Drawing changes reach old sessions on their own.** A pan bar, a minimum column width or a new colour applies to every widget in
  every old session as soon as the new version is installed. There is nothing to migrate.
- **Language changes can break them.** A component or argument that was removed or renamed, a positional argument inserted, a new
  required argument, or a lower limit makes an old source fail to compile. That is the only way an old session breaks.

What guards against it:

- **A version.** `LANG_VERSION` in `src/lang/library.ts`, stored as `details.lang` with every new widget (a missing one means 1).
- **Two ways to compile.** `strict` is for what the model writes: every mistake is an error it can fix. `restore` is for a source
  read again from a session: a string over its limit is cut, a list over its limit is cut, extra arguments and statements that are
  never drawn are ignored, `ALIASES` rename old components and `MIGRATIONS` rewrite sources written under older versions. Each
  change is listed in `Compiled.notes`, and the widget shows one quiet line saying it was redrawn with changes. Counts that would
  drop something from the middle of a widget (components, nesting, pictures, Choices) stay errors.
- **A card, never a blank.** If even `restore` fails (or the source is from a newer version), the widget draws the reason and the
  first lines of the source (`src/blocks/fallback.ts`), with control characters removed.
- **A record of signatures.** `test/compat/signatures.json` lists every component and argument the language has had, in order, and
  the highest value of each limit. `test/signatures.test.ts` fails if today's language would break a source written for an earlier
  one: an argument inserted, moved, removed or made required, a choice or a list that accepts less, a lower limit. A component
  grows by a new optional argument at the end (`Table`'s `pin` is one), and `node scripts/freeze-signatures.ts` records it.
- **A corpus.** `test/compat/corpus/` holds sources as older versions wrote them. `test/compat.test.ts` compiles each in `restore`
  mode and draws it at 20, 40, 63 and 100 columns, and a hash manifest makes the corpus append-only. `scripts/freeze-corpus.ts` adds
  to it.

Not covered: a widget written by a newer version and opened in an older extension. That older code cannot be changed now; the
version stamp lets later versions say what they need.

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
- **Widths come from pi.** The terminal puts every character where pi's `visibleWidth` says, so a character we count as one
  cell and pi counts as two (the storage icon U+2630 was one, and so are emoji such as U+2705 in a table cell) moves the rest
  of its row and the borders with it. `src/diagram/wide.ts` is generated from pi's function, and `test/width.test.ts` compares
  the two. The blocks where Unicode adds emoji with every release (U+2190-2BFF and U+1F000-1FFFF) are not left to that snapshot:
  when the extension loads it asks the running pi about those ~6,800 code points (11 ms, `src/pi/widths.ts`), so a pi upgrade
  cannot misalign a row, and a snapshot that is a release behind is a warning in the tests, not a failure.
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
