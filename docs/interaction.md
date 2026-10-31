# Interaction

Widgets respond to the mouse and to the keyboard. Both do the same things, and neither gets in the way of typing in pi.

## The two modes of a widget

A widget is **idle** until you click it, or run `/openui-focus`. Then it is **armed**: a bar appears at its left edge and a
hint line above pi's editor lists the keys. While a widget is idle nothing you type is affected.

Pressing Esc leaves it. So does typing: any letter, digit, space or pasted text hands the keyboard straight back to pi's
editor, so Enter sends your message and does not fire the focused button.

## Mouse

Pi's fullscreen mode (the default) reports the mouse.

| You do | What happens |
|---|---|
| Hover an element | It is underlined (boxes and frames turn bold and accent-coloured). If it has a tooltip, a bubble with the hint appears next to it. The line under the widget says what the element does. |
| Click a tab, a question, a choice, a button | It acts. A button or choice also arms the widget. |
| Click an element with a tooltip | Its panel opens under the widget. Click again to close it. |
| Click `[copy]` on a code block | The code goes to the clipboard. |
| Click empty space | Nothing: pi keeps it for text selection and scrolling. |

<table>
<tr>
<td valign="top"><img src="screenshots/table-tooltip.png" width="360" alt="Hovering a table row: a hint bubble"></td>
<td valign="top"><img src="screenshots/table-panel.png" width="360" alt="The same row opened: its panel"></td>
</tr>
<tr><td><sub>Hover: the hint appears next to the row</sub></td><td><sub>Click or Enter: the panel</sub></td></tr>
</table>

## Keyboard

Once a widget is armed:

| Key | Does |
|---|---|
| Tab, Shift+Tab | Next or previous element in reading order. Wraps around. |
| Arrow keys | The neighbour in that direction. Left and Right prefer the same row and stop at its end; Up and Down prefer the same column. |
| Enter | Activates the focused element: switches a tab, toggles a question, picks a choice, presses a button, copies code, opens or closes a tooltip panel. |
| Esc | Closes an open panel. Pressed again, leaves the widget. |

Anything you type that is not one of these goes to pi's editor and also disarms the widget.

<table>
<tr>
<td valign="top"><img src="screenshots/tabs-nodes.png" width="360" alt="Tabs with the Nodes tab selected"></td>
<td valign="top"><img src="screenshots/interactive-picked.png" width="360" alt="A choice with one option picked and an FAQ answer opened"></td>
</tr>
<tr><td><sub>Tabs switch in place</sub></td><td><sub>A picked choice is filled; FAQ items open and close on their own</sub></td></tr>
</table>

## Tooltips

An element with a tooltip shows a `◆`, coloured by the tooltip's tone (info, good, warn, bad). The mark sits where you
look first:

- on the top border of a box (a node, a tile, a table of a schema, a picture's frame);
- right after the text of a one-line element (a table cell, a pie legend row, a radar axis);
- on the curve at the annotated point of a line or area chart.

When any element has a tooltip, the line under the widget says how many and how to reach them.

On a pie, hover either the wedge or its legend row. On a line or area chart, hover anywhere in the point's column.

See [Tooltip](components/Tooltip.md) for the targets each component accepts.

## Notes

A note is a comment you pin to one part of a widget: a table cell, a graph node, a pie slice, a paragraph. Use it to tell the
agent "this is wrong" or "explain this" without describing where the thing is. Notes never send anything by themselves.

<table>
<tr>
<td valign="top"><img src="screenshots/notes-mode.png" width="360" alt="Notes mode on: hovering a table cell says Enter writes a note"></td>
<td valign="top"><img src="screenshots/notes-tray.png" width="360" alt="Two notes on a table: numbered pins on the header and a cell, and a tray listing them"></td>
</tr>
<tr><td><sub>Notes mode: hover shows what a click would pick</sub></td><td><sub>Two notes: numbered pins, and the tray under the widget</sub></td></tr>
</table>

1. Click `[ notes ]` at the bottom right of the widget, or run `/openui-notes`. The chip becomes `[ notes: on ]`. A widget with
   nothing to annotate, such as a row of buttons, has no chip.
2. Click the part you mean, or Tab to it and press Enter. In notes mode a click never presses a button or picks a choice.
3. pi's own editor opens, titled with what you picked (`Note on Table > row 3, State`). Type, then press Enter to save.
   Shift+Enter adds a line. Esc cancels. Saving an empty note removes it.
4. The part gets a numbered pin and the note joins a tray under the widget.
5. Click `[ Add 2 notes to your message ]`, or reach it from the keyboard: Tab until it is focused (or press Down on a
   note in the tray, which lands on it), then Enter. The notes go into pi's message box as one numbered message, the widget
   leaves notes mode, and nothing is sent. Read it, edit it, add your own words, and press Enter when you are ready. That
   Enter is pi's: the widget has already given the keyboard back.

The message names each part the way the agent wrote it, so it can find the line in its own source: the variable name, the
component, the tab it sits on, and the part.

```text
Notes on the widget "Cluster status" (2). Please answer each note by its number. ...

1. `tbl` (Table) [tab "Nodes"] > row 3, column `State`, cell "draining"
   Why did this one reboot? Say when.
2. `tbl` (Table) [tab "Nodes"] > column `GPU %`
   Average over what window?
```

### What a click picks

| Component | Parts you can note |
|---|---|
| Text, Markdown, Callout, CodeBlock, Faq, Metric, Image | The whole component |
| Table | A row, a column or a cell |
| BarChart, PieChart | A bar or a slice |
| LineChart, AreaChart, RadarChart | A point (or axis) or a series |
| Dag, Erd, InfraMap, SequenceDiagram | A node, an entity or column, a zone, a link, a participant or a message |
| GeoMap | A pin or a link |

![A note on a graph node: the pin 1 sits on the node's top border, and the tray lists the note](screenshots/notes-dag.png)
<sub>On a diagram the pin sits on the top border of the node, the same place a tooltip's `◆` goes</sub>

Every component with parts also lets you note the whole of it: Tab to it. Click picks the most specific thing under the
pointer (a cell). Shift+click, or Shift+Enter, picks what holds it (the row; a column's table). Stack, Card, Tabs, Button and
Choice have nothing to note.

### Keys in notes mode

| Key | Does |
|---|---|
| Tab, Shift+Tab | Next or previous component, then each note in the tray, then `[ Add ... ]`, `[ Clear ]` and the chip |
| Arrow keys | Among the parts of the component you are in; past the last part they move on to the next component |
| Enter | Write a note on the focused part, edit the focused note in the tray, or press the focused tray button (`[ Add ... ]` puts the notes in your message box, `[ Clear ]` discards them) |
| Down, on a note in the tray | Lands on `[ Add ... ]`, never on `[ Clear ]`, so Down then Enter is the short way to add. Left and Right move between the two buttons |
| Shift+Enter | Pick the part that holds the focused one |
| Delete, Backspace | Remove the focused note in the tray |
| Esc | Leave notes mode |

There is no single-key shortcut for Add: any letter belongs to pi's editor and ends notes mode. Notes mode ends when you start
typing a message, like any armed widget, so Enter sends your message and does not open an editor. While pi's editor is open the widget ignores the keyboard and mouse.

### Good to know

- A note on a tab that is not showing stays in the tray with its tab named, and its pin comes back with the tab.
- A widget holds 20 notes of up to 1,000 characters. At the limit you can still edit a note.
- Words that come from the widget (a label, a cell) are cleaned before they reach the message: control and invisible
  characters go, backticks and double quotes become single quotes, and `@name` becomes `(at)name`. A widget cannot slip a file
  reference into a message you are about to send.
- Notes live in memory with the widget. They are gone when the session ends or pi restarts.

## Buttons, choices and the agent

- In a widget the **agent drew**, a Button or Choice click sends text as a real user turn. The agent reads it as your next
  message, acts, and may draw a new widget.
- In `/openui-gallery` and `/openui-file` widgets the click is only echoed in the transcript, so you can try everything
  at no cost.
- A Button with `@OpenUrl` copies the link to the clipboard and says so, because a terminal cannot open a browser from here.

## Wide diagrams and tables

When a diagram or table is wider than the terminal it shows a window with a hint such as `columns 1-58 of 145 ›`. Moving
focus to a node or cell scrolls it into view. Labels shrink and the direction switches before it comes to scrolling.

## Copying

`[copy]` writes to the clipboard with an OSC 52 escape, which most modern terminals accept. If yours does not, select the
code with the mouse as you would anywhere else in pi.

## Pictures

An Image is placed by the terminal, so it cannot be underlined. Hovering or focusing it lights up its frame instead. See
[Image](components/Image.md) for formats and fallbacks.

A picture written inside a [Markdown](components/Markdown.md) (a line that is only `![alt](path)`) behaves the same way, except
that it cannot carry a tooltip.
