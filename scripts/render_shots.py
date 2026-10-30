#!/usr/bin/env python3
"""Paint the terminal output described by docs/screenshots/.build/shots.json into PNGs.

Needs Pillow and a monospace font that has the glyphs the widgets use (JetBrains Mono Nerd Font Mono, which is also what
test/font.test.ts audits). Set OPENUI_FONT_DIR to the folder holding JetBrainsMonoNerdFontMono-{Regular,Bold,Italic,BoldItalic}.ttf.

    python3 scripts/render_shots.py [name]
"""
import base64, io, json, os, re, sys, unicodedata
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.environ.get("OPENUI_FONT_DIR", os.path.expanduser("~/Library/Fonts"))
SIZE = int(os.environ.get("OPENUI_FONT_SIZE", "20"))
PAD = 22
BG = (22, 27, 34)
FG = (201, 209, 217)

def font(style):
    name = {"": "Regular", "b": "Bold", "i": "Italic", "bi": "BoldItalic"}[style]
    return ImageFont.truetype(os.path.join(FONT_DIR, f"JetBrainsMonoNerdFontMono-{name}.ttf"), SIZE)

FONTS = {k: font(k) for k in ("", "b", "i", "bi")}
ASC, DESC = FONTS[""].getmetrics()
CH = ASC + DESC
CW = round(FONTS[""].getlength("M"))

BASIC = [(0, 0, 0), (205, 49, 49), (13, 188, 121), (229, 229, 16), (36, 114, 200), (188, 63, 188), (17, 168, 205), (229, 229, 229),
         (102, 102, 102), (241, 76, 76), (35, 209, 139), (245, 245, 67), (59, 142, 234), (214, 112, 214), (41, 184, 219), (255, 255, 255)]

def xterm256(n):
    if n < 16: return BASIC[n]
    if n < 232:
        n -= 16
        lv = [0, 95, 135, 175, 215, 255]
        return (lv[n // 36], lv[(n // 6) % 6], lv[n % 6])
    v = 8 + (n - 232) * 10
    return (v, v, v)

SGR = re.compile(r"\x1b\[([0-9;:]*)m")
OTHER = re.compile(r"\x1b(?:\[[0-9;?]*[A-Za-ln-z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|_[^\x1b]*\x1b\\)")

def width(ch):
    if unicodedata.combining(ch) or unicodedata.category(ch) in ("Mn", "Me", "Cf"): return 0
    return 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1

def parse(line):
    """Return a list of (char, style) cells. Style: dict fg bg b d i u r s."""
    st = dict(fg=None, bg=None, b=False, d=False, i=False, u=False, r=False, s=False)
    cells = []
    pos = 0
    line = OTHER.sub("", line)
    for m in SGR.finditer(line):
        for ch in line[pos:m.start()]:
            w = width(ch)
            if w == 0: continue
            cells.append((ch, dict(st)))
            if w == 2: cells.append(("", dict(st)))
        pos = m.end()
        p = [int(x) if x else 0 for x in re.split(r"[;:]", m.group(1))] or [0]
        k = 0
        while k < len(p):
            c = p[k]
            if c == 0: st.update(fg=None, bg=None, b=False, d=False, i=False, u=False, r=False, s=False)
            elif c == 1: st["b"] = True
            elif c == 2: st["d"] = True
            elif c == 3: st["i"] = True
            elif c == 4: st["u"] = True
            elif c == 7: st["r"] = True
            elif c == 9: st["s"] = True
            elif c == 22: st["b"] = st["d"] = False
            elif c == 23: st["i"] = False
            elif c == 24: st["u"] = False
            elif c == 27: st["r"] = False
            elif c == 29: st["s"] = False
            elif 30 <= c <= 37: st["fg"] = BASIC[c - 30]
            elif 90 <= c <= 97: st["fg"] = BASIC[c - 90 + 8]
            elif 40 <= c <= 47: st["bg"] = BASIC[c - 40]
            elif 100 <= c <= 107: st["bg"] = BASIC[c - 100 + 8]
            elif c == 39: st["fg"] = None
            elif c == 49: st["bg"] = None
            elif c in (38, 48):
                if k + 1 < len(p) and p[k + 1] == 2 and k + 4 < len(p):
                    col = (p[k + 2], p[k + 3], p[k + 4]); k += 4
                elif k + 1 < len(p) and p[k + 1] == 5 and k + 2 < len(p):
                    col = xterm256(p[k + 2]); k += 2
                else:
                    col = None
                if col: st["fg" if c == 38 else "bg"] = col
            k += 1
    for ch in line[pos:]:
        w = width(ch)
        if w == 0: continue
        cells.append((ch, dict(st)))
        if w == 2: cells.append(("", dict(st)))
    return cells

def mix(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def colors(st):
    fg = st["fg"] or FG
    bg = st["bg"]
    if st["r"]: fg, bg = (bg or BG), fg
    if st["d"] and not st["r"]: fg = mix(fg, bg or BG, 0.5)
    return fg, bg

# block elements are drawn as rectangles so half blocks of neighbouring rows meet without a seam
def block_rect(ch):
    c = ord(ch)
    if c == 0x2580: return (0, 0, 1, .5)
    if 0x2581 <= c <= 0x2588: return (0, 1 - (c - 0x2580) / 8, 1, 1)
    if 0x2589 <= c <= 0x258F: return (0, 0, (0x2590 - c) / 8, 1)
    if c == 0x2590: return (.5, 0, 1, 1)
    return None

def render(shot):
    cols = max([sum(1 if c[0] != "" else 0 for c in parse(l)) + sum(1 for c in parse(l) if c[0] == "") for l in shot["lines"]] + [1])
    rows = len(shot["lines"])
    W, H = cols * CW + 2 * PAD, rows * CH + 2 * PAD
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W - 1, H - 1), radius=14, fill=BG + (255,))
    for y, line in enumerate(shot["lines"]):
        for x, (ch, st) in enumerate(parse(line)):
            fg, bg = colors(st)
            px, py = PAD + x * CW, PAD + y * CH
            wcell = CW * (2 if (x + 1 < 10**6 and False) else 1)
            if bg: d.rectangle((px, py, px + CW - 1, py + CH - 1), fill=bg)
            if ch in ("", " "): continue
            br = block_rect(ch)
            if br:
                d.rectangle((px + br[0] * CW, py + br[1] * CH, px + br[2] * CW - 1, py + br[3] * CH - 1), fill=fg)
                continue
            f = FONTS[("b" if st["b"] else "") + ("i" if st["i"] else "")]
            d.text((px, py), ch, font=f, fill=fg)
            if st["u"]: d.line((px, py + ASC + 2, px + CW - 1, py + ASC + 2), fill=fg, width=1)
            if st["s"]: d.line((px, py + CH // 2, px + CW - 1, py + CH // 2), fill=fg, width=1)
    for img in shot.get("images", []):
        pic = Image.open(io.BytesIO(base64.b64decode(img["png"]))).convert("RGB")
        pic = pic.resize((img["cols"] * CW, img["rows"] * CH), Image.LANCZOS)
        im.paste(pic, (PAD + img["col"] * CW, PAD + img["row"] * CH))
    return im

def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    src = os.path.join(ROOT, "docs/screenshots/.build/shots.json")
    shots = json.load(open(src))
    out = os.path.join(ROOT, "docs/screenshots")
    os.makedirs(out, exist_ok=True)
    for s in shots:
        if only and s["file"] != only: continue
        im = render(s)
        im.save(os.path.join(out, s["file"] + ".png"), optimize=True)
        print(f"{s['file']}.png  {im.size[0]}x{im.size[1]}")

if __name__ == "__main__":
    main()
