# Changelog

## Unreleased

- **Choice takes several answers and an Other answer, and sends them together.** `Choice(question, options, hint, multiple, other)`.
  `multiple: true` lets you pick several options (square checkboxes, tag `Choose all that apply`; a single question has round
  indicators and `Choose one`). `other` is on by default and adds an **Other...** row: it opens pi's own editor (Enter saves,
  Shift+Enter adds a line, Esc cancels), and the text shows under the row. Write `null` for a skipped argument before `multiple`
  or `other`; the validator says so, with an example, when a Choice is written wrong.
- **A click on a Choice no longer sends anything.** It stages the answer. A bar under the widget, `N of M answered  [ Send answers ]
  [ Clear ]`, sends the answers of every Choice in the widget (also on tabs nobody opened) as ONE message, then locks them and says
  `Sent to the agent.` One question that takes one answer, answered with an option, still sends the line `<question> — <option>`;
  anything else is a numbered list, with `(no answer)` for a skipped question and `other:` for typed text. Down from the last
  option reaches Send answers, never Clear. In notes mode the options and the bar do nothing. Answers are kept in memory with the
  widget, like notes. A Choice written for the old behaviour keeps working, unless it breaks one of the new limits below (that
  is a validation error), but now has an Other row and the bar: write `other: false` for a closed list. A widget redrawn from a resumed
  session opens unanswered.
- The words the agent wrote in a Choice are cleaned before they go out (control and invisible characters removed, whitespace
  collapsed, `@file:` and similar written `(at)file:`), and a question that would start the message like a command (`/new
  session?`) uses the numbered list. The user's own Other text is sent as typed, apart from control characters.
- Options are always one per row, so the old layout with all options on one line is gone. The whole row is the click target, and a
  long option wraps under its indicator, so everything that is sent is on screen. An empty question or option is a validation error.
- Send answers sends the answers as they are at the moment it is pressed, and the bar's buttons stack on a narrow terminal instead of
  being cut off. A wrong `multiple` or `other` is a validation error that gives the argument's position and an example. A tab typed
  in Other is a space and a run of blank lines is one.
- The message starts `Answers to the questions in widget \`Title\` (3):`, with the widget's name in backticks as in hermes-openui.
- The widget says `Sending to the agent…` until pi reports the message, then `Sent to the agent.` pi's `sendUserMessage` returns nothing and
  hides its failures, so earlier a pi with no model or no credentials left the widget locked and reading Sent. Now, if pi has not taken
  the message after 3 seconds (and is not holding one for the end of the agent's turn), the widget is given back with its answers and a
  notice, and Send answers works again once what pi complained about is fixed.
- Rows with emoji stay aligned across pi upgrades. The two-cell character table (`src/diagram/wide.ts`) was a snapshot of one pi, and a
  newer Unicode release (pi 1.4.0 adds U+1F6D9, U+1FA8B-1FA8D, U+1FACC, U+1FADD, U+1FAEB, U+1FAF9-1FAFA) made borders slide on
  rows that contain them. The extension now asks the running pi about the blocks where emoji are added (U+2190-2BFF, U+1F000-1FFFF,
  about 11 ms) when it loads. `test/width.test.ts` warns about a snapshot that is a release behind instead of failing, and checks that
  after the correction we agree with pi on every character. The table is regenerated for pi 1.4.0 (`npm run width`).
- After Send answers the widget gives the keyboard back to pi. After Clear the focus moves to the first option. A focus that points at
  an element that is gone is dropped, and Enter then does nothing: it never presses some other element of the widget.
- New limits, listed in the model's reference and in docs/components/README.md: 12 Choices per widget, a question of at most 200
  characters, an option of at most 120, an Other answer of at most 500. Over a limit is a validation error with the number in it.
- The `render_widget` description and the guideline now say that a Button click arrives as the next message and that the answers to
  Choices arrive together after Send answers, so the model asks all its questions in one widget. The model's reference grows by
  about 190 tokens.
- New sample, `/openui-gallery choice`, and new screenshots for the Choice page and docs/interaction.md.
- The end-to-end script `test/e2e/interactive.py` now covers staging, Send answers and the Other editor in a real pi.

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
