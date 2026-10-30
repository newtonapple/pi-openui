"""A pseudo-terminal harness for driving a real pi: pty + the pyte terminal emulator.

Kitty image commands are cut out of the byte stream before pyte sees it and recorded together with the cursor position at
the moment they arrived, so a test can say exactly where a picture was placed.
"""
import os, pty, sys, time, select, struct, fcntl, termios, signal, re
import pyte

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXT = os.path.join(ROOT, ".pi", "extensions", "openui.ts")


def pi_args(extra=()):
    """pi with only this extension, no session, no skills. No prompt is ever sent, so no model call is made."""
    model = os.environ.get("E2E_MODEL")
    return ["pi", *(["--model", model] if model else []), "--no-session", "--no-extensions", "--no-skills", "--no-context-files", "--no-prompt-templates", "-e", EXT, *extra]


class Checks:
    def __init__(self, title):
        self.title, self.results = title, []
    def __call__(self, name, ok, detail=""):
        self.results.append(bool(ok))
        print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  ->  " + str(detail)[:1500]))
    def done(self):
        print(f"{self.title}: {sum(self.results)}/{len(self.results)} passed")
        return all(self.results)


class Term:
    """pty + pyte terminal emulator. Kitty image commands are removed from the stream and recorded with the cursor position."""
    def __init__(self, args, cols=110, rows=46, env=None):
        self.cols, self.rows = cols, rows
        pid, fd = pty.fork()
        if pid == 0:
            e = dict(os.environ, TERM="xterm-256color", COLORTERM="truecolor", PI_SKIP_VERSION_CHECK="1")
            e.pop("TMUX", None)
            e.update(env or {})
            os.execvpe(args[0], args, e)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
        self.pid, self.fd = pid, fd
        self.screen = pyte.Screen(cols, rows)
        self.stream = pyte.ByteStream(self.screen)
        self.raw = b""
        self.tail = b""
        self.images = []  # dicts: x, y, controls, bytes
    def _feed(self, data):
        buf = self.tail + data
        self.tail = b""
        pos = 0
        while True:
            i = buf.find(b"\x1b_G", pos)
            if i < 0:
                self.stream.feed(buf[pos:]); break
            j = buf.find(b"\x1b\\", i)
            if j < 0:                      # incomplete command: keep it for the next read
                self.stream.feed(buf[pos:i]); self.tail = buf[i:]; break
            self.stream.feed(buf[pos:i])
            body = buf[i + 3:j]
            ctl = body.split(b";", 1)[0].decode("ascii", "replace")
            params = dict(kv.split("=", 1) for kv in ctl.split(",") if "=" in kv)
            self.images.append(dict(x=self.screen.cursor.x, y=self.screen.cursor.y, ctl=ctl, params=params, size=j - i))
            pos = j + 2
    def pump(self, idle=0.6, maxt=8.0):
        t0 = time.time(); last = time.time()
        while time.time() - t0 < maxt:
            r, _, _ = select.select([self.fd], [], [], 0.1)
            if r:
                try: d = os.read(self.fd, 65536)
                except OSError: return
                if not d: return
                self.raw += d; self._feed(d); last = time.time()
            elif time.time() - last > idle: return
    def send(self, b, idle=0.6):
        os.write(self.fd, b if isinstance(b, bytes) else b.encode()); self.pump(idle)
    def lines(self): return [l.rstrip() for l in self.screen.display]
    def text(self): return "\n".join(self.lines())
    def find(self, needle, min_row=0):
        for y, l in enumerate(self.lines()):
            if y < min_row: continue
            x = l.find(needle)
            if x >= 0: return x, y
        return None
    def click(self, x, y):
        self.send(f"\x1b[<0;{x+1};{y+1}M", 0.1); self.send(f"\x1b[<0;{x+1};{y+1}m", 0.6)
    def hover(self, x, y): self.send(f"\x1b[<35;{x+1};{y+1}M", 0.7)
    def wheel(self, x, y, up=True): self.send(f"\x1b[<{64 if up else 65};{x+1};{y+1}M", 0.4)
    def close(self):
        try: os.kill(self.pid, signal.SIGKILL)
        except Exception: pass
