// One OpenUI Lang example per component. They are compiled by the real parser, so they double as tests.
import { SAMPLE_PNG_DATA_URI } from "../data/sample-image.ts";

export interface LangSample {
	key: string;
	title: string;
	source: string;
}

export const LANG_SAMPLES: LangSample[] = [
	{
		key: "dashboard",
		title: "Stack, Text, Metric, Card, BarChart, Button",
		source: `root = Stack([title, kpis, load, go])
title = Text("Cluster status", "title")
kpis = Stack([m1, m2, m3], "row")
m1 = Metric("GPU util", "87%", "+4% vs 1h ago", "warn")
m2 = Metric("Nodes up", "4 / 4", "all healthy", "good")
m3 = Metric("Queue", "12", "-3", "good")
load = Card([chart], "Load by node")
chart = BarChart(["spark-1", "spark-2", "spark-3", "spark-4"], [91, 84, 77, 62], null, "%")
go = Button("Show slowest requests", @ToAssistant("Show the 10 slowest vLLM requests from the last hour"))`,
	},
	{
		key: "text",
		title: "Text variants and Callout tones",
		source: `root = Stack([t1, t2, t3, t4, t5, c1, c2, c3, c4], "column", "s")
t1 = Text("Title text", "title")
t2 = Text("Heading text", "heading")
t3 = Text("Body text is the default and wraps to the available width, so a long sentence flows onto the next line instead of running off the edge.")
t4 = Text("Muted text for secondary notes", "muted")
t5 = Text("code_variant(42)", "code")
c1 = Callout("Heads up: this is an info callout.", "info")
c2 = Callout("Deploy finished without errors.", "success")
c3 = Callout("Disk usage is above 80% on spark-3.", "warn")
c4 = Callout("Health check failed twice in a row.", "error")`,
	},
	{
		key: "table",
		title: "Table (numbers right-aligned) with tooltips",
		source: `root = Stack([tbl])
tbl = Table(["Node", "State", "GPU %", "Uptime"], [["spark-1", "serving", 91, "12 d"], ["spark-2", "serving", 84, "12 d"], ["spark-3", "draining", 77, "3 d"], ["spark-4", "serving", 62, "12 d"]], [t1, t2])
t1 = Tooltip("row:3", "Rebooted 21 Oct after a driver update", "The node was drained first, then rebooted.\\n\\n- queue paused\\n- 3 requests migrated", "sudo systemctl restart vllm", "bash", "warn")
t2 = Tooltip("col:GPU %", "Average over the last 5 minutes")`,
	},
	{
		key: "tabs",
		title: "Tabs",
		source: `root = Stack([tabs])
tabs = Tabs([overview, nodes, notes])
overview = TabItem("Overview", [kpis])
kpis = Stack([m1, m2], "row")
m1 = Metric("Nodes up", "4 / 4", "all healthy", "good")
m2 = Metric("Queue", "12", "-3", "good")
nodes = TabItem("Nodes", [tbl])
tbl = Table(["Node", "State"], [["spark-1", "serving"], ["spark-2", "serving"]])
notes = TabItem("Notes", [note])
note = Callout("spark-3 was rebooted on 21 Oct.", "info")`,
	},
	{
		key: "interactive",
		title: "Button, Choice, Faq",
		source: `root = Stack([b, ch, fq])
b = Stack([b1, b2], "row")
b1 = Button("Restart vllm", @ToAssistant("Restart the vllm service on gpu-box-1"))
b2 = Button("Drain node")
ch = Choice("Which model should serve chat?", ["qwen3-32b", "llama-3.3-70b", "gemma-3-27b"], "I will use it for the next request")
fq = Faq([q1, q2, q3], true)
q1 = FaqItem("What does draining do?", "It stops **new** requests and lets running ones finish.\\n\\n1. queue pauses\\n2. in-flight requests complete\\n3. node is marked *drained*")
q2 = FaqItem("How do I undo it?", "Run \`uncordon\` on the node: it rejoins the pool immediately.")
q3 = FaqItem("Why did spark-3 reboot?", "A driver update needed it. See the [runbook](https://example.com/runbook).")`,
	},
	{
		key: "choice-card",
		title: "Choice: several questions, one Send",
		source: `root = Stack([plan])
plan = Card([q1, q2, q3], "Before I restart")
q1 = Choice("Which node should I restart first?", ["web-1", "web-2"])
q2 = Choice("Which checks should I run?", ["Disk", "Memory", "Network"], null, true)
q3 = Choice("Clear the cache on db?", ["Yes", "No"], null, null, false)`,
	},
	{
		key: "markdown",
		title: "Markdown and CodeBlock",
		source: `root = Stack([md, code])
md = Markdown("# Release notes\\n\\nThis release adds **streaming**, *better* retries and \`--fast\` mode.\\n\\n- faster cold start\\n- fewer 5xx errors\\n  - nested item\\n\\n> Upgrade during a quiet window.\\n\\n| Model | Tokens/s |\\n|---|---|\\n| qwen3 | 82 |\\n| llama | 41 |\\n\\n---\\nSee [docs](https://example.com).")
code = CodeBlock("def serve(model, port=8000):\\n    # start the server\\n    cfg = {\\"model\\": model, \\"port\\": port}\\n    for i in range(3):\\n        print(f\\"attempt {i}\\", cfg)\\n    return True", "python", "serve.py")`,
	},
	{
		key: "code-langs",
		title: "CodeBlock: js, sql, yaml, json, bash, go, rust",
		source: `root = Stack([a, b, c, d, e, f, g], "column", "s")
a = CodeBlock("const res = await fetch(url, { method: \\"POST\\" });\\nconsole.log(res.status); // 200", "js")
b = CodeBlock("SELECT id, count(*) AS n\\nFROM jobs WHERE status = 'done' -- finished\\nGROUP BY id LIMIT 10;", "sql")
c = CodeBlock("server:\\n  port: 8080\\n  tls: true # enabled", "yaml")
d = CodeBlock("{\\"name\\": \\"vllm\\", \\"gpus\\": 8, \\"ok\\": true}", "json")
e = CodeBlock("for f in *.log; do\\n  echo $f | grep -c ERROR\\ndone", "bash")
f = CodeBlock("func main() {\\n\\tfmt.Println(\\"hi\\", 42)\\n}", "go")
g = CodeBlock("fn main() {\\n    let x: i32 = 42; // answer\\n    println!(\\"{}\\", x);\\n}", "rust")`,
	},
	{
		key: "line",
		title: "LineChart (natural, linear, step)",
		source: `root = Stack([natural, linear, step])
natural = LineChart(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], [s1, s2], "natural", "day", "requests (k)", null, [t1, t2, t3])
linear = LineChart(["Mon", "Tue", "Wed", "Thu", "Fri"], [s3], "linear")
step = LineChart(["Mon", "Tue", "Wed", "Thu", "Fri"], [s3], "step")
s1 = Series("api", [12, 19, 15, 25, 32, 28, 35])
s2 = Series("worker", [8, 11, 14, 12, 18, 22, 20])
s3 = Series("errors", [3, 7, 4, 9, 5])
t1 = Tooltip("Thu", "Release v2.3 went out at 14:00", "Traffic jumped 60% after the release. The worker queue grew too, but drained by Friday.\\n\\n- cache warm-up took 20 minutes\\n- two retries logged", "kubectl rollout history deploy/api", "bash", "warn")
t2 = Tooltip("Sun", "Weekend peak: a batch import")
t3 = Tooltip("series:worker", "Background jobs: indexing and emails")`,
	},
	{
		key: "area",
		title: "AreaChart (stacked)",
		source: `root = Stack([c])
c = AreaChart(["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"], [a, b, d], "natural", null, "tokens/min", null, [t])
a = Series("qwen3", [10, 14, 30, 42, 38, 20])
b = Series("llama", [5, 8, 15, 22, 18, 9])
d = Series("gemma", [2, 3, 8, 10, 9, 4])
t = Tooltip("12:00", "Lunch peak", "All three models peak together at midday. qwen3 alone is over half of the tokens.", null, null, "info")`,
	},
	{
		key: "pie",
		title: "PieChart (pie, donut, semi-circular)",
		source: `root = Stack([pie, row])
pie = PieChart(["qwen3-32b", "llama-3.3-70b", "gemma-3-27b", "embeddings", "free"], [38, 52, 18, 6, 14], null, null, [t1, t2, t3])
t1 = Tooltip("llama-3.3-70b", "Biggest tenant: the support bot", "Serves 41% of the cluster's memory. Pinned to spark-2 and spark-3 with tensor parallelism.", "vllm serve llama-3.3-70b --tensor-parallel-size 2", "bash", "info")
t2 = Tooltip("free", "About one more 14 GB model fits", null, null, null, "good")
t3 = Tooltip("embeddings", "Small but always loaded")
row = Stack([donut, semi], "row")
donut = PieChart(["a", "b", "c"], [5, 3, 2], "donut")
semi = PieChart(["x", "y", "z"], [4, 3, 1], "pie", "semiCircular")`,
	},
	{
		key: "radar",
		title: "RadarChart",
		source: `root = Stack([r])
r = RadarChart(["Speed", "Cost", "Quality", "Context", "Tools"], [a, b], [t1, t2])
t1 = Tooltip("Cost", "Higher is cheaper per million tokens")
t2 = Tooltip("series:llama", "llama-3.3-70b, 4-bit", "Best quality and context of the two, at the price of speed.", null, null, "warn")
a = Series("qwen3", [80, 90, 70, 60, 85])
b = Series("llama", [55, 60, 88, 90, 70])`,
	},
	{
		key: "geo",
		title: "GeoMap with a link and tooltips",
		source: `root = Stack([m])
m = GeoMap([tokyo, sf, fra, syd], [["Tokyo", "Frankfurt"]], "Regions", [t])
tokyo = GeoPoint("Tokyo", 35.68, 139.69, "good")
sf = GeoPoint("San Francisco", 37.77, -122.42, "info")
fra = GeoPoint("Frankfurt", 50.11, 8.68, "warn")
syd = GeoPoint("Sydney", -33.87, 151.21)
t = Tooltip("Tokyo", "Primary region", "Serves APAC traffic. Failover is Sydney.")`,
	},
	{
		key: "dag",
		title: "Dag with statuses and a tooltip",
		source: `root = Stack([flow])
flow = Dag([n1, n2, n3, n4, n5, n6], [["build", "unit"], ["build", "lint"], ["build", "bench"], ["unit", "package"], ["lint", "package"], ["bench", "deploy"]], null, "CI run", [t])
n1 = DagNode("build", "Build image", "done")
n2 = DagNode("unit", "Unit tests", "done")
n3 = DagNode("lint", "Lint", "failed")
n4 = DagNode("bench", "Benchmark", "running")
n5 = DagNode("package", "Package", "skipped")
n6 = DagNode("deploy", "Deploy", "pending")
t = Tooltip("lint", "2 rules failed", "ruff reported two violations in src/api.", "ruff check src/", "bash", "bad")`,
	},
	{
		key: "graph",
		title: "Graph: a job lifecycle with a retry loop, a self-loop and tooltips on a node and an edge",
		source: `root = Stack([g])
g = Graph([s, queued, running, done, failed, e], [e1, e2, e3, e4, e5, e6, e7], null, "Job lifecycle", [t1, t2])
s = GraphNode("s", "job created", "start")
queued = GraphNode("queued", "Queued")
running = GraphNode("running", "Running", null, "running")
done = GraphNode("done", "Done")
failed = GraphNode("failed", "Failed")
e = GraphNode("e", "closed", "end")
e1 = GraphEdge("s", "queued")
e2 = GraphEdge("queued", "running", "worker picks up")
e3 = GraphEdge("running", "running", "heartbeat")
e4 = GraphEdge("running", "done", "exit 0")
e5 = GraphEdge("running", "failed", "exit 1")
e6 = GraphEdge("failed", "queued", "retry (up to 3x)")
e7 = GraphEdge("done", "e")
t1 = Tooltip("queued", "Waits for a free worker", "Jobs leave the queue in the order they arrived.")
t2 = Tooltip("failed>queued", "Retried after a backoff", "The delay doubles on each retry: 30 s, 60 s, 120 s.", "job retry --id 42", "bash", "warn")`,
	},
	{
		key: "graph-delegation",
		title: "Graph: an agent that delegates to an implementer and a reviewer, up to 3 rounds",
		source: `root = Stack([g, note])
g = Graph([s, plan, impl, rev, human, e], [e1, e2, e3, e4, e5, e6], null, "Delegated task")
s = GraphNode("s", "task", "start")
plan = GraphNode("plan", "Orchestrator", null, "done")
impl = GraphNode("impl", "Implementer", null, "running")
rev = GraphNode("rev", "Reviewer")
human = GraphNode("human", "Human review", null, "pending")
e = GraphNode("e", "merged", "end")
e1 = GraphEdge("s", "plan")
e2 = GraphEdge("plan", "impl", "delegate")
e3 = GraphEdge("impl", "rev", "ready for review")
e4 = GraphEdge("rev", "impl", "changes requested (up to 3x)")
e5 = GraphEdge("rev", "human", "still failing after 3", "dashed")
e6 = GraphEdge("rev", "e", "approved")
note = Text("The reviewer sends the work back to the implementer at most three times.", "muted")`,
	},
	{
		key: "graph-states",
		title: "Graph: a busy state machine, three return arrows into one state, drawn top to bottom",
		source: `root = Stack([g])
g = Graph([s, closed, listen, connecting, connected, closing, e], [e1, e2, e3, e4, e5, e6, e7, e8, e9, e10], "TB", "Connection states")
s = GraphNode("s", "boot", "start")
closed = GraphNode("closed", "Closed")
listen = GraphNode("listen", "Listening")
connecting = GraphNode("connecting", "Connecting")
connected = GraphNode("connected", "Connected", null, "running")
closing = GraphNode("closing", "Closing")
e = GraphNode("e", "gone", "end")
e1 = GraphEdge("s", "closed")
e2 = GraphEdge("closed", "listen", "passive open")
e3 = GraphEdge("closed", "connecting", "active open")
e4 = GraphEdge("listen", "connected", "peer connects")
e5 = GraphEdge("connecting", "connected", "peer answers")
e6 = GraphEdge("listen", "closed", "close")
e7 = GraphEdge("connecting", "closed", "timeout")
e8 = GraphEdge("connected", "closing", "close")
e9 = GraphEdge("connected", "closed", "reset")
e10 = GraphEdge("closing", "e", "wait over")`,
	},
	{
		key: "graph-order",
		title: "Graph: top to bottom, a return arrow on the right and a self-loop on the left",
		source: `root = Stack([g])
g = Graph([s, pay, pack, ship, e], [e1, e2, e3, e4, e5, e6], "TB", "Order flow")
s = GraphNode("s", "order placed", "start")
pay = GraphNode("pay", "Awaiting payment")
pack = GraphNode("pack", "Packing")
ship = GraphNode("ship", "Shipped")
e = GraphNode("e", "delivered", "end")
e1 = GraphEdge("s", "pay")
e2 = GraphEdge("pay", "pay", "reminder")
e3 = GraphEdge("pay", "pack", "paid")
e4 = GraphEdge("pack", "ship", "handed to courier")
e5 = GraphEdge("ship", "pack", "returned to warehouse")
e6 = GraphEdge("ship", "e", "signed for")`,
	},
	{
		key: "graph-pairs",
		title: "Graph: two edges between one pair, an arrow each way, statuses and a dashed edge",
		source: `root = Stack([g, h])
g = Graph([client, api, db], [e1, e2, e3, e4], null, "Two edges between one pair")
client = GraphNode("client", "Client")
api = GraphNode("api", "API")
db = GraphNode("db", "Database")
e1 = GraphEdge("client", "api", "read")
e2 = GraphEdge("client", "api", "write")
e3 = GraphEdge("api", "db", "query")
e4 = GraphEdge("db", "api", "rows")
h = Graph([plan, build, test, deploy, notify], [f1, f2, f3, f4, f5], null, "Pipeline run with a retry loop")
plan = GraphNode("plan", "Plan", null, "done")
build = GraphNode("build", "Build", null, "running")
test = GraphNode("test", "Test", null, "failed")
deploy = GraphNode("deploy", "Deploy", null, "pending")
notify = GraphNode("notify", "Notify", null, "skipped")
f1 = GraphEdge("plan", "build")
f2 = GraphEdge("build", "test")
f3 = GraphEdge("test", "build", "fix and retry")
f4 = GraphEdge("test", "deploy", "all green")
f5 = GraphEdge("deploy", "notify", "optional", "dashed")`,
	},
	{
		key: "erd",
		title: "Erd with a column tooltip",
		source: `root = Stack([schema])
schema = Erd([users, projects, jobs], [r1, r2], "Job queue schema", [t])
users = Entity("users", ["id uuid PK", "email text UNIQUE", "created_at timestamptz"])
projects = Entity("projects", ["id uuid PK", "owner_id uuid FK", "name text"])
jobs = Entity("jobs", ["id uuid PK", "project_id uuid FK", "status text"])
r1 = Relation("users", "projects", "1:N", "owns")
r2 = Relation("projects", "jobs", "1:N", "runs")
t = Tooltip("jobs.status", "queued | running | done | failed")`,
	},
	{
		key: "infra",
		title: "InfraMap",
		source: `root = Stack([map])
map = InfraMap([z1, z2, z3], [l1, l2, l3, l4], "Web platform", null, [t])
z1 = InfraZone("Edge", [lb, cdn], "info")
z2 = InfraZone("Application", [api, worker])
z3 = InfraZone("Data", [db, cache], "good")
lb = InfraNode("lb", "Load balancer", "gateway", "up", "HTTPS :443")
cdn = InfraNode("cdn", "CDN", "cloud", "up")
api = InfraNode("api", "API", "service", "up", "REST")
worker = InfraNode("worker", "Worker", "service", "degraded", "2 of 3 running")
db = InfraNode("db", "Postgres", "database", "up")
cache = InfraNode("cache", "Redis", "database", "up")
l1 = InfraLink("cdn", "lb", "cache miss")
l2 = InfraLink("lb", "api", "HTTP")
l3 = InfraLink("api", "db", "SQL")
l4 = InfraLink("api", "cache", "get / set", "dashed")
t = Tooltip("worker", "One replica is down", "2 of 3 workers are running.", "kubectl get pods -l app=worker", "bash", "warn")`,
	},
	{
		key: "sequence",
		title: "SequenceDiagram with alt/else, note, self-call",
		source: `root = Stack([d])
d = SequenceDiagram([user, api, cache, db], [m1, g, m5, m6], "Cache lookup", true, [t])
user = SeqParticipant("user", "User", "actor")
api = SeqParticipant("api", "API", "service")
cache = SeqParticipant("cache", "Cache", "database")
db = SeqParticipant("db", "Postgres", "database")
m1 = SeqMessage("user", "api", "GET /item/42", "sync", "req")
g = SeqGroup("alt", "cache hit?", [m2, m3], [m4, n1, m4b], "miss")
m2 = SeqMessage("api", "cache", "get item:42")
m3 = SeqMessage("cache", "api", "item", "return")
m4 = SeqMessage("api", "db", "SELECT * FROM items")
n1 = SeqNote("db", "slow path: about 40 ms")
m4b = SeqMessage("db", "api", "row", "return")
m5 = SeqMessage("api", "api", "serialize")
m6 = SeqMessage("api", "user", "200 OK", "return")
t = Tooltip("req", "The entry point", "Authenticated by the gateway before it reaches the API.")`,
	},
	{
		key: "markdown-image",
		title: "Markdown with a picture on a line of its own",
		source: `root = Stack([doc])
doc = Markdown("## A picture in the text\\n\\nThe line below is only an image: it is drawn by the terminal, between the paragraphs.\\n\\n![Sunset over the ridge](${SAMPLE_PNG_DATA_URI} \\"Generated test picture\\")\\n\\nText continues underneath, and a path with spaces goes in angle brackets.")`,
	},
	{
		key: "image",
		title: "Image (a real picture where the terminal can show one) with a tooltip",
		source: `root = Stack([img])
img = Image("${SAMPLE_PNG_DATA_URI}", "Sunset over the ridge", "Generated test picture, 192x108", [t])
t = Tooltip("image", "Test picture, drawn by the extension", "Pictures use the terminal's image protocol (Kitty, Ghostty, WezTerm, Warp, herdr). Other terminals get a labelled frame with the file details.", null, null, "info")`,
	},
	// ---- Small screens. `/openui-gallery wide` draws these: each is something that does not fit a phone (about 60 columns), and
	// each shows what it does instead of being cut. Try them in a narrow pane.
	{
		key: "wide-table",
		title: "A wide table: it scrolls, and Host is pinned so a row stays readable",
		source: `root = Stack([title, t])
title = Text("Server fleet: five columns, Host stays put while the rest scrolls", "heading")
t = Table(["Host", "OS", "Role", "Address", "State"], [["gpu-box-a", "Ubuntu 24.04", "Gateway host, HAProxy", "198.51.100.76", "up"], ["gpu-box-a2", "Ubuntu 24.04", "Worker pool, node A", "198.51.100.4", "up"], ["work-pc-ubuntu", "Ubuntu 24.04", "Build runner, CI #12", "198.51.100.2", "down 8d"], ["minipc-m55-ubuntu", "Ubuntu 22.04", "Test bench, dual-boot", "203.0.113.9", "down 7d"], ["laptop-primary", "macOS", "Control plane; ops-ctl", "198.51.100.118", "up"]], null, ["Host"])`,
	},
	{
		key: "wide-table-cut",
		title: "Long cells: one that is cut to fit ends in an ellipsis, tap it to read it whole",
		source: `root = Stack([title, t])
title = Text("Three columns fit by squeezing: tap a cell that ends in … to read it all", "heading")
t = Table(["Service", "Status", "Last event"], [["billing-api-gateway", "degraded", ${JSON.stringify("Rolling restart in progress since 14:02 (owner: platform-team, ticket OPS-4471). Two of three replicas are draining; traffic is shifted to the third.")}], ["auth", "up", "Certificate renewed"], ["search-indexer", "down", ${JSON.stringify("Out of disk on /var/lib/index after the 02:10 compaction. The on-call was paged at 02:14 and the volume was extended at 02:51.")}]])`,
	},
	{
		key: "wide-code",
		title: "Code with a long line: it scrolls inside its box, [copy] still copies all of it",
		source: `root = Stack([c])
c = CodeBlock(${JSON.stringify(`curl -sS -X POST https://api.example.com/v1/chat/completions -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' -d '{"model": "qwen3-235b", "messages": [{"role": "user", "content": "hello"}]}' | jq -r '.choices[0].message.content'\necho done`)}, "bash", "Call the gateway")`,
	},
	{
		key: "wide-tabs",
		title: "Tabs whose labels do not fit one line: the strip wraps",
		source: `root = Stack([tabs])
tabs = Tabs([a, b, c, d, e, f])
a = TabItem("Infrastructure map", [x1])
b = TabItem("Inventory table", [x2])
c = TabItem("Services and ports", [x3])
d = TabItem("Alerts", [x4])
e = TabItem("Deployments history", [x5])
f = TabItem("Settings", [x6])
x1 = Text("The first tab is selected. Tap another label: every one is whole, and each is a tap target.")
x2 = Text("Inventory")
x3 = Text("Services")
x4 = Text("Alerts")
x5 = Text("Deployments")
x6 = Text("Settings")`,
	},
	{
		key: "wide-tiles",
		title: "A row of tiles and buttons: it wraps onto more rows instead of squeezing them",
		source: `root = Stack([tiles, actions])
tiles = Stack([a, b, c, d], "row", "m")
a = Metric("Requests per second", "1,234,567", "+12% vs last hour", "good")
b = Metric("p99 latency", "842 ms", "-3%", "bad")
c = Metric("Error budget remaining", "99.95 %")
d = Metric("Queue depth", "12,345,678", "+8%", "warn")
actions = Stack([b1, b2, b3, b4], "row", "s")
b1 = Button("Restart the vllm service", @ToAssistant("Restart the vllm service"))
b2 = Button("Drain node", @ToAssistant("Drain the node"))
b3 = Button("Show logs for the last hour", @ToAssistant("Show the logs for the last hour"))
b4 = Button("Escalate to on-call", @ToAssistant("Escalate to the on-call engineer"))`,
	},
	{
		key: "wide-infra-map",
		title: "A wide InfraMap: whole labels, scroll sideways",
		source: `root = Stack([map])
map = InfraMap([clients, edge, gpu, bench], [l1, l2, l3, l4, l5], "Server fleet", "LR")
clients = InfraZone("Clients", [lap1, lap2, ph1, tab1])
edge = InfraZone("Public edge", [cf, caddy], "info")
gpu = InfraZone("GPU fleet", [s1, s2, s3], "good")
bench = InfraZone("Test bench", [mini2, mini3])
lap1 = InfraNode("lap1", "Work laptop", "service", "up", "control plane; ops-ctl")
lap2 = InfraNode("lap2", "Work laptop 2", "service", "unknown", "idle 23h")
ph1 = InfraNode("ph1", "Work phone 1", "service", "up")
tab1 = InfraNode("tab1", "Work tablet", "service", "unknown")
cf = InfraNode("cf", "Cloudflare tunnel", "cloud", "up", "ingress for gateway")
caddy = InfraNode("caddy", "Caddy", "gateway", "up", "reverse proxy; fronts services")
s1 = InfraNode("s1", "gpu-box-a", "service", "up", "HAProxy, Postgres")
s2 = InfraNode("s2", "gpu-box-a2", "service", "up", "pool 1 of 2")
s3 = InfraNode("s3", "gpu-box-a3", "service", "up", "pool 2 of 2")
mini2 = InfraNode("mini2", "minipc-m55", "service", "down", "test bench")
mini3 = InfraNode("mini3", "mini-3", "service", "down", "test bench")
l1 = InfraLink("lap1", "caddy", "private")
l2 = InfraLink("ph1", "caddy", "private")
l3 = InfraLink("cf", "caddy", "tunnel")
l4 = InfraLink("caddy", "s1", "/v1")
l5 = InfraLink("s2", "s3", "10G LAN", "dashed")`,
	},
	{
		key: "wide-dag",
		title: "A pipeline with long step names: labels shrink a little, then it scrolls whole",
		source: `root = Stack([d])
d = Dag([a, b, c, e, f, g], [["a", "b"], ["b", "c"], ["c", "e"], ["e", "f"], ["f", "g"]], "LR", "Release pipeline")
a = DagNode("a", "Compile the frontend bundle", "done")
b = DagNode("b", "Run the unit test suite", "done")
c = DagNode("c", "Build the docker image", "running")
e = DagNode("e", "Push to the registry", "pending")
f = DagNode("f", "Deploy to staging now", "pending")
g = DagNode("g", "Run the smoke tests live", "pending")`,
	},
	{
		key: "wide-graph",
		title: "A state machine with long state names and edge labels: labels shrink a little, then it scrolls with whole labels",
		source: `root = Stack([g])
g = Graph([s, a, b, c, e], [e1, e2, e3, e4, e5], "LR", "Release approval")
s = GraphNode("s", "change request", "start")
a = GraphNode("a", "Waiting for security review", null, "running")
b = GraphNode("b", "Approved by release manager")
c = GraphNode("c", "Rolled back, canary failed", null, "failed")
e = GraphNode("e", "released", "end")
e1 = GraphEdge("s", "a")
e2 = GraphEdge("a", "b", "all reviewers approved")
e3 = GraphEdge("b", "c", "canary errors above 1 percent")
e4 = GraphEdge("c", "a", "fixes pushed, review again")
e5 = GraphEdge("b", "e", "rollout finished")`,
	},
	{
		key: "wide-erd",
		title: "A schema with long field lines: shrunk to fit (down to 30 characters), scrolling only past that",
		source: `root = Stack([e])
e = Erd([u, o, li], [r1, r2], "Orders")
u = Entity("users", ["id uuid PK", "email_verification_token_hash text UNIQUE NOT NULL", "display_name text", "created_at timestamptz"])
o = Entity("orders", ["id uuid PK", "user_id uuid FK", "total_amount_in_minor_units bigint", "status text"])
li = Entity("order_line_items_with_a_long_name", ["id uuid PK", "order_id uuid FK", "sku text", "quantity int"])
r1 = Relation("users", "orders", "1:N", "places")
r2 = Relation("orders", "order_line_items_with_a_long_name", "1:N", "contains")`,
	},
	{
		key: "wide-sequence",
		title: "Five participants and long message labels",
		source: `root = Stack([s])
s = SequenceDiagram([a, b, c, d, e], [m1, m2, m3, m4], "Checkout", true)
a = SeqParticipant("a", "Browser", "actor")
b = SeqParticipant("b", "API gateway", "service")
c = SeqParticipant("c", "Auth service", "service")
d = SeqParticipant("d", "Postgres primary", "database")
e = SeqParticipant("e", "Billing provider", "external")
m1 = SeqMessage("a", "b", "POST /v1/orders with the cart and a payment token")
m2 = SeqMessage("b", "c", "verify the session token")
m3 = SeqMessage("c", "d", "select * from sessions where id = ?")
m4 = SeqMessage("b", "e", "charge the card, idempotency key attached")`,
	},
	{
		key: "wide-markdown",
		title: "Markdown with a code fence and a table that are wider than a phone",
		source: `root = Stack([m])
m = Markdown(${JSON.stringify("## Rollout notes\n\nRun this on the gateway first, then check the table below:\n\n```bash\nkubectl rollout status deployment/billing-api-gateway --namespace production --timeout=300s && kubectl get pods -l app=billing-api-gateway -o wide\n```\n\n| service | status | region | owner | notes | updated |\n|---|---|---|---|---|---|\n| billing-api-gateway | degraded | us-east-1 | platform team | rolling restart in progress | 2026-11-14 |\n| auth | up | eu-west-2 | identity | certificate renewed | 2026-11-13 |\n\nA word too long for any line: " + "abcdefghij".repeat(8))})`,
	},
	{
		key: "wide-card",
		title: "A long card title, a callout and a question with long options",
		source: `root = Stack([c, note, q])
c = Card([t], "A card title that is much longer than a phone is wide, so it wraps inside the card")
t = Text("The title is not cut: when it does not fit the border it moves inside as a heading.")
note = Callout("A callout with a long unbroken word is broken, not cut: ${"averyveryverylongword".repeat(4)} and then the sentence goes on.", "warn")
q = Choice("Which of these long options would you like the agent to run next on the whole cluster?", ["Restart every service in the staging environment one at a time", "Drain the node and wait for the jobs to finish", "Do nothing"])`,
	},
];
