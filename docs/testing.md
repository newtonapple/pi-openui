# Testing

```sh
npm test
```

runs everything below in about 5 seconds. It makes no network calls and no model calls.

## Layers

| Layer | Files | What it proves |
|---|---|---|
| Language | `test/lang.test.ts` | The parser recovers from bad input and never throws. Every mistake the assistant is likely to make (named arguments, wrong types, helpers used alone, bad ids, cycles) gets a clear error with a line number. |
| Diagrams | `test/dag.test.ts`, `erd.test.ts`, `infra.test.ts` | Round trips through the decoder oracle, on fixed and random inputs. See [diagrams.md](diagrams.md). |
| Interaction logic | `test/interact.test.ts` | Every click, key and tooltip path on rendered blocks, with no terminal: tabs, nested tabs, FAQ, choices, buttons, copy, tooltips on every host, keyboard order, panning, hit testing, badges. |
| pi component | `test/pi-component.test.ts` | The widget driven through pi's own `pi-tui` classes and real theme: widths, colours, hover, click, keys, the hover bubble, the `render_widget` tool, and pictures with Kitty graphics forced on (where the command lands, the frame, a fake converter standing in for pi's JPEG converter). |
| Fonts | `test/font.test.ts` | Every glyph the widgets draw exists in the terminal font. Reads the font's cmap directly. |
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
| `interactive.py` | Tabs, FAQ, choices, buttons, hover detail, the tooltip panel, the clipboard payload, narrow-terminal panning, every component in one session (29 checks) |
| `images.py` | With Kitty graphics forced on: the picture command arrives one row under the frame's top border and one column inside its left border, with the right size; hover, click and Esc; pi crops it while scrolling and keeps it in its column; the no-graphics path (16 checks) |
| `resume.py` | A saved session containing a `render_widget` result is redrawn as a widget, and is clickable |

They start pi but send no prompt, so they make no model calls. `E2E_MODEL` only keeps pi from picking your default.

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
