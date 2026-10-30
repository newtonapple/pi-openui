# Changelog

## Unreleased

First version.

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
