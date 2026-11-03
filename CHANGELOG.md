# Changelog

## Unreleased

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
