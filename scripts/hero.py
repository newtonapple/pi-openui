"""Composite pictures for the README: the screenshots side by side, as one image each.

The README is shown on GitHub, on npm and on pi.dev. pi.dev drops raw HTML (<table>, <img>) and keeps markdown images, so a grid
of screenshots has to be a single picture. Reads docs/screenshots/*.png (made by render_shots.py) and writes
docs/screenshots/hero.png and docs/screenshots/components.png.

    python3 scripts/hero.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "docs", "screenshots")
FONT_DIR = os.environ.get("OPENUI_FONT_DIR", os.path.expanduser("~/Library/Fonts"))
LABEL = (190, 196, 210)
GAP = 28


def font(size):
    return ImageFont.truetype(os.path.join(FONT_DIR, "JetBrainsMonoNerdFontMono-Bold.ttf"), size)


def load(name, width, box_h=None):
    """The screenshot scaled to `width`; with `box_h`, scaled down to fit a width x box_h box instead (never up)."""
    im = Image.open(os.path.join(SHOTS, name + ".png")).convert("RGBA")
    scale = width / im.width
    if box_h is not None:
        scale = min(scale, box_h / im.height)
    return im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)


def grid(names, cols, tile_w, labels=None, out="grid", box_h=None):
    """names: screenshot files; labels: the caption under each, or None for no captions."""
    tiles = [load(n, tile_w, box_h) for n in names]
    label_h = 44 if labels else 0
    rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
    row_h = [(box_h or max(t.height for t in r)) + label_h for r in rows]
    width = cols * tile_w + (cols - 1) * GAP
    height = sum(row_h) + (len(rows) - 1) * GAP
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    f = font(26)
    y = 0
    caps = [(labels or names)[i:i + cols] for i in range(0, len(names), cols)]
    for r, rh, row_caps in zip(rows, row_h, caps):
        for c, (tile, name) in enumerate(zip(r, row_caps)):
            x = c * (tile_w + GAP)
            canvas.paste(tile, (x + (tile_w - tile.width) // 2, y + ((box_h - tile.height) // 2 if box_h else 0)), tile)
            if labels:
                tw = draw.textlength(name, font=f)
                draw.text((x + (tile_w - tw) / 2, y + (box_h or tile.height) + 8), name, font=f, fill=LABEL)
        y += rh + GAP
    path = os.path.join(SHOTS, out + ".png")
    canvas.save(path, optimize=True)
    print(f"{out}.png  {canvas.size[0]}x{canvas.size[1]}  {os.path.getsize(path) // 1024} KB")


def main():
    # similar shapes share a row so the rows stay tight
    grid(["dashboard", "dag-tooltip", "infra", "image-tooltip", "notes-tray", "notes-dag"], cols=2, tile_w=780, out="hero")
    grid(["table", "line", "pie", "geo", "erd", "sequence", "code", "radar"], cols=4, tile_w=420, box_h=300,
         labels=["Table", "LineChart", "PieChart", "GeoMap", "Erd", "SequenceDiagram", "CodeBlock", "RadarChart"], out="components")


if __name__ == "__main__":
    main()
