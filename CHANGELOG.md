# Changelog

## Unreleased

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
