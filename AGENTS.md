# AGENTS.md

For people and AI agents who change this repository. Users should read [README.md](README.md).

pi-openui is a pi extension. It gives the model a `render_widget` tool that takes OpenUI Lang and draws an interactive widget
in the terminal. The source is TypeScript that runs directly (no build step), with no runtime dependencies.

## Map

| Path | What |
|---|---|
| `src/lang/parse.ts`, `library.ts` | Parser, the one table of component signatures, validation, the reference text for the model |
| `src/lang/docs.ts` | Hand-written guidance for the component pages in `docs/components/` |
| `src/lang/samples.ts` | One example per component. They are compiled by the tests and drawn by `/openui-gallery` |
| `src/blocks/` | Component renderers. Each produces a `Block`: rows of styled cells plus click targets. No pi imports |
| `src/blocks/interact.ts` | Hit testing, activation, keyboard navigation, panning. Pure logic, no terminal |
| `src/diagram/` | Dag, Erd and InfraMap: layout, router, wire drawing, and `decode.ts`, the test oracle |
| `src/pi/` | The extension: `extension.ts` (tool and commands), `widget.ts` (themed pi-tui component), `images.ts` |
| `.pi/extensions/openui.ts` | One line that re-exports `src/pi/extension.ts` so pi finds it |
| `test/` | `node:test` suites. `test/e2e/` drives a real pi in a pty |
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
