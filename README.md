# pi-openui

Interactive dashboards, charts, diagrams and maps in the terminal, for the [pi](https://github.com/earendil-works/pi)
coding agent. The agent writes a few lines of OpenUI Lang. pi draws a widget you can click or drive with the keyboard.

It uses unicode characters, and real pictures where the terminal can show them. There is no browser, no HTML, no runtime
dependency and no network access.

<table>
<tr>
<td valign="top"><img src="docs/screenshots/dashboard.png" width="440" alt="A dashboard: three metric tiles, a bar chart and a button"></td>
<td valign="top"><img src="docs/screenshots/dag-tooltip.png" width="360" alt="A CI pipeline graph with a focused node, a hint bubble and its tooltip panel"></td>
</tr>
<tr>
<td valign="top"><img src="docs/screenshots/infra.png" width="440" alt="An infrastructure map with three zones"></td>
<td valign="top"><img src="docs/screenshots/image-tooltip.png" width="360" alt="A picture in a frame with a tooltip bubble"></td>
</tr>
</table>

<sub>Screenshots are drawn by `npm run screenshots` from the widget's real output, with pi's dark theme and JetBrains Mono.</sub>

## What you get

- **One tool, `render_widget`.** The agent calls it with OpenUI Lang. Mistakes come back as a list of errors with line
  numbers, so it fixes them and tries again. After a successful draw it says one short sentence.
- **23 components.** Layout and text, metric tiles, tables, tabs, buttons and choices, FAQ, markdown, code with
  highlighting and a copy button, images, bar, line, area, pie and radar charts, a world map, and four diagram types
  (DAG, ER, infrastructure map, sequence). See the [component gallery](docs/components/README.md).
- **Interaction.** Click, or use Tab, the arrow keys, Enter and Esc. A button or a choice sends text to the agent as your next
  message. See [docs/interaction.md](docs/interaction.md).
- **Tooltips.** An element with a tooltip shows a small `◆`. Hover for a hint bubble, click or press Enter for a panel with
  detail, code and a link. See [Tooltip](docs/components/Tooltip.md).
- **Pictures.** An `Image` draws the real picture in terminals that speak the Kitty graphics protocol, inside a frame that
  can carry a tooltip. See [Image](docs/components/Image.md).
- **Robust diagrams.** Every graph, schema and map is routed on a character grid with one wire per edge. The tests decode
  the finished picture back into its edges and compare them with the input. See [docs/diagrams.md](docs/diagrams.md).

## Try it

The extension is `.pi/extensions/openui.ts`. Start pi in this folder (pi asks once whether to trust it), or load it from
anywhere:

```sh
pi -e /path/to/pi-openui/.pi/extensions/openui.ts
```

After you change the code, run `/reload` in pi.

| What | How |
|---|---|
| Let the agent draw | Ask for a dashboard, a chart, a diagram, a table. It calls `render_widget`. |
| One example of every component | `/openui-gallery`, or one kind: `/openui-gallery dag`, `erd`, `infra`, `sequence`, `geo`, `pie`, `line`, `image`, `table`, `tabs`, `markdown` |
| Draw a file | `/openui-file path/to/widget.oui` |
| Use the keyboard without the mouse | `/openui-focus` |

Gallery clicks are echoed locally and cost nothing. In a widget the agent drew, a Button or Choice click is sent to the
agent as your next message.

The mouse needs pi's default fullscreen mode. Everything also works from the keyboard.

## Components

<table>
<tr>
<td valign="top" width="25%"><a href="docs/components/Table.md"><img src="docs/screenshots/table.png" width="200" alt="Table"></a><br><sub>Table</sub></td>
<td valign="top" width="25%"><a href="docs/components/LineChart.md"><img src="docs/screenshots/line.png" width="200" alt="LineChart"></a><br><sub>LineChart</sub></td>
<td valign="top" width="25%"><a href="docs/components/PieChart.md"><img src="docs/screenshots/pie.png" width="200" alt="PieChart"></a><br><sub>PieChart</sub></td>
<td valign="top" width="25%"><a href="docs/components/GeoMap.md"><img src="docs/screenshots/geo.png" width="200" alt="GeoMap"></a><br><sub>GeoMap</sub></td>
</tr>
<tr>
<td valign="top"><a href="docs/components/Erd.md"><img src="docs/screenshots/erd.png" width="200" alt="Erd"></a><br><sub>Erd</sub></td>
<td valign="top"><a href="docs/components/SequenceDiagram.md"><img src="docs/screenshots/sequence.png" width="200" alt="SequenceDiagram"></a><br><sub>SequenceDiagram</sub></td>
<td valign="top"><a href="docs/components/CodeBlock.md"><img src="docs/screenshots/code.png" width="200" alt="CodeBlock"></a><br><sub>CodeBlock</sub></td>
<td valign="top"><a href="docs/components/RadarChart.md"><img src="docs/screenshots/radar.png" width="200" alt="RadarChart"></a><br><sub>RadarChart</sub></td>
</tr>
</table>

All 23, with signatures, every argument, a checked example and tips: **[docs/components/](docs/components/README.md)**.

| Group | Components |
|---|---|
| Layout and text | [Stack](docs/components/Stack.md), [Text](docs/components/Text.md), [Card](docs/components/Card.md), [Callout](docs/components/Callout.md) |
| Data | [Metric](docs/components/Metric.md), [Table](docs/components/Table.md) |
| Interactive | [Tabs](docs/components/Tabs.md), [Button](docs/components/Button.md), [Choice](docs/components/Choice.md), [Faq](docs/components/Faq.md) |
| Rich content | [Markdown](docs/components/Markdown.md), [CodeBlock](docs/components/CodeBlock.md), [Image](docs/components/Image.md) |
| Charts | [BarChart](docs/components/BarChart.md), [LineChart](docs/components/LineChart.md), [AreaChart](docs/components/AreaChart.md), [PieChart](docs/components/PieChart.md), [RadarChart](docs/components/RadarChart.md) |
| Diagrams and maps | [Dag](docs/components/Dag.md), [Erd](docs/components/Erd.md), [InfraMap](docs/components/InfraMap.md), [SequenceDiagram](docs/components/SequenceDiagram.md), [GeoMap](docs/components/GeoMap.md) |

[Tooltip](docs/components/Tooltip.md) attaches to Dag, Erd, InfraMap, SequenceDiagram, Table, Metric, BarChart,
LineChart, AreaChart, PieChart, RadarChart, GeoMap and Image.

## How it works

```
OpenUI Lang --parse--> typed tree --render--> blocks (rows of cells + click targets) --> pi-tui lines
                                                     ^                                       |
                                       interaction logic: hit test, keys, panning   <-- mouse and keys
```

- `src/lang/` parses and validates OpenUI Lang with one table of component signatures. The same table writes the reference the
  agent reads and the docs pages you see here.
- `src/blocks/` turns each component into a grid of styled cells plus the places you can click.
- `src/diagram/` is the layout and routing engine for Dag, Erd and InfraMap.
- `src/pi/` is the pi extension: the tool, the commands, the themed component, mouse and keyboard handling, pictures.

More in [docs/design.md](docs/design.md).

## Requirements

- pi 1.4 or newer.
- Node 22.18 or newer for the tests and scripts (they run TypeScript directly). Developed on Node 26.
- A terminal font with the glyphs the widgets use. They were chosen from, and are tested against, JetBrains Mono Nerd Font
  Mono. A different font works if it has them: `PI_OPENUI_FONT=/path/to/font.ttf npm test` checks yours.
- Pictures need a terminal that supports the Kitty graphics protocol. Other terminals get a framed placeholder.

## Development

```sh
npm test                 # about 5 seconds, no network, no model calls
npm run docs             # regenerate docs/components/ from the signature table
npm run screenshots      # regenerate docs/screenshots/ (needs Python with Pillow, and the font)
npm run gallery          # print every component to the terminal (-- --plain for no colour)
```

Tests are described in [docs/testing.md](docs/testing.md). Contributors and agents working in this repository should read
[AGENTS.md](AGENTS.md).

## Limits

- Hover needs a terminal that reports mouse movement. The keyboard covers everything else.
- Only Kitty-protocol terminals show pictures. A tooltip attaches to a whole picture, not to a spot inside it.
- Dense graphs of 11 or more nodes can be wider than the terminal. They scroll sideways, and moving focus scrolls the node
  into view.
- The map uses 110m coastlines: country scale, not city scale.
- Widgets are not saved anywhere but pi's own session. A resumed session redraws them from the tool results.

## License

Not chosen yet.
