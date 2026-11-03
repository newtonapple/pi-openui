# pi-openui

Interactive dashboards, charts, diagrams and maps in the terminal, for the [pi](https://github.com/earendil-works/pi)
coding agent. The agent writes a few lines of OpenUI Lang. pi draws a widget you can click or drive with the keyboard.

It uses unicode characters, and real pictures where the terminal can show them. There is no browser, no HTML, no runtime
dependency and no network access.

![Dashboards, diagrams with tooltips, an infrastructure map, a picture in a frame, and notes pinned on a table and on a graph](https://raw.githubusercontent.com/newtonapple/pi-openui/main/docs/screenshots/hero.png)

*Screenshots are drawn by `npm run screenshots` from the widget's real output, with pi's dark theme and JetBrains Mono.*

## What you get

- **One tool, `render_widget`.** The agent calls it with OpenUI Lang. Mistakes come back as a list of errors with line
  numbers, so it fixes them and tries again. After a successful draw it says one short sentence.
- **23 components.** Layout and text, metric tiles, tables, tabs, buttons and choices, FAQ, markdown, code with
  highlighting and a copy button, images, bar, line, area, pie and radar charts, a world map, and four diagram types
  (DAG, ER, infrastructure map, sequence). See the [component gallery](https://github.com/newtonapple/pi-openui/blob/main/docs/components/README.md).
- **Interaction.** Click, or use Tab, the arrow keys, Enter and Esc. A button sends text to the agent as your next message.
  See [docs/interaction.md](https://github.com/newtonapple/pi-openui/blob/main/docs/interaction.md).
- **Questions.** A `Choice` asks you something with a list of options. A click only stages your answer; a `[ Send answers ]`
  bar under the widget sends every answer of the widget as one message. A question can allow several options, and every
  question has an **Other...** row where you type your own answer in pi's editor. See
  [Choice](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Choice.md).
- **Notes.** Pin a comment to a table cell, a graph node or a pie slice, then send all of them to the agent as one numbered
  message. You read and edit the message before it goes. See [Notes](#notes).
- **Tooltips.** An element with a tooltip shows a small `◆`. Hover for a hint bubble, click or press Enter for a panel with
  detail, code and a link. See [Tooltip](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Tooltip.md).
- **Pictures.** An `Image` draws the real picture in terminals that speak the Kitty graphics protocol, inside a frame that
  can carry a tooltip. A line of Markdown that is only a picture, `![alt](path "caption")`, is drawn the same way, so a
  README-style view is one `Markdown`. See [Image](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Image.md) and [Markdown](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Markdown.md).
- **Robust diagrams.** Every graph, schema and map is routed on a character grid with one wire per edge. The tests decode
  the finished picture back into its edges and compare them with the input. See [docs/diagrams.md](https://github.com/newtonapple/pi-openui/blob/main/docs/diagrams.md).

## Install

```sh
pi install npm:pi-openui
```

That is all. There is nothing to build, and no dependencies to fetch: pi supplies the packages the extension imports. Start pi
and run `/openui-gallery`. It needs pi 1.4 or newer.

| What | Command |
|---|---|
| Install from npm | `pi install npm:pi-openui` |
| Install one version | `pi install npm:pi-openui@0.1.0` |
| Install from GitHub instead | `pi install git:github.com/newtonapple/pi-openui` (add `@v0.1.0` to pin a tag) |
| Try it for one session | `pi -e npm:pi-openui` |
| Install from a clone | `pi install /path/to/pi-openui` |
| See what is installed | `pi list` |
| Update | `pi update --extensions` |
| Remove | `pi remove npm:pi-openui` |

It is in pi's [package catalog](https://pi.dev/packages), which lists npm packages that carry the `pi-package` keyword. After an
update pi shows this package's [changelog](CHANGELOG.md). Maintainers: see [docs/releasing.md](https://github.com/newtonapple/pi-openui/blob/main/docs/releasing.md).

## Use it

| What | How |
|---|---|
| Let the agent draw | Ask for a dashboard, a chart, a diagram, a table. It calls `render_widget`. |
| One example of every component | `/openui-gallery`, or one kind: `/openui-gallery dag`, `erd`, `infra`, `sequence`, `geo`, `pie`, `line`, `image`, `table`, `tabs`, `markdown`, `choice` |
| Draw a file | `/openui-file path/to/widget.oui` |
| Use the keyboard without the mouse | `/openui-focus` |
| Write notes on a widget | Click `[ notes ]` under it, or `/openui-notes` |

Gallery clicks are echoed locally and cost nothing. In a widget the agent drew, a Button click is sent to the agent as your
next message, and the answers to its Choices are sent together, as one message, when you press **Send answers**.

The mouse needs pi's default fullscreen mode. Everything also works from the keyboard.

## Notes

Pin a comment to one part of a widget, then send all your comments to the agent as a single message. Use it to say "this row
is wrong" or "explain this node" without describing where it is.

![A note pinned on a graph node, with the tray under the graph](https://raw.githubusercontent.com/newtonapple/pi-openui/main/docs/screenshots/notes-dag.png)

1. Click `[ notes ]` under a widget, or run `/openui-notes`.
2. Click a cell, node, slice or paragraph, or Tab to it and press Enter. pi's own editor opens. Type, press Enter.
3. Click `[ Add 2 notes to your message ]`, or Tab to it and press Enter. The notes land in pi's message box as a numbered list.
4. Read it, edit it, press Enter. Nothing is sent before that.

Each note names its target the way the agent wrote it, for example `tbl` (Table) > row 3, column `State`, so the agent can find
the line in its own source and answer by number. Words that come from the widget are cleaned before they reach your message,
so a widget cannot slip an `@file` reference or a code span into something you are about to send.

A widget holds 20 notes. They live in memory and are gone when the session ends. Keys, what each component lets you pick, and
the details are in [docs/interaction.md](https://github.com/newtonapple/pi-openui/blob/main/docs/interaction.md#notes).

## Components

![Eight of the components: Table, LineChart, PieChart, GeoMap, Erd, SequenceDiagram, CodeBlock, RadarChart](https://raw.githubusercontent.com/newtonapple/pi-openui/main/docs/screenshots/components.png)

All 23, with signatures, every argument, a checked example and tips: **[docs/components/](https://github.com/newtonapple/pi-openui/blob/main/docs/components/README.md)**.

| Group | Components |
|---|---|
| Layout and text | [Stack](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Stack.md), [Text](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Text.md), [Card](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Card.md), [Callout](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Callout.md) |
| Data | [Metric](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Metric.md), [Table](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Table.md) |
| Interactive | [Tabs](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Tabs.md), [Button](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Button.md), [Choice](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Choice.md), [Faq](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Faq.md) |
| Rich content | [Markdown](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Markdown.md), [CodeBlock](https://github.com/newtonapple/pi-openui/blob/main/docs/components/CodeBlock.md), [Image](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Image.md) |
| Charts | [BarChart](https://github.com/newtonapple/pi-openui/blob/main/docs/components/BarChart.md), [LineChart](https://github.com/newtonapple/pi-openui/blob/main/docs/components/LineChart.md), [AreaChart](https://github.com/newtonapple/pi-openui/blob/main/docs/components/AreaChart.md), [PieChart](https://github.com/newtonapple/pi-openui/blob/main/docs/components/PieChart.md), [RadarChart](https://github.com/newtonapple/pi-openui/blob/main/docs/components/RadarChart.md) |
| Diagrams and maps | [Dag](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Dag.md), [Erd](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Erd.md), [InfraMap](https://github.com/newtonapple/pi-openui/blob/main/docs/components/InfraMap.md), [SequenceDiagram](https://github.com/newtonapple/pi-openui/blob/main/docs/components/SequenceDiagram.md), [GeoMap](https://github.com/newtonapple/pi-openui/blob/main/docs/components/GeoMap.md) |

[Tooltip](https://github.com/newtonapple/pi-openui/blob/main/docs/components/Tooltip.md) attaches to Dag, Erd, InfraMap, SequenceDiagram, Table, Metric, BarChart,
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

More in [docs/design.md](https://github.com/newtonapple/pi-openui/blob/main/docs/design.md).

## Requirements

- pi 1.4 or newer.
- Node 22.18 or newer for the tests and scripts (they run TypeScript directly). Developed on Node 26.
- A terminal font with the glyphs the widgets use. They were chosen from, and are tested against, JetBrains Mono Nerd Font
  Mono. A different font works if it has them: `PI_OPENUI_FONT=/path/to/font.ttf npm test` checks yours.
- Pictures need a terminal that supports the Kitty graphics protocol. Other terminals get a framed placeholder.

## If the widget does not appear

You see a collapsed `Called render_widget ... + Show details` row and no widget, and the model says the widget was drawn. Another
extension is drawing the tool call in place of this one. [pi-compact-tools](https://www.npmjs.com/package/pi-compact-tools) does
this to every tool by default. Tell it to leave `render_widget` alone in `~/.pi/agent/compact-tools.json`, then run `/reload`:

```json
{ "custom_tools": { "exclude": ["render_widget"] } }
```

## Development

Working on the code? Start pi in this folder instead of installing it: `.pi/extensions/openui.ts` loads the extension (pi asks
once whether to trust the folder). To load it from somewhere else for one session:

```sh
pi -e /path/to/pi-openui/.pi/extensions/openui.ts
```

After you change the code, run `/reload` in pi. The rest:

```sh
npm test                 # a few seconds, no network, no model calls
npm run docs             # regenerate docs/components/ from the signature table
npm run screenshots      # regenerate docs/screenshots/, and the two README composites (needs Python with Pillow, and the font)
npm run gallery          # print every component to the terminal (-- --plain for no colour)
make help                # the release process (check, version, publish, tag, push)
```

Tests are described in [docs/testing.md](https://github.com/newtonapple/pi-openui/blob/main/docs/testing.md). Releases are described in [docs/releasing.md](https://github.com/newtonapple/pi-openui/blob/main/docs/releasing.md).
Contributors and agents working in this repository should read [AGENTS.md](https://github.com/newtonapple/pi-openui/blob/main/AGENTS.md).

## Limits

- Hover needs a terminal that reports mouse movement. The keyboard covers everything else.
- Only Kitty-protocol terminals show pictures. A tooltip attaches to a whole picture, not to a spot inside it.
- Dense graphs of 11 or more nodes can be wider than the terminal. They scroll sideways, and moving focus scrolls the node
  into view.
- The map uses 110m coastlines: country scale, not city scale.
- Widgets are not saved anywhere but pi's own session. A resumed session redraws them from the tool results. Notes are not
  saved at all.
- A widget has size limits (100 KB of source, 100 table rows, 60 graph nodes, 30 map nodes, and so on). Over a limit the
  agent gets an error with the number and fixes it. They keep pi fast: it draws every widget on every frame. See the
  [list](https://github.com/newtonapple/pi-openui/blob/main/docs/components/README.md#size-limits).

## License

[MIT](LICENSE).
