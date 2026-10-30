"""Mouse and keyboard in a real pi: tabs, FAQ, choices, buttons, hover, tooltips, copy, narrow terminals."""
import base64, re, sys
from drive import Checks, Term, pi_args

check = Checks("interactive")


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


# ---------- tabs ----------
t = start(); run(t, "/openui-gallery tabs")
check("tabs draw", "Overview" in t.text() and "Nodes up" in t.text() and "spark-1" not in t.text())
x, y = at(t, "Nodes", 5); t.click(x + 1, y)
check("click Nodes swaps the content", "spark-1" in t.text() and "Nodes up" not in t.text(), t.text())
x, y = at(t, "Notes", 5); t.click(x + 1, y)
check("click Notes", "rebooted on 21 Oct" in t.text() and "spark-1" not in t.text())
x, y = at(t, "Overview", 5); t.click(x + 1, y)
check("click back to Overview", "Nodes up" in t.text())
check("armed marker and hint bar after a click", "▎" in t.text() and "openui" in t.text())
t.send("\x1b", 0.6)
check("Esc leaves: the hint bar is gone", "arrows move" not in t.text() and "Tab or arrows" not in t.text())
t.close()

# ---------- button, choice, faq, hover, keyboard ----------
t = start(); run(t, "/openui-gallery interactive")
check("buttons, choice and faq draw", all(s in t.text() for s in ["[ Restart vllm ]", "Which model", "What does draining do?"]), t.text())
x, y = at(t, "[ Restart vllm ]"); t.hover(x + 3, y)
check("hover says what the button sends", 'sends "Restart the vllm service' in t.text(), t.text())
x, y = at(t, "llama-3.3-70b"); t.click(x + 2, y)
check("a choice click echoes '<question> — <option>'", "Which model should serve chat? — llama-3.3-70b" in t.text(), t.text())
check("the pick is filled", "● llama-3.3-70b" in t.text() and "○ qwen3-32b" in t.text())
x, y = at(t, "How do I undo it?"); t.click(x + 3, y)
check("a FAQ click opens the answer", "uncordon" in t.text())
x, y = at(t, "How do I undo it?"); t.click(x + 3, y)
check("and closes it again", "uncordon" not in t.text())
x, y = at(t, "[ Drain node ]"); t.click(x + 3, y)
check("a button without an action sends its label", "widget click → assistant] Drain node" in t.text(), t.text())
t.send("\x1b[Z", 0.7); t.send("\r", 0.9)
check("Shift+Tab then Enter activates the previous button", "Restart the vllm service on dgx-spark-1" in t.text(), t.text())
t.send("\x1b[B", 0.7)
check("Down reaches the choices", "choose to answer" in t.text(), t.text())
t.send("\x1b[C", 0.7); t.send("\x1b[C", 0.7); t.send("\r", 0.9)
check("Right, Right, Enter picks the third option", "● gemma-3-27b" in t.text() and "— gemma-3-27b" in t.text(), t.text())
t.send("x", 0.5)
check("typing is not swallowed, and disarms", "x" in "".join(t.lines()[-6:]), "\n".join(t.lines()[-8:]))
t.close()

# ---------- tooltip panel ----------
t = start(); run(t, "/openui-gallery table")
x, y = at(t, "spark-3"); t.hover(x + 2, y)
check("hover on a tooltip row shows its hint", "Rebooted 21 Oct after a driver update" in t.text(), t.text())
t.click(x + 2, y)
check("click opens the panel with text and code", "The node was drained first" in t.text() and "sudo systemctl restart vllm" in t.text(), t.text())
t.send("\x1b", 0.7)
check("first Esc closes the panel and keeps the widget armed", "The node was drained first" not in t.text() and "openui" in t.text(), t.text())
t.send("\x1b", 0.7)
check("second Esc leaves", "arrows move" not in t.text())
t.close()

# ---------- copy ----------
t = start(); run(t, "/openui-gallery markdown")
x, y = at(t, "[copy]"); t.click(x + 2, y)
m = re.search(rb"\x1b\]52;c;([A-Za-z0-9+/=]+)\x07", t.raw)
payload = base64.b64decode(m.group(1)).decode() if m else ""
check("copy emits an OSC 52 clipboard sequence with the exact code", payload.startswith("def serve(model, port=8000):") and payload.endswith("return True"), payload[:80])
check("the button says copied", "✓ copied" in t.text())
t.close()

# ---------- everything in one session ----------
t = start(); run(t, "/openui-gallery all", 4.0)
check("no component fails to draw", "could not be drawn" not in t.raw.decode("utf8", "replace") and "\n! " not in t.text())
run(t, "/openui-focus", 1.0)
check("the session is responsive after drawing every component", "openui" in t.text())
t.close()

# ---------- a narrow terminal ----------
wide = """root = Stack([d])
d = Dag([a, b, c, e, f, g], [["a","b"],["b","c"],["c","e"],["e","f"],["f","g"]], "LR", "A deliberately wide pipeline")
a = DagNode("a", "Fetch the raw sources", "done")
b = DagNode("b", "Parse and normalise", "done")
c = DagNode("c", "Deduplicate records", "running")
e = DagNode("e", "Embed every chunk", "pending")
f = DagNode("f", "Build the search index", "pending")
g = DagNode("g", "Publish to production", "pending")"""
import os, tempfile
path = os.path.join(tempfile.mkdtemp(prefix="oui-e2e-"), "wide.oui")
open(path, "w").write(wide)
t = start(cols=60); run(t, f"/openui-file {path}")
check("no screen line is wider than 60 columns", all(len(l) <= 60 for l in t.lines()))
check("a pan hint is shown for a wide diagram", "columns" in t.text(), t.text())
run(t, "/openui-focus", 1.0)
for _ in range(5): t.send("\t", 0.7)
check("Tab to the last node scrolls it into view", "Publish to" in t.text() and "columns" in t.text(), t.text())
check("still within 60 columns after panning", all(len(l) <= 60 for l in t.lines()))
t.close()

sys.exit(0 if check.done() else 1)
