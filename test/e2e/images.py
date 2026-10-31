"""Pictures in a real pi. Kitty graphics are forced on (PI_IMAGE_PROTOCOL=kitty) and every image command is recorded with
the cursor position at which it arrived."""
import sys
from drive import Checks, Term, pi_args

check = Checks("images")


def start(proto):
    t = Term(pi_args(), env={"PI_IMAGE_PROTOCOL": proto})
    t.pump(idle=2.0, maxt=15)
    return t


t = start("kitty")
t.send("/openui-gallery image"); t.send("\r", 2.5)
txt = t.text()
check("the frame is drawn with its title and badge", "╭─ Sunset over the ridge" in txt and "◆╮" in txt, txt)
check("pi sent the picture to the terminal (a Kitty command with f=100)", any(i["params"].get("f") == "100" for i in t.images), t.images[:3])
img = next((i for i in t.images if i["params"].get("c")), None)
check("the command carries a cell size and an image id", img and int(img["params"]["c"]) > 8 and int(img["params"]["r"]) > 3 and int(img["params"]["i"]) > 0, img)
if img:
    c, r = int(img["params"]["c"]), int(img["params"]["r"])
    ls = t.lines()
    ty = next(y for y, l in enumerate(ls) if "╭─ Sunset over the ridge" in l)
    left = ls[ty].index("╭")
    last = [i for i in t.images if i["params"].get("a") in ("T", "p") and i["params"].get("c") == str(c)][-1]
    check("placed one row below the top border", last["y"] == ty + 1, (last["y"], ty))
    check("placed one column right of the left border", last["x"] == left + 1, (last["x"], left))
    check("the right border is exactly where the picture ends", ls[last["y"]][left + 1 + c] == "│", ls[last["y"]])
    check("caption and bottom border follow the reserved rows", "Generated test picture" in ls[last["y"] + r] and "╰" in ls[last["y"] + r + 1], "\n".join(ls[last["y"] - 1:last["y"] + r + 3]))
    t.hover(left + 3, ty + 3)
    check("hovering the picture shows the bubble", "◆ Test picture, drawn by the extension" in t.text(), t.text())
    t.click(left + 3, ty + 3)
    check("clicking it opens the tooltip panel under it", "Pictures use the terminal's image protocol" in t.text(), t.text())
    check("the click does not resend or resize the picture", all(i["params"].get("c") in (None, str(c)) for i in t.images if i["params"].get("a") == "T"), [i["ctl"] for i in t.images][-4:])
    t.send("\x1b", 0.8)
    check("Esc closes the panel", "Pictures use the terminal's image protocol" not in t.text())
    # push the picture off the top edge, then scroll back until it re-enters: pi must crop it and keep it in its column
    for _ in range(3):
        t.send("/openui-gallery text", 0.2); t.send("\r", 1.0)
    n0 = len(t.images)
    crops = []
    notches = 0
    while len(crops) < 2 and notches < 150:
        import os
        os.write(t.fd, b"\x1b[<64;11;16M"); t.pump(idle=0.12, maxt=1.0); notches += 1
        crops += [i for i in t.images[n0:] if "y=" in i["ctl"] and i["params"].get("a") == "p"]
        n0 = len(t.images)
    check("scrolling it partly off screen: pi crops it and the placement keeps the frame's column", crops and all(i["x"] == left + 1 for i in crops), [(i["ctl"], i["x"]) for i in crops][:3])
    check("and the cropped height is smaller than the full picture", crops and all(int(i["params"]["r"]) < r for i in crops), [i["ctl"] for i in crops][:2])
t.close()

t = start("none")
t.send("/openui-gallery image"); t.send("\r", 2.0)
txt = t.text()
check("without graphics no image command is sent", not t.images, t.images[:2])
check("the frame names the picture and its size", "▒ Sunset over the ridge" in txt and "inline.png · 192×108 · png" in txt, txt)
check("the tooltip badge is on the frame", "◆╮" in txt)
t.close()

# ---------- a picture written inside markdown: a line of its own ----------
t = start("kitty")
t.send("/openui-gallery markdown-image"); t.send("\r", 2.5)
txt = t.text()
check("a markdown picture line draws the frame between the paragraphs", "╭─ Sunset over the ridge" in txt and "A picture in the text" in txt and "Text continues underneath" in txt, txt)
check("and the literal syntax is not on screen", "![Sunset" not in txt and "data:image" not in txt, txt)
tx = [i for i in t.images if i["params"].get("f") == "100" and i["params"].get("c")]
check("pi sent one picture command, with a cell size", len(tx) == 1 and int(tx[0]["params"]["c"]) > 8, [i["ctl"] for i in t.images][:3])
if tx:
    ls = t.lines()
    ty = next(y for y, l in enumerate(ls) if "╭─ Sunset over the ridge" in l)
    left = ls[ty].index("╭")
    check("placed one row under the frame's top border and one column inside it", tx[0]["y"] == ty + 1 and tx[0]["x"] == left + 1, (tx[0]["y"], tx[0]["x"], ty, left))
    check("the caption from the quotes is under the picture", any("Generated test picture" in l for l in ls[ty:ty + 40]), "\n".join(ls[ty:ty + 24]))
    check("the text after it comes below the frame", next(y for y, l in enumerate(ls) if "Text continues underneath" in l) > ty + int(tx[0]["params"]["r"]), "\n".join(ls[ty:ty + 30]))
t.close()

t = start("none")
t.send("/openui-gallery markdown-image"); t.send("\r", 2.0)
txt = t.text()
check("without graphics a markdown picture is the labelled frame, and no image command is sent", not t.images and "▒ Sunset over the ridge" in txt and "inline.png" in txt, txt)
t.close()

sys.exit(0 if check.done() else 1)
