# Components

Every component the assistant can draw. Each page shows what it looks like, its signature, every argument, an example that is checked by the test suite, and the interactions it supports.

A widget is written in OpenUI Lang: one `name = Component(...)` per line, positional arguments only, `root = Stack([...])` first. The assistant gets the full reference from `render_widget` with `reference=true`.

## Layout and text

<table>
<tr>
<td valign="top" width="33%"><a href="Stack.md"><img src="../screenshots/stack.png" width="300" alt="Stack"></a><br><b><a href="Stack.md">Stack</a></b><br><sub>Lays its children out in a column (the default) or a row</sub></td>
<td valign="top" width="33%"><a href="Text.md"><img src="../screenshots/text.png" width="300" alt="Text"></a><br><b><a href="Text.md">Text</a></b><br><sub>A line or paragraph of text</sub></td>
<td valign="top" width="33%"><a href="Card.md"><img src="../screenshots/card.png" width="300" alt="Card"></a><br><b><a href="Card.md">Card</a></b><br><sub>A bordered panel with an optional title in the top border</sub></td>
</tr>
<tr>
<td valign="top" width="33%"><a href="Callout.md"><img src="../screenshots/callout.png" width="300" alt="Callout"></a><br><b><a href="Callout.md">Callout</a></b><br><sub>A highlighted note with an icon: information, success, a warning or an error</sub></td>
<td></td>
<td></td>
</tr>
</table>

## Data

<table>
<tr>
<td valign="top" width="33%"><a href="Metric.md"><img src="../screenshots/metric.png" width="300" alt="Metric"></a><br><b><a href="Metric.md">Metric</a></b><br><sub>A KPI tile: a label, a big value and an optional change line coloured by tone</sub></td>
<td valign="top" width="33%"><a href="Table.md"><img src="../screenshots/table.png" width="300" alt="Table"></a><br><b><a href="Table.md">Table</a></b><br><sub>A table with a header row</sub></td>
<td></td>
</tr>
</table>

## Interactive

<table>
<tr>
<td valign="top" width="33%"><a href="Tabs.md"><img src="../screenshots/tabs.png" width="300" alt="Tabs"></a><br><b><a href="Tabs.md">Tabs</a></b><br><sub>A strip of tab labels over the content of the selected tab</sub></td>
<td valign="top" width="33%"><a href="Button.md"><img src="../screenshots/button.png" width="300" alt="Button"></a><br><b><a href="Button.md">Button</a></b><br><sub>A clickable button that sends text to the assistant as your next message</sub></td>
<td valign="top" width="33%"><a href="Choice.md"><img src="../screenshots/choice.png" width="300" alt="Choice"></a><br><b><a href="Choice.md">Choice</a></b><br><sub>A question with clickable options for you to answer</sub></td>
</tr>
<tr>
<td valign="top" width="33%"><a href="Faq.md"><img src="../screenshots/faq.png" width="300" alt="Faq"></a><br><b><a href="Faq.md">Faq</a></b><br><sub>A list of questions that expand to show their answers</sub></td>
<td></td>
<td></td>
</tr>
</table>

## Rich content

<table>
<tr>
<td valign="top" width="33%"><a href="Markdown.md"><img src="../screenshots/markdown.png" width="300" alt="Markdown"></a><br><b><a href="Markdown.md">Markdown</a></b><br><sub>Formatted text from a markdown string</sub></td>
<td valign="top" width="33%"><a href="CodeBlock.md"><img src="../screenshots/code.png" width="300" alt="CodeBlock"></a><br><b><a href="CodeBlock.md">CodeBlock</a></b><br><sub>Syntax-highlighted code in a frame, with a copy button</sub></td>
<td valign="top" width="33%"><a href="Image.md"><img src="../screenshots/image.png" width="300" alt="Image"></a><br><b><a href="Image.md">Image</a></b><br><sub>A picture, drawn for real in terminals that support images, framed, with an optional caption and tooltip</sub></td>
</tr>
</table>

## Charts

<table>
<tr>
<td valign="top" width="33%"><a href="BarChart.md"><img src="../screenshots/bar.png" width="300" alt="BarChart"></a><br><b><a href="BarChart.md">BarChart</a></b><br><sub>Bars for one series of categories</sub></td>
<td valign="top" width="33%"><a href="LineChart.md"><img src="../screenshots/line.png" width="300" alt="LineChart"></a><br><b><a href="LineChart.md">LineChart</a></b><br><sub>Lines over categories, one per series, drawn with braille dots</sub></td>
<td valign="top" width="33%"><a href="AreaChart.md"><img src="../screenshots/area.png" width="300" alt="AreaChart"></a><br><b><a href="AreaChart.md">AreaChart</a></b><br><sub>Like LineChart, but the series are stacked and filled, so it shows parts of a growing total</sub></td>
</tr>
<tr>
<td valign="top" width="33%"><a href="PieChart.md"><img src="../screenshots/pie.png" width="300" alt="PieChart"></a><br><b><a href="PieChart.md">PieChart</a></b><br><sub>Parts of a whole as a coloured disc with a legend that shows each value and share</sub></td>
<td valign="top" width="33%"><a href="RadarChart.md"><img src="../screenshots/radar.png" width="300" alt="RadarChart"></a><br><b><a href="RadarChart.md">RadarChart</a></b><br><sub>One axis per metric, one polygon per series: comparing entities across several measures</sub></td>
<td></td>
</tr>
</table>

## Diagrams and maps

<table>
<tr>
<td valign="top" width="33%"><a href="GeoMap.md"><img src="../screenshots/geo.png" width="300" alt="GeoMap"></a><br><b><a href="GeoMap.md">GeoMap</a></b><br><sub>An offline world map zoomed to fit your pins, with optional dashed links</sub></td>
<td valign="top" width="33%"><a href="Dag.md"><img src="../screenshots/dag.png" width="300" alt="Dag"></a><br><b><a href="Dag.md">Dag</a></b><br><sub>A directed graph with an automatic layered layout, for pipelines, task graphs and dependencies</sub></td>
<td valign="top" width="33%"><a href="Erd.md"><img src="../screenshots/erd.png" width="300" alt="Erd"></a><br><b><a href="Erd.md">Erd</a></b><br><sub>An entity-relationship diagram: tables with their columns, and relations with one-or-many ends</sub></td>
</tr>
<tr>
<td valign="top" width="33%"><a href="InfraMap.md"><img src="../screenshots/infra.png" width="300" alt="InfraMap"></a><br><b><a href="InfraMap.md">InfraMap</a></b><br><sub>Zones holding nodes (servers, databases, queues), with labelled arrows showing which talks to which</sub></td>
<td valign="top" width="33%"><a href="SequenceDiagram.md"><img src="../screenshots/sequence.png" width="300" alt="SequenceDiagram"></a><br><b><a href="SequenceDiagram.md">SequenceDiagram</a></b><br><sub>Calls between participants: columns left to right, steps top to bottom, with notes and alt/loop frames</sub></td>
<td></td>
</tr>
</table>

## Used by every host

[Tooltip](Tooltip.md): A hint and an optional detail panel for one element of a host component.

## Size limits

A widget over a limit is not drawn, and the error names the limit and the line, so the assistant can shrink it. The limits keep every redraw cheap: pi draws all widgets on every frame, and a terminal shows about one screen anyway. Each component page repeats its own.

| What | Limit |
|---|---|
| The whole source | 100 KB |
| Components in one widget | 1500 |
| Nesting | 16 levels |
| Children of a Stack, Card or tab | 40 |
| Tabs | 12 |
| A string | 2000 characters (Text 8000, Markdown and CodeBlock 30000, a table cell 300) |
| Table | 100 rows by 16 columns |
| BarChart | 40 bars |
| LineChart, AreaChart | 200 points, 8 series |
| RadarChart | 16 axes, 8 series |
| Dag | 60 nodes, 150 edges |
| Erd | 20 entities, 30 fields each, 40 relations |
| InfraMap | 30 nodes, 45 links, 8 zones |
| SequenceDiagram | 100 steps, 10 participants |
| GeoMap | 100 points, 60 links |
| Faq | 30 items |
| Pictures | 12 (Image components and markdown picture lines together) |
| CodeBlock | 400 lines |
| Rows drawn | 1500 (the rest is cut and the widget says so) |
