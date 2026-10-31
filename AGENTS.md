# AGENTS.md

For people and AI agents who change this repository. Users should read [README.md](README.md).

pi-openui is a pi extension. It gives the model a `render_widget` tool that takes OpenUI Lang and draws an interactive widget
in the terminal. The source is TypeScript that runs directly (no build step), with no runtime dependencies.

## Map

| Path | What |
|---|---|
| `src/lang/parse.ts`, `library.ts` | Parser, the one table of component signatures, validation, the reference text for the model |
| `src/lang/md.ts` | What a picture line in markdown is (`![alt](path "caption")`), shared by the renderer, the validator and the picture limit |
| `src/lang/docs.ts` | Hand-written guidance for the component pages in `docs/components/` |
| `src/lang/samples.ts` | One example per component. They are compiled by the tests and drawn by `/openui-gallery` |
| `src/blocks/` | Component renderers. Each produces a `Block`: rows of styled cells plus click targets. No pi imports |
| `src/blocks/interact.ts` | Hit testing, activation, keyboard navigation, panning. Pure logic, no terminal |
| `src/blocks/notes.ts` | Notes: what can carry one, the words for it, cleaning, the message, pins and the tray. Pure |
| `src/diagram/` | Dag, Erd and InfraMap: layout, router, wire drawing, and `decode.ts`, the test oracle |
| `src/pi/` | The extension: `extension.ts` (tool and commands), `widget.ts` (themed pi-tui component), `images.ts` |
| `.pi/extensions/openui.ts` | One line that re-exports `src/pi/extension.ts` so pi finds it |
| `test/` | `node:test` suites. `test/pi-setup.ts` is the shared harness for the ones that drive the pi component. `test/e2e/` drives a real pi in a pty |
| `scripts/` | Gallery, doc generator, screenshot pipeline |

## Commands

```sh
npm test                 # everything, about 5 s, no network, no model calls
npm run docs             # regenerate docs/components after editing library.ts or docs.ts
npm run screenshots      # regenerate docs/screenshots (Python + Pillow + the font)
npm run gallery          # print every component
python3 test/e2e/run.py  # real pi in a pty; needs `pip install pyte`; set E2E_MODEL to a cheap model
```

## Rules

- **One table of signatures.** A component's arguments live in `SPECS` in `src/lang/library.ts`. Validation, the model's
  reference text and the docs pages all read it. Never describe an argument anywhere else by hand.
- **Blocks stay pure.** `src/blocks/` and `src/diagram/` must not import pi. Everything pi-specific goes through `src/pi/`.
  That is why most behaviour is testable without a terminal.
- **Every glyph must be in the terminal font.** `test/font.test.ts` reads JetBrains Mono Nerd Font Mono. Before using a new
  character, check it. Do not use `✔ ✖ ℹ ⧉ ⇌ ☺ ▨ ⓘ ↻ ▭ ▦ ▤`: they are missing.
- **Border cells are not underlined or reversed.** Hover and focus recolour them (`palette.ts`), because an underline under a
  vertical bar draws a tick on every row.
- **A diagram change needs the round trip.** If you touch the router or the glyphs, the decoder (`decode.ts`) and the fuzz
  tests must still pass. A drawn wire must be unambiguous; an edge that cannot be routed is omitted and listed.
- **Mistakes must reach the model.** If the model can get something wrong, make it a validation error with a line number and
  the valid choices (see the tooltip target check). Render-time warnings are invisible to the model.
- **Typing returns the keyboard to pi.** An armed widget must never keep Enter or letters when the user starts typing.
- **Docs are generated where they can be.** After changing `library.ts` or `docs.ts`, run `npm run docs`. After changing how a
  component looks, run `npm run screenshots`. `test/docs.test.ts` fails on stale pages and broken links.
- **Every list and string has a limit, in one table.** `LIMITS` in `library.ts`. A new component, list or string gets a limit
  there (and `max` in `SPECS`), and `test/limits.test.ts` gets a case. pi draws every widget on every frame, so an unbounded
  input is a way to freeze or crash it. Over a limit is a validation error with the number in it.
- **Cells are shared and frozen.** Make one with `cell(ch, role)`; never assign to `.ch` or `.role`, and never spread a cell to
  change it. Hover and focus replace a cell (`mark` in `widget.ts`). A test fails with a `TypeError` if something mutates one.
- **`render()` is cached; keep it that way.** If something new changes how a widget looks, add it to the key in
  `OpenUIWidget.render()`, or the picture will not update. `render`, `handleMouse` and `handleKey` must never throw.
- **Routing work is budgeted.** `tuning.budget` is shared by every edge and candidate layout of one diagram. A change that
  needs more has to say why, and `test/pi-resources.test.ts` shows what a limit-sized diagram costs.
- **The last column of every line is empty.** pi's fullscreen scrollbar is painted over it (`RIGHT` in `widget.ts`). A change
  that draws to the full width hides things behind the scrollbar: it once cut the `]` off the notes chip.
- **One definition of a picture line.** The renderer, `checkImages` and the picture limit all use `src/lang/md.ts`. A test
  renders random markdown and checks they count the same pictures; keep it passing if you change the syntax.
- **No new dependencies** without a good reason; there are none today.
- **Ask before committing, tagging or publishing** if you are an agent acting without a request to do so.

## Pitfalls already paid for

- Node's TypeScript stripping does not support parameter properties (`constructor(private x)`) or enums. Write plain fields.
- pi's `isImageLine` is not exported. Use `line.includes("\x1b_G")`.
- A code point that maps to glyph 0 looks present in a naive cmap reader. See `test/font.test.ts`.
- `lang-core` style parsers drop badly typed children silently. Ours reports them all; keep it that way.
- A pty test that clicks a live button sends a real turn and appends to the session file. Do not re-run that against a saved
  fixture, and do not make tests spend model tokens.
- Do not create `node_modules` or large trees in a synced folder (iCloud). There is no install step here.
- pi appends to a session file it resumes. Regenerate fixtures per run.
- `render_widget` results in resumed sessions are redrawn from `details.source`, so keep that field.
- `widget.lastBlock()` changes only when `render()` runs. A test that acts and then looks for a target in the new picture (a
  note's tray, a tab's content) must draw a frame first, as pi does after every event.
- A benchmark loop that never yields starves timers, so a copy button's 1.8 s timer piles up and looks like a leak. `await` a
  turn now and then when measuring memory.
- The `node:test` glob is `test/*.test.ts`: shared helpers go in files that do not end in `.test.ts`.
- A picture line is drawn by `image()` in `core.ts` from inside `markdownBlock`, so those two modules import each other. That
  is fine because only functions are used at call time. Keep it that way: no top-level use of the other module.
- The docs link checker ignores code, so a page can show `![alt](path)`. A caption passed to a screenshot is not code: it goes
  inside `![...](...)` itself, so it must not contain image syntax.
