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
