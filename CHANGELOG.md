# Changelog

## Unreleased

## 0.3.1 (2026-11-14)

- Better screenshots.

## 0.3.0 (2026-11-14)

- **A cell that was cut to fit can be read whole.** A table with a few columns is squeezed to fit and a long cell ends in `…`; now
  that cell is a target. Click it, or Tab to it and press Enter, and it opens under the table as plain text (line breaks kept,
  nothing read as Markdown); click again or Esc closes it. A cut header too, and Markdown tables the same. If the agent gave that
  cell a tooltip, the tooltip's panel opens with the whole text added. A table that scrolls cuts nothing, so it has none of these.
- **`/openui-gallery wide`** draws eleven examples of things that do not fit a phone: a wide table with a pinned column, long cells,
  code with a long line, tabs and tiles that wrap, a wide InfraMap, a Dag, an ERD, a sequence diagram, Markdown with a wide fence
  and table, and a card with a long title. `docs/gallery-narrow.txt` is the same set as text at 60 columns, `docs/gallery.txt` is
  current again (it was not regenerated for the pan bar), and `npm run gallery:files` writes both; a test fails when they are stale.
  `node scripts/langgallery.ts <prefix>` now matches by prefix, as the command does.
- **New screenshots** for the pan bar, pinned columns, cut and opened cells, code, tabs, tiles, an InfraMap, a Dag and a sequence
  diagram at phone width, on the pages of the components they show.

- **A table's columns can be pinned.** `Table(columns, rows, tooltips, pin)`: `pin` (new, 4th argument, optional) lists header names
  that stay in place while a table wider than the pane scrolls, e.g. `Table(cols, rows, null, ["Host", "State"])`. The agent decides:
  left out, nothing is pinned and the whole table scrolls. Pinned columns never take more than half the pane: they are tried in the
  order listed and one that does not fit is skipped, never squeezed, so no text is ever out of reach. While the table scrolls they
  are drawn first, in the order they have in the table; a table that fits is drawn as it was written. A name that is not a column is
  a validation error that lists the columns. Every source written before this still compiles and draws as it did. The reference the
  agent reads says when to pin (one or two narrow columns that identify each row) and when not to.
- **Scrolling in two sizes.** The pan bar is now ` «  ‹ ████░░░ 1–53/87 ›  » `. `‹ ›` move a few cells (`scroll.step`, 8 by default),
  `« »` a page (three quarters of the pane, to a column edge in a table). Left and Right on a focused bar are fine steps; Shift+arrow,
  PageUp and PageDown are pages. Dragging the bar's thumb is still cell-precise. A bar too narrow for four arrows keeps the fine pair.
- **`scroll.step` in the settings file**, with `PI_OPENUI_SCROLL_STEP` and `/openui-config scroll.step <1-40>`. `/openui-config reset`
  now puts every setting back; `/openui-config <setting> reset` puts one back.
- **The language cannot be broken by accident any more.** `test/compat/signatures.json` records every component and argument the
  language has had; a test fails if an argument is inserted, moved, removed or made required, if a list or choice accepts less, or if a
  limit goes down. New arguments go at the end and are optional. `AGENTS.md` says so.

- **A pan bar says when a widget is wider than the pane.** Tables, Dag, Erd, InfraMap and SequenceDiagram that do not fit now show
  `‹ ███░░░░░░ 1–53/87 ›` under them (only when something is cut off). Tap or click `‹` and `›`, click or drag the bar, swipe
  sideways or use a horizontal wheel where your terminal app sends one, Shift+wheel, or Tab to the bar and press Left and Right
  (also in notes mode). The plain wheel still scrolls the transcript. The old text hint `select a node to pan` is gone.
- **Tables keep a minimum column width.** A column is squeezed only down to 12 characters (not three) before the table scrolls
  sideways. Markdown tables are unchanged. Tables that fit are unchanged.
- **A settings file.** `~/.pi/agent/openui.json` (`{ "table": { "minColumnWidth": 12 } }`, 4 to 40),
  `PI_OPENUI_TABLE_MIN_COL`, and `/openui-config` to look at it, set it or `reset` it.
- **Old sessions keep working.** A session stores a widget's source and draws it again, so everything above reaches widgets from
  earlier versions at once. New widgets store the language version (`details.lang`). A source that no longer compiles under today's
  strict rules is now read leniently (a value over a limit is cut, extra arguments are ignored, a statement nothing uses is
  ignored) with one quiet line saying it was redrawn with changes, and one that still cannot be read shows the reason and the start
  of its source instead of a blank. `AGENTS.md` now says language changes must be additive, and `test/compat/` keeps sources as older
  versions wrote them so a change that breaks one fails the tests.
- **Pan rather than cut.** On a narrow pane text used to be shortened with `…` wherever a layout could not give: now it scrolls or wraps
  instead. Code scrolls inside its box, code fences and tables in Markdown scroll on their own, a row of buttons or metric tiles wraps
  onto more rows, a tab strip wraps onto more rows, and a title that does not fit a box's border moves inside as a heading. A Dag,
  InfraMap, Erd or SequenceDiagram that cannot fit scrolls with whole labels instead of 6-character ones (they shrink to 14
  characters at the least), and a table that scrolls cuts no cell at all (before: at 20 characters). Anything still wider than the pane
  gets the pan bar. `test/narrow-audit.test.ts` holds every component to it.
- **A picture's frame says what it is.** If the terminal does not draw the picture (a phone app that reports no cell size, or a second
  client attached to the same herdr), the frame is no longer an empty box: it names the picture and its size.
- **`/openui-events`** records what a tap, a swipe or a flick sends to a widget, for five minutes, so what your terminal app really
  does can be read instead of guessed. It never records what you type.
- **The agent is told the terminal may be narrow.** The reference `render_widget` returns says a phone is about 60 columns, that
  wide blocks scroll under a bar, and when to pin a Table's columns.
- **A tap right after a sideways flick works.** pi-tui does not understand horizontal wheel events and leaves a press unreleased,
  which made the next tap do nothing; the widget now recognises that tap itself.

## 0.2.0 (2026-11-02)

- **`Choice` takes several answers and an Other answer, and sends them together.** `Choice(question, options, hint, multiple, other)`.
  `multiple: true` lets you pick several options (square checkboxes and the tag `Choose all that apply`; a single question has
  round indicators and `Choose one`). `other` is on by default and adds an **Other...** row: it opens pi's own editor (Enter saves,
  Shift+Enter adds a line, Esc cancels) and the text shows under the row. Write `null` for each skipped argument before `multiple`
  or `other`; a wrong one is a validation error that gives the argument's position and an example.
- **A click on a Choice no longer sends anything.** It stages the answer. A bar under the widget, `N of M answered  [ Send answers ]
  [ Clear ]`, sends the answers of every Choice in the widget (also those on tabs nobody opened) as ONE message and locks the
  widget. The buttons stack on a narrow terminal. A Choice written for the old behaviour keeps working, now with an Other row and the
  bar (write `other: false` for a closed list), unless it breaks one of the new limits. Answers live in memory with the widget, so a
  widget redrawn from a resumed session opens unanswered.
- **The message.** One question that takes one answer, answered with an option, still sends the line `<question> — <option>`.
  Anything else is a numbered list that starts ``Answers to the questions in widget `Title` (3):``, with `(no answer)` for a skipped
  question and `other:` for typed text. The words the agent wrote are cleaned (control and invisible characters removed, whitespace
  collapsed, `@file:` and similar written `(at)file:`), and a question that would start the message like a command (`/new session?`)
  uses the list. Your own Other text is sent as you typed it, except for control characters: a tab becomes a space and a run of
  blank lines becomes one.
- **Delivery.** The bar says `Sending to the agent…` until pi reports the message, then `Sent to the agent.` If pi does not take it
  within 3 seconds (no model selected, no credentials) and is not holding one for the end of the agent's turn, the widget is given
  back with your answers and a notice, and Send answers works again once what pi complained about is fixed. After Send the widget
  gives the keyboard back to pi.
- **Layout and keys.** Options are always one per row (the old layout with every option on one line is gone). The whole row is the
  click target, and a long option wraps under its indicator. Down from the last option reaches Send answers, never Clear. After
  Clear the focus moves to the first option, and Enter never presses an element other than the focused one. In notes mode the
  options and the bar do nothing.
- **New limits**, listed in the model's reference and in docs/components/README.md: 12 Choices per widget, 6 options, a question of
  at most 200 characters, an option of at most 120, an Other answer of at most 500. An empty question or option is an error too.
  Over a limit is a validation error with the number in it.
- **The model is told.** The `render_widget` description and guideline now say that a Button click arrives as the next message and
  that Choice answers arrive together after Send answers, so the model asks all its questions in one widget. The model's reference
  grows by about 190 tokens. New sample: `/openui-gallery choice`.
- **Rows with emoji stay aligned across pi upgrades.** The two-cell character table (`src/diagram/wide.ts`) was a snapshot of one pi.
  pi 1.4.0 draws a few newer emoji (U+1F6D9, U+1FA8B-1FA8D, U+1FACC, U+1FADD, U+1FAEB, U+1FAF9-1FAFA) two cells wide, so borders
  slid on rows that contain them. The extension now asks the running pi about the blocks where emoji are added (U+2190-2BFF,
  U+1F000-1FFFF, about 11 ms) when it loads, and the table is regenerated for pi 1.4.0 (`npm run width`).

## 0.1.2 (2026-10-31)

- Fixed borders drawn out of line on rows with wide characters. The terminal draws emoji and many symbols (✅ ❌ ⚡ 🚀 ⭐ ☕
  and about 8,800 more) two cells wide, and the widgets counted them as one, so everything to their right on that row, and the
  right border, slid by a cell. The widgets now measure with the same table pi uses. The `storage` icon of an InfraNode was one
  of these characters (U+2630); it is now ⊟.
- The README now says what to do when the widget does not appear because pi-compact-tools collapses the tool call into a
  "Called render_widget" row: exclude `render_widget` in its config. Nothing changes in the extension.

## 0.1.1 (2026-10-30)

- The README now renders on pi.dev and npm: screenshots are markdown images (pi.dev drops raw HTML tables and images) and
  links to the documentation are absolute (pi.dev rewrote the relative ones to a CDN copy of the package, which has no `docs/`).
  Nothing changes in the extension.

## 0.1.0 (2026-10-30)

- **Notes.** Pin a comment to a table cell, node, slice, point or paragraph; the notes go into pi's message box as one numbered
  message, never straight to the agent. `/openui-notes`, a `[ notes ]` chip under every widget that has something to note, pins
  and a tray. Mouse and keyboard (Tab to `[ Add ... ]`, or Down from a note, then Enter). Words from the widget are cleaned
  before they reach the message. See docs/interaction.md.
- **Pictures in Markdown.** A line that is only `![alt](path "caption")` draws a picture, in Markdown and in FAQ answers, through
  the same code as `Image`. A missing file or a web URL is an error the assistant is told about.
- **Size limits** for every list and string, as validation errors with the number in them, listed in the model's reference and in
  docs/components/README.md. `compile()` can no longer throw. At most 12 pictures per widget.
- **Cheaper to draw.** An unchanged widget costs nothing per frame (it was 8 ms for 17 widgets); layouts are kept per width;
  terminal cells are shared and frozen (300 widgets: 47 MB down to 17 MB); wire routing shares a work budget (a 120-node
  infrastructure map no longer freezes pi for 5 s); the picture cache is bounded by bytes; session state is dropped at shutdown.
- The last column of every line is left empty, because pi's scrollbar is painted over it. It cut the `]` off the notes chip.
- MIT license.
- Installable with `pi install git:...`: a `pi` manifest and peer dependencies in `package.json`. See docs/releasing.md.
- Fixed: an armed widget kept Enter after "Add to message", so the Enter meant to send the message would have pressed a widget
  element.

### First version

- `render_widget` tool and the commands `/openui-gallery`, `/openui-file` and `/openui-focus`.
- 23 components: Stack, Text, Card, Callout, Metric, Table, Tabs, Button, Choice, Faq, Markdown, CodeBlock, Image, BarChart,
  LineChart, AreaChart, PieChart, RadarChart, GeoMap, Dag, Erd, InfraMap, SequenceDiagram, plus Tooltip.
- Mouse and keyboard interaction, a hover bubble, tooltip panels, a copy button, sideways scrolling for wide diagrams.
- Tooltips on Dag, Erd, InfraMap, SequenceDiagram, Table, Metric, BarChart, LineChart, AreaChart, PieChart, RadarChart, GeoMap
  and Image, marked with a `◆`. A target that matches nothing is a validation error that lists the valid ones.
- Pictures through pi-tui's image support (Kitty protocol), framed, with tooltips and a labelled fallback.
- ERD relation ends are one cell each: `├ ┤ ┬ ┴` for one and `< > Λ V` for many.
- Every glyph is audited against JetBrains Mono Nerd Font Mono.
- Generated component pages with screenshots (`docs/components/`), checked by the tests.
