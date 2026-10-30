"""A saved session that contains a render_widget result: pi redraws the widget, and it is clickable."""
import json, os, sys, tempfile, time
from drive import Checks, Term, pi_args

check = Checks("resume")
DASH = '''root = Stack([title, tabs, go])
title = Text("Resumed dashboard", "title")
tabs = Tabs([t1, t2])
t1 = TabItem("Overview", [kpis])
kpis = Stack([m1, m2], "row")
m1 = Metric("Requests", "12.4k", "+3%", "good")
m2 = Metric("Errors", "0.3%", "-0.1%", "good")
t2 = TabItem("Services", [tbl])
tbl = Table(["Service", "p95"], [["api", "145 ms"], ["checkout", "310 ms"]], [tip])
tip = Tooltip("row:2", "Slow since the 14:00 deploy", "p95 doubled after release 41.", "kubectl rollout undo deploy/checkout", "bash", "warn")
go = Button("Show slow requests", @ToAssistant("Show the slowest requests"))'''
now = int(time.time() * 1000)
usage = {"input": 10, "output": 10, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 20, "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0}}


def ent(i, parent, msg):
    return {"type": "message", "id": f"{i:08x}", "parentId": parent, "timestamp": "2026-10-30T10:00:00.000Z", "message": msg}


lines = [
    {"type": "session", "version": 3, "id": "11111111-2222-3333-4444-555555555555", "timestamp": "2026-10-30T10:00:00.000Z", "cwd": "/tmp"},
    ent(1, None, {"role": "user", "content": "show me a dashboard", "timestamp": now}),
    ent(2, "00000001", {"role": "assistant", "content": [{"type": "toolCall", "id": "call_resume1", "name": "render_widget", "arguments": {"source": DASH}}], "api": "openai-codex-responses", "provider": "openai-codex", "model": "gpt-6-luna", "usage": usage, "stopReason": "toolUse", "timestamp": now}),
    ent(3, "00000002", {"role": "toolResult", "toolCallId": "call_resume1", "toolName": "render_widget", "content": [{"type": "text", "text": "Widget drawn."}], "details": {"kind": "widget", "source": DASH}, "isError": False, "timestamp": now}),
    ent(4, "00000003", {"role": "assistant", "content": [{"type": "text", "text": "Here is the dashboard."}], "api": "openai-codex-responses", "provider": "openai-codex", "model": "gpt-6-luna", "usage": usage, "stopReason": "stop", "timestamp": now}),
]
session = os.path.join(tempfile.mkdtemp(prefix="oui-e2e-"), "session.jsonl")
open(session, "w").write("\n".join(json.dumps(l) for l in lines) + "\n")

args = pi_args()
args[args.index("--no-session")] = "--session"
args.insert(args.index("--session") + 1, session)
t = Term(args)
t.pump(idle=2.5, maxt=15)
check("the resumed tool result is redrawn as a widget", "Resumed dashboard" in t.text() and "Overview" in t.text() and "Requests" in t.text(), t.text())
x, y = t.find("Services", 0); t.click(x + 1, y)
check("a click on a tab inside a tool-rendered widget works", "checkout" in t.text() and "Requests" not in t.text(), t.text())
x, y = t.find("checkout", 0); t.hover(x + 3, y)
check("hover shows the tooltip hint", "Slow since the 14:00 deploy" in t.text(), t.text())
t.click(x + 3, y)
check("click opens the panel with detail and code", "p95 doubled after release 41" in t.text() and "kubectl rollout undo deploy/checkout" in t.text(), t.text())
t.close()
sys.exit(0 if check.done() else 1)
