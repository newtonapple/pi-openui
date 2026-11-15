"""A narrow pane in a real pi (60 columns): the pan bar, tap, key, wheel, sideways flick, drag, and the first column that stays.
Needs pyte (python3 -m venv /tmp/e2e && /tmp/e2e/bin/pip install pyte). No model call is made: nothing here sends a message."""
import os, re
from drive import Checks, Term, ROOT, pi_args

check = Checks("narrow")
CORPUS = os.path.join(ROOT, "test", "compat", "corpus")
BAR = re.compile(r"(\d+)–(\d+)/(\d+)")


def start(cols=60):
    t = Term(pi_args(), cols=cols, rows=46)
    t.pump(idle=2.0, maxt=15)
    return t


def run(t, cmd, idle=1.5):
    t.send(cmd)
    t.send("\r", idle)


def bar(t):
    """(from, to, total, row) of the pan bar on screen, or None."""
    for y, l in enumerate(t.lines()):
        m = BAR.search(l)
        if m and "‹" in l and "›" in l:
            return int(m[1]), int(m[2]), int(m[3]), y
    return None


def cell(t, glyph):
    y = bar(t)[3]
    return t.lines()[y].index(glyph), y


def sgr(t, button, x, y, up=False, idle=0.5):
    t.send(f"\x1b[<{button};{x + 1};{y + 1}{'m' if up else 'M'}", idle)


# ---------- the fleet table: scrolled by tap, key, wheel, flick and drag ----------
t = start()
run(t, f"/openui-file {os.path.join(CORPUS, 'fleet-table.oui')}")
b = bar(t)
check("a table wider than the pane shows a pan bar", b is not None and b[0] == 1, t.text())
if b is None:
    raise SystemExit(1)
widget_lines = [l for l in t.lines() if l.startswith("▎") or "│" in l or "‹" in l]
check("the widget's lines leave the last column empty (pi paints its scrollbar there)", widget_lines and all(len(l.rstrip()) <= 59 for l in widget_lines), t.text())
check("the table is readable at the start: first columns whole, not cut to ten characters", "Gateway host, HAPr" in t.text() or "gpu-box-a2" in t.text(), t.text())
total = b[2]
x, y = cell(t, "›"); t.click(x, y)
b2 = bar(t)
check("a tap on › scrolls a few cells (8 by default), not a page", b2 and b2[0] == b[0] + 8, f"{b} -> {b2}\n{t.text()}")
x, y = cell(t, "»"); t.click(x, y)
b3 = bar(t)
check("a tap on » scrolls a page: far more than a fine step", b3 and b3[0] - b2[0] > 20, f"{b2} -> {b3}")
check("nothing is pinned unless the model asks: the Host column scrolls away with the rest", any("198.51" in l for l in t.lines()) and not any("│ gpu-box-a " in l and "198.51" in l for l in t.lines()), t.text())
x, y = cell(t, "«"); t.click(x, y)
for _ in range(12):
    if bar(t)[0] == 1: break
    x, y = cell(t, "‹"); t.click(x, y)
check("taps on « and ‹ scroll back to the start", bar(t)[0] == 1, t.text())
for _ in range(10):
    x, y = cell(t, "»"); t.click(x, y)
check("the whole table is reachable: the last column is on screen at the end of the scroll", bar(t)[1] == bar(t)[2] and "down 8d" in t.text(), t.text())
for _ in range(10):
    x, y = cell(t, "«"); t.click(x, y)

row = bar(t)[3] - 4   # a row of the table body
body_x = 20
before = bar(t)[0]
sgr(t, 69, body_x, row)          # shift + wheel down
after = bar(t)[0]
check("shift+wheel scrolls three columns", after == before + 3, f"{before} -> {after}\n{t.text()}")
sgr(t, 65, body_x, row)          # plain wheel: the transcript's
check("the plain wheel does not scroll the table", bar(t) is None or bar(t)[0] == after, t.text())

before = bar(t)[0]
sgr(t, 67, body_x, row)          # a sideways flick, as a terminal sends it (wheel right)
after = bar(t)[0]
check("a horizontal wheel (flick) scrolls", after == before + 3, f"{before} -> {after}")
x, y = cell(t, "›"); t.click(x, y)
check("the tap right after a flick still works (pi's press is never released)", bar(t)[0] > after, t.text())
pos = bar(t)[0]
sgr(t, 66, body_x, row)          # wheel left
check("and a flick back scrolls left", bar(t) is not None and bar(t)[0] == max(1, pos - 3), f"{pos} -> {bar(t)}")

# the thumb: press on the track, drag to its right end, release
x0, y0 = cell(t, "░") if "░" in t.lines()[bar(t)[3]] else cell(t, "█")
line = t.lines()[bar(t)[3]]
track_left = min(i for i, ch in enumerate(line) if ch in "█░")
track_right = max(i for i, ch in enumerate(line) if ch in "█░")
sgr(t, 0, track_left, y0, idle=0.2)
sgr(t, 32, (track_left + track_right) // 2, y0, idle=0.2)
sgr(t, 32, track_right, y0, idle=0.2)
sgr(t, 0, track_right, y0, up=True, idle=0.6)
bb = bar(t)
check("dragging the thumb to the end of its track scrolls to the end", bb and bb[1] == total, t.text())

# the keyboard: arm the widget, Right scrolls, Esc leaves
t.send("\x1b[D", 0.3)
t2 = start()
run(t2, f"/openui-file {os.path.join(CORPUS, 'fleet-table.oui')}")
run(t2, "/openui-focus")
for _ in range(4):                     # the first stop is the tooltip on a cell; Tab goes on to the bar
    if "arrows scroll" in t2.text(): break
    t2.send("\t", 0.5)
check("Tab reaches the bar, and the keyboard hint says the arrows scroll", "arrows scroll" in t2.text(), t2.text())
t2.send("\x1b[C", 0.6)
check("Right scrolls the table while the bar is focused", bar(t2) and bar(t2)[0] > 1, t2.text())
t2.send("\x1b[D", 0.6)
check("Left scrolls back", bar(t2) and bar(t2)[0] == 1, t2.text())
t2.close()
t.close()

# ---------- pinned columns: the model picks them, they never take more than half ----------
t = start()
run(t, f"/openui-file {os.path.join(CORPUS, 'table-pin.oui')}")
x, y = cell(t, "»"); t.click(x, y)
x, y = cell(t, "»"); t.click(x, y)
lines = t.lines()
head = next((l for l in lines if "│ Host" in l and "State" in l), "")
check("Host and State are pinned: they stay at the left after two pages of scrolling", bool(head) and head.index("Host") < head.index("State") < 30 and any("│ gpu-box-a " in l and "│ up " in l for l in lines), t.text())
check("and what scrolled in is on the right of them", "Address" in t.text() or "Role" in t.text(), t.text())
check("the pinned part is under half of the pane (60 columns)", head.index("│", head.index("State")) <= 30, head)
t.close()

# ---------- a cell cut to fit: tap it to read it whole ----------
t = start()
run(t, "/openui-gallery wide-table-cut")
cut = t.find("Rolling restart")
check("a cell that did not fit ends in an ellipsis", cut is not None and "…" in t.lines()[cut[1]] and "OPS-4471" not in t.text(), t.text())
if cut:
    t.click(cut[0] + 3, cut[1])
    flat = lambda: "".join(" " if ch in "│╭╮╰╯─▎" else ch for ch in t.text())
    check("a tap opens it whole under the table", "OPS-4471" in flat() and "Two of three replicas are draining" in " ".join(flat().split()), t.text())
    check("the line under the widget says what it is, short enough for the pane", "tap to read all" in t.text(), t.text())
    t.click(cut[0] + 3, cut[1])
    check("a second tap closes it", "OPS-4471" not in t.text(), t.text())
    t.click(cut[0] + 3, cut[1])
    t.send("\x1b", 0.8)
    check("Esc closes it too, and the first Esc is only that", "OPS-4471" not in t.text(), t.text())
t.close()

# ---------- the wide InfraMap ----------
t = start()
run(t, f"/openui-file {os.path.join(CORPUS, 'wide-infra.oui')}")
b = bar(t)
check("a diagram wider than the pane shows the bar too", b is not None and b[2] > 60, t.text())
x, y = cell(t, "›"); t.click(x, y)
check("and a tap on › scrolls it", bar(t) and bar(t)[0] > 1, t.text())
t.close()

# ---------- pan rather than cut: code scrolls, tabs and tiles wrap ----------
import tempfile
tmp = tempfile.mkdtemp(prefix="openui-narrow-")
def write(name, src):
    path = os.path.join(tmp, name)
    open(path, "w").write(src)
    return path

CURL = "curl -X POST https://api.example.com/v1/chat/completions -H 'Authorization: Bearer $TOKEN' -d @body.json"
code = write("code.oui", 'root = Stack([c])\nc = CodeBlock(%s, "bash", "request")\n' % __import__("json").dumps(CURL))
tabs = write("tabs.oui", """root = Stack([t])
t = Tabs([a,b,c,d,e,f])
a = TabItem("Infrastructure map", [x])
b = TabItem("Inventory table", [x])
c = TabItem("Services and ports", [x])
d = TabItem("Alerts", [x])
e = TabItem("Deployments history", [x])
f = TabItem("Settings", [x])
x = Text("tab content")
""")
tiles = write("tiles.oui", """root = Stack([a,b,c], "row", "m")
a = Metric("Requests per second","1,234,567","+12%","good")
b = Metric("p99 latency","842 ms","-3%","bad")
c = Metric("Error budget remaining","99.95 %")
""")
t = start()
run(t, f"/openui-file {code}")
check("code wider than the pane scrolls inside its box: a bar, the box and [copy] where they were", bar(t) is not None and "[copy]" in t.text() and "…" not in t.text(), t.text())
for _ in range(4):
    x, y = cell(t, "»"); t.click(x, y)
check("and taps on » (a page) show the rest of the line, to its end", bar(t) and bar(t)[0] > 1 and "body.json" in t.text(), t.text())
t.close()

t = start()
run(t, f"/openui-file {tabs}")
txt = t.text()
check("a tab strip that does not fit wraps: every label is whole", all(l in txt for l in ["Infrastructure map", "Inventory table", "Services and ports", "Alerts", "Deployments history", "Settings"]) and "…" not in txt, txt)
x, y = t.find("Settings")
t.click(x + 1, y)
check("a tap on a wrapped tab selects it", "tab content" in t.text(), t.text())
t.close()

t = start()
run(t, f"/openui-file {tiles}")
txt = t.text()
check("metric tiles that do not fit side by side wrap: every label is whole", all(l in txt for l in ["Requests per second", "p99 latency", "Error budget remaining"]) and "…" not in txt, txt)
t.close()

# ---------- what a swipe sends, recorded ----------
t = start()
run(t, f"/openui-file {os.path.join(CORPUS, 'fleet-table.oui')}")
run(t, "/openui-events on")
check("/openui-events on says it is recording", "Recording" in t.text(), t.text())
y0 = bar(t)[3] - 4
sgr(t, 67, 20, y0)
sgr(t, 0, 20, y0); sgr(t, 0, 20, y0, up=True)
t.send("\x1b[C", 0.3)
run(t, "/openui-events show")
shown = t.text()
check("the flick, the tap and the key are in the log, with what the widget made of the flick", "press btn=none" in shown and "-> pan" in shown and "key " in shown, shown)
check("and nothing that was typed is: the command words are not in the log", "openui-events show\"" not in open(os.path.expanduser("~/.pi/agent/openui-events.log")).read(), "")
run(t, "/openui-events off"); run(t, "/openui-events clear")
t.close()

# ---------- the setting ----------
t = start()
run(t, "/openui-config")
check("/openui-config says what is in force and where the file is", "table.minColumnWidth = 12" in t.text() and "openui.json" in t.text(), t.text())
t.close()

raise SystemExit(0 if check.done() else 1)
