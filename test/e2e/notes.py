"""Notes in a real pi: the chip, pi's own editor opening on a click, the pin and the tray, Add to message into pi's message box,
and the keyboard path. Nothing is ever sent: Enter is only pressed inside the note editor, never in the message box."""
import re
from drive import Checks, Term, pi_args

check = Checks("notes")


def start(cols=110):
    t = Term(pi_args(), cols=cols)
    t.pump(idle=2.0, maxt=15)
    return t


def run(t, cmd, idle=1.5):
    t.send(cmd)
    t.send("\r", idle)


def at(t, needle, min_row=0):
    r = t.find(needle, min_row)
    assert r, f"not on screen: {needle}\n{t.text()}"
    return r


# ---------- the mouse path ----------
t = start(); run(t, "/openui-gallery table")
check("the table draws with a notes chip", "[ notes ]" in t.text() and "spark-3" in t.text(), t.text())
x, y = at(t, "[ notes ]"); t.click(x + 3, y)
check("clicking the chip turns notes mode on", "[ notes: on ]" in t.text(), t.text())
check("the hint line explains notes", "notes: click or Enter writes a note" in t.text(), t.text())
x, y = at(t, "draining"); t.hover(x + 2, y)
check("hovering a cell says what a click picks", "Table > row 3, State" in t.text() and "Enter to write a note" in t.text(), t.text())
t.click(x + 2, y)
check("a click opens pi's own editor, titled with what was picked", "Note on Table > row 3, State" in t.text(), t.text())
t.send("why did this reboot?", 0.6)
check("what is typed lands in the note editor", "why did this reboot?" in t.text(), t.text())
t.send("\r", 1.2)
txt = t.text()
check("Enter saves: the editor closes and the tray lists the note", "Note on Table" not in txt and "Notes (1)" in txt and "why did this reboot?" in txt, txt)
line = next((l for l in t.lines() if "spark-3" in l), "")
check("the cell carries the pin", "1draining" in line, line)
check("the note is not sent: no model turn started", "Working" not in txt and "Thinking" not in txt, txt)

# a second note on a column, then Add to message
x, y = at(t, "GPU %"); t.click(x + 2, y)
check("a second click opens the editor on the column", "Note on Table > column GPU %" in t.text(), t.text())
t.send("average over what?", 0.6); t.send("\r", 1.2)
check("two notes in the tray", "Notes (2)" in t.text() and "average over what?" in t.text(), t.text())
x, y = at(t, "[ Add 2 notes to your message ]"); t.click(x + 4, y)
txt = t.text()
check("Add to message puts the message in pi's message box", "Notes on the widget you drew (2)" in txt, txt)
check("with each note numbered and the target named", "1. `tbl` (Table) > row 3, column `State`" in txt and "why did this reboot?" in txt and "2. `tbl` (Table) > column `GPU %`" in txt, txt)
check("the notes left the widget, which left notes mode", "Notes (2)" not in txt and "[ notes: on ]" not in txt, txt)
check("it says so", "Added 2 notes to your message" in txt, txt)
# The next key the user presses is Enter, to send what they read. If the widget were still armed it would take that Enter.
# (The test does not press it: that would send the message to the model.)
check("the widget gave the keyboard back: no armed bar, no hint line", "▎" not in txt and "openui " not in txt, txt)
check("and still nothing was sent", "Working" not in txt and "Thinking" not in txt, txt)
t.send("PLUS ", 0.6)
check("the keyboard is pi's again: typing goes to the message box", "PLUS" in t.text(), t.text())
t.close()

# ---------- the keyboard path ----------
t = start(); run(t, "/openui-gallery table")
run(t, "/openui-notes", 1.2)
check("/openui-notes turns notes mode on", "[ notes: on ]" in t.text(), t.text())
t.send("\t", 0.5)
check("Tab focuses the whole table", "▸ Table" in t.text(), t.text())
for _ in range(40):
    if "cell" in "".join(l for l in t.lines() if "▸" in l) or re.search(r"▸ Table > row \d, \w", t.text()):
        break
    t.send("\x1b[B", 0.3)
check("arrows step into the parts", re.search(r"▸ Table > row \d, ", t.text()) is not None, t.text())
t.send("\r", 1.0)
check("Enter opens the editor on the focused cell", "Note on Table > row" in t.text(), t.text())
t.send("keyboard note", 0.5); t.send("\r", 1.2)
check("saved through the keyboard", "Notes (1)" in t.text() and "keyboard note" in t.text(), t.text())
t.send("\x1b", 0.6)
check("Esc leaves notes mode", "[ notes: on ]" not in t.text() and "[ notes 1 ]" in t.text(), t.text())
t.send("hello", 0.5)
check("typing after leaving goes to pi's message box", "hello" in t.text(), t.text())
t.close()

# ---------- typing returns the keyboard ----------
t = start(); run(t, "/openui-gallery table")
run(t, "/openui-notes", 1.2)
t.send("typed", 0.6)
check("a letter in notes mode goes to pi and ends notes mode", "typed" in t.text() and "[ notes: on ]" not in t.text(), t.text())
t.close()

# ---------- a narrow terminal ----------
t = start(cols=50); run(t, "/openui-gallery table")
x, y = at(t, "[ notes ]"); t.click(x + 3, y)
x, y = at(t, "draining"); t.click(x + 2, y)
t.send("narrow", 0.6); t.send("\r", 1.2)
check("no screen line is wider than 50 columns with a note and the tray", all(len(l) <= 50 for l in t.lines()), [l for l in t.lines() if len(l) > 50][:3])
check("the tray is there", "Notes (1)" in t.text(), t.text())
t.close()

import sys
sys.exit(0 if check.done() else 1)
