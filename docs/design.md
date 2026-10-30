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
- **Tooltips are the agent's; notes are the user's.** Tooltips are attached by the model and shown on hover. Notes (the user
  annotating an element of a widget and sending the notes back) are a separate feature.

## Status

All 23 components render and are interactive. See [testing.md](testing.md) for what was verified and how, and the
[README](../README.md#limits) for the known limits.
