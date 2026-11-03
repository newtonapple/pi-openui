# Testing

```sh
npm test
```

runs everything below in about 6 seconds. It makes no network calls and no model calls.

## Layers

| Layer | Files | What it proves |
|---|---|---|
| Language | `test/lang.test.ts` | The parser recovers from bad input and never throws. Every mistake the assistant is likely to make (named arguments, wrong types, helpers used alone, bad ids, cycles) gets a clear error with a line number. |
| Diagrams | `test/dag.test.ts`, `erd.test.ts`, `infra.test.ts` | Round trips through the decoder oracle, on fixed and random inputs. See [diagrams.md](diagrams.md). |
| Limits | `test/limits.test.ts` | Every size limit is accepted at its number and refused one above with the number in the error; `compile()` survives nesting bombs, 5 MB of garbage and 10,000 statements; at most 25 errors come back. |
| Resources | `test/pi-resources.test.ts` | An unchanged widget is drawn from its cache (120 widgets under 4 ms a frame); cells are frozen; a note does not route a diagram again; every component at its limit (Choice included: 12 questions of 6 options) draws within bounds at 24 to 250 columns; the row cap; render and input never throw; state is dropped at shutdown. |
| Notes | `test/notes.test.ts`, `test/pi-notes.test.ts` | The words for each kind of element, cleaning, the message, pins and the tray, navigation; then the whole flow through the pi component: chip, mode, editor, pins, Add to message, Clear, keyboard, limits, tabs, width at every terminal size. |
| Pictures in markdown | `test/markdown-image.test.ts` | Which lines are pictures (alone on a line, a caption, `<path with spaces>`; not in code or quotes). The renderer draws the same pictures the validator counts, on 400 random texts. FAQ answers, the limit of 12, missing files and web URLs coming back to the model with a line, and the Kitty command through pi-tui: in a Card, in an FAQ, narrow, hovered. |
| Interaction logic | `test/interact.test.ts` | Every click, key and tooltip path on rendered blocks, with no terminal: tabs, nested tabs, FAQ, choices (staging, the bar, Send, Clear, locking, keyboard order around Send), buttons, copy, tooltips on every host, panning, hit testing, badges. |
| Choice answers | `test/choice.test.ts`, `test/pi-choice.test.ts` | The pure rules (what an answer is, Other, the one-line and the numbered message, cleaning, the slash-command rule, a widget at every limit, the message printed in the docs); then the Other row through the pi component: the editor, Esc, empty text, the keys while it is open, typing returning the keyboard, notes mode, a sent widget, and the text the model reads in the tool description. |
| pi component | `test/pi-component.test.ts` | The widget driven through pi's own `pi-tui` classes and real theme: widths, colours, hover, click, keys, the hover bubble, the `render_widget` tool, and pictures with Kitty graphics forced on (where the command lands, the frame, a fake converter standing in for pi's JPEG converter). |
| Fonts | `test/font.test.ts` | Every glyph the widgets draw exists in the terminal font. Reads the font's cmap directly. |
| Width | `test/width.test.ts` | Our idea of a character's width is pi's (`visibleWidth`): every glyph in `src/` is one cell; the committed table (`src/diagram/wide.ts`) is right outside the emoji blocks, and a table that is a Unicode release behind in those blocks is a warning, not a failure, because the extension asks pi about them when it loads; after that correction we agree with pi on every character of Unicode, and a stale table misaligns a row with emoji until the extension has loaded; every row of a widget with wide characters in text, titles, labels and icons is as wide in pi as in our grid. A wrong width slides the rest of the row and the borders come out of line. `test/widefix.test.ts` covers the correction itself with a fake probe, no pi needed. |
| Release | `test/release.test.ts`, `release-flow`, `release-recovery`, `release-registry`, `release-start`, `release-publish` | The changelog rewrite. Then the Makefile run for real in a sandbox (a throwaway repo, a local bare `origin`, a stand-in for npm): the first release, a normal one, the recovery from a failed publish, a registry that is slow to show a new version, every refusal changing nothing, and a tag only ever on what npm published. Nothing is published. |
| Package | `test/package.test.ts` | The `pi` manifest points at the extension; every pi-supplied package the source imports is a peer dependency and none is bundled; nothing else is imported; the MIT license, repository fields and `files` list are in place and match the README. See [releasing.md](releasing.md). |
| Docs | `test/docs.test.ts` | Every example compiles, every argument is explained, generated pages are current, every link and screenshot exists. |

The pi tests load pi's packages from the installed pi (`test/register-pi.mjs`). They skip when pi is not installed.

## Glyph audit

The terminal falls back to another font for a glyph the main font lacks, which can look different or misalign. The widgets
therefore use only glyphs in JetBrains Mono Nerd Font Mono. Use another font with:

```sh
PI_OPENUI_FONT=/path/to/YourFont.ttf npm test
```

The reader had a bug worth remembering: a code point that maps to glyph 0 (`.notdef`, the tofu box) looks present in a naive
cmap read. `font.test.ts` has a regression test with glyphs known to be absent.

## End-to-end checks in a real pi

`test/e2e/` drives a real `pi` in a pseudo-terminal and reads the screen with the pyte terminal emulator. It sends real
mouse and key sequences.

```sh
python3 -m venv /tmp/e2e && /tmp/e2e/bin/pip install pyte
E2E_MODEL=openai-codex/gpt-6-luna:off /tmp/e2e/bin/python test/e2e/run.py
```

| Script | Checks |
|---|---|
| `interactive.py` | Tabs, FAQ, choices staged and sent with the bar, Other typed in pi's editor, buttons, hover detail, the tooltip panel, the clipboard payload, narrow-terminal panning, every component in one session (36 checks) |
| `images.py` | With Kitty graphics forced on: the picture command arrives one row under the frame's top border and one column inside its left border, with the right size; hover, click and Esc; pi crops it while scrolling and keeps it in its column; the no-graphics path; a picture written inside markdown, with and without graphics (23 checks) |
| `resume.py` | A saved session containing a `render_widget` result is redrawn as a widget, and is clickable |
| `notes.py` | The chip, pi's own editor opening on a click and taking the typed note, the pin and the tray, Add to message landing in pi's message box with nothing sent, the widget giving the keyboard back, the keyboard path, typing leaving notes mode, a 50-column terminal (28 checks) |

They start pi but send no prompt, so they make no model calls. `E2E_MODEL` only keeps pi from picking your default.
`notes.py` is careful never to press Enter in the message box, which would send the message it just built.

`images.py` records every Kitty command together with the cursor position at the moment it arrived, which is how it can prove
the picture is in the right place.

## Checking with a model

Drive a second pi in another pane (for example with herdr), give it a small prompt, and read the pane. This is how the tool
path was checked: the model read the reference, wrote a widget with a chart and a picture and tooltips, and the keyboard and
the bubble worked on it. Keep it to one or two prompts; the reference costs about 2.5k tokens.

## Regenerating docs

```sh
npm run docs          # docs/components/*.md from src/lang/library.ts and src/lang/docs.ts
npm run screenshots   # docs/screenshots/*.png; needs Python with Pillow and the font
```

`test/docs.test.ts` fails when generated pages are stale.
