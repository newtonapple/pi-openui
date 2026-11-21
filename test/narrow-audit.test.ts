// The audit of every component on a narrow pane. One hostile source per component, drawn at phone widths.
//
// The rule is "pan rather than cut": a component never draws wider than its pane (it scrolls, wraps or shortens), and the ones in
// NO_CUT never lose text to an ellipsis at all: they wrap, or they scroll with whole labels. The rest keep a fixed cap on a label
// that is about readability, not width, and say why in CAPPED.
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTree } from "../src/blocks/render.ts";
import { newState } from "../src/blocks/types.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { compile } from "../src/lang/library.ts";

const L = "averyveryverylongunbrokenwordthatcannotwrapanywhere_https://example.com/a/very/long/path/that/goes/on/and/on";
const SOURCES: Record<string, string> = {
text_longword: `root = Stack([Text("${L}"), Text("${L}", "title")])`,
callout: `root = Stack([Callout("${L}", "warn")])`,
metric_row: `root = Stack([a,b,c,d], "row", "m")\na = Metric("Requests per second","1,234,567","+12%","good")\nb = Metric("p99 latency","842 ms","-3%","bad")\nc = Metric("Error budget remaining","99.95 %")\nd = Metric("Queue depth","12,345,678")`,
metric_row_wrap: `root = Stack([a,b,c,d], "row", "m", true)\na = Metric("Requests per second","1,234,567")\nb = Metric("p99 latency","842 ms")\nc = Metric("Error budget remaining","99.95 %")\nd = Metric("Queue depth","12,345,678")`,
button_row: `root = Stack([a,b,c,d,e], "row", "s")\na = Button("Restart the service")\nb = Button("Drain node")\nc = Button("Show logs for 1 hour")\nd = Button("Cancel")\ne = Button("Escalate to on-call")`,
card_nest: `root = Stack([c1])\nc1 = Card([c2], "outer card with a long title that is long")\nc2 = Card([t], "inner")\nt = Table(["Name","Value","Notes"],[["alpha","1","a short note"],["beta","2","another"]])`,
tabs_many: `root = Stack([t])\nt = Tabs([a,b,c,d,e,f])\na = TabItem("Infrastructure map", [x])\nb = TabItem("Inventory table", [x])\nc = TabItem("Services and ports", [x])\nd = TabItem("Alerts", [x])\ne = TabItem("Deployments history", [x])\nf = TabItem("Settings", [x])\nx = Text("hello")`,
code_long: `root = Stack([c])\nc = CodeBlock("curl -X POST https://api.example.com/v1/chat/completions -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' -d '{\\"model\\":\\"qwen3\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"hello\\"}]}'\\nshort", "bash", "a title that is long long long")`,
markdown_wide: "root = Stack([m])\nm = Markdown(\"# A heading that is quite long and will need wrapping at narrow widths\\n\\n| a | b | c | d | e | f |\\n|---|---|---|---|---|---|\\n| one two three | four five six | seven eight | nine | ten eleven | twelve |\\n\\n```\\nlet x = someFunction(argumentNumberOne, argumentNumberTwo, argumentNumberThree);\\n```\\n\\n- item " + L + "\")",
bar_h: `root = Stack([b])\nb = BarChart(["A very long category label number one","Another really long category label","Short"],[120,95,3],"Long title for the bar chart goes here","%")`,
bar_v: `root = Stack([b])\nb = BarChart(["Mon","Tue","Wed","Thu","Fri","Sat","Sun","Mon2","Tue2","Wed2","Thu2","Fri2"],[1,2,3,4,5,6,7,8,9,10,11,12])`,
line_many: `root = Stack([l])\nl = LineChart(["00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00","08:00","09:00","10:00","11:00"],[s1,s2,s3,s4],"linear","Time of day","Requests per second")\ns1 = Series("a very long series name one",[1,2,3,4,5,6,7,8,9,10,11,12])\ns2 = Series("another very long series name",[2,3,4,5,6,7,8,9,10,11,12,13])\ns3 = Series("third",[3,2,1,2,3,4,5,4,3,2,1,2])\ns4 = Series("fourth series with a long name",[5,5,5,5,5,5,5,5,5,5,5,5])`,
area_many: `root = Stack([l])\nl = AreaChart(["Monday","Tuesday","Wednesday","Thursday","Friday"],[s1,s2,s3],"natural","Day","Tokens")\ns1 = Series("qwen3-235b-a22b-instruct",[10,20,30,20,10])\ns2 = Series("llama-3.3-70b",[5,10,15,10,5])\ns3 = Series("gemma",[1,2,3,2,1])`,
pie_long: `root = Stack([p])\np = PieChart(["A really long slice label here","Another long slice label","Third","Fourth label long long"],[40,30,20,10])`,
radar_long: `root = Stack([r])\nr = RadarChart(["Throughput per second","Latency p99","Error rate","Saturation","Availability"],[s1,s2])\ns1 = Series("current",[80,60,90,50,70])\ns2 = Series("target with a long name",[90,90,90,90,90])`,
geo: `root = Stack([g])\ng = GeoMap([a,b,c],[["Frankfurt data center","Tokyo data center"]],"Regions")\na = GeoPoint("Frankfurt data center",50.11,8.68,"good")\nb = GeoPoint("Tokyo data center",35.68,139.69,"warn")\nc = GeoPoint("São Paulo",-23.55,-46.63)`,
faq_long: `root = Stack([f])\nf = Faq([a,b],true)\na = FaqItem("A rather long question that goes on and on and on about nothing in particular?","An answer with a ${L}")\nb = FaqItem("Q2","A2")`,
choice_long: `root = Stack([c])\nc = Choice("A very long question about which of the following many options you would like to pick?",["An option that is long enough to need wrapping at narrow widths","Short","Another fairly long option text here"])`,
sequence_many: `root = Stack([s])\ns = SequenceDiagram([a,b,c,d,e],[m1,m2,m3])\na = SeqParticipant("a","Browser","actor")\nb = SeqParticipant("b","API gateway","service")\nc = SeqParticipant("c","Auth service","service")\nd = SeqParticipant("d","Postgres primary","database")\ne = SeqParticipant("e","Billing provider","external")\nm1 = SeqMessage("a","b","POST /v1/orders with a long label")\nm2 = SeqMessage("b","c","verify token")\nm3 = SeqMessage("c","d","select * from sessions where id = ?")`,
erd_wide: `root = Stack([e])\ne = Erd([u,o,p],[r1,r2],"Schema")\nu = Entity("users",["id uuid PK","email text UNIQUE","display_name text","created_at timestamptz"])\no = Entity("orders",["id uuid PK","user_id uuid FK","total numeric","status text"])\np = Entity("order_line_items_with_long_name",["id uuid PK","order_id uuid FK","sku text","quantity int"])\nr1 = Relation("users","orders","1:N","places")\nr2 = Relation("orders","order_line_items_with_long_name","1:N","contains")`,
image: `root = Stack([i])\ni = Image("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","A long alt text that describes the picture in more words than fit","caption")`,

table_wide: `root = Stack([t])\nt = Table(["Host","OS","Role","Address","State"],[["gpu-box-a","Ubuntu 24.04","Gateway host, HAProxy","198.51.100.76","up"],["work-pc-ubuntu","Ubuntu 24.04","Build runner, CI #12","198.51.100.2","down 8d"]])`,
dag_long: `root = Stack([d])\nd = Dag([a,b,c,e,f,g],[["a","b"],["b","c"],["c","e"],["e","f"],["f","g"]],"LR","Pipeline")\na = DagNode("a","Compile the frontend bundle","done")\nb = DagNode("b","Run the unit test suite","done")\nc = DagNode("c","Build the docker image","running")\ne = DagNode("e","Push to the registry","pending")\nf = DagNode("f","Deploy to staging now","pending")\ng = DagNode("g","Run smoke tests live","pending")`,
graph_long: `root = Stack([g])\ng = Graph([s,a,b,c,e],[e1,e2,e3,e4,e5],"LR","Release approval")\ns = GraphNode("s","change request","start")\na = GraphNode("a","Waiting for security review",null,"running")\nb = GraphNode("b","Approved by release manager")\nc = GraphNode("c","Rolled back, canary failed",null,"failed")\ne = GraphNode("e","released","end")\ne1 = GraphEdge("s","a")\ne2 = GraphEdge("a","b","all reviewers approved")\ne3 = GraphEdge("b","c","canary errors above 1 percent")\ne4 = GraphEdge("c","a","fixes pushed, review again")\ne5 = GraphEdge("b","e","rollout finished")`,
graph_tb_loops: `root = Stack([g])\ng = Graph([a,b,c],[e1,e2,e3,e4,e5],"TB","Loops")\na = GraphNode("a","A state with a long name")\nb = GraphNode("b","Another long state name")\nc = GraphNode("c","Third")\ne1 = GraphEdge("a","b","a long label on the way forward")\ne2 = GraphEdge("b","c","and another long label")\ne3 = GraphEdge("c","a","a long label on the way back")\ne4 = GraphEdge("b","b","a long self loop label")\ne5 = GraphEdge("c","b","back to the middle")`,
infra_long: `root = Stack([m])\nm = InfraMap([z1,z2,z3],[l1,l2,l3],"Fleet","LR")\nz1 = InfraZone("Clients",[n1,n2])\nz2 = InfraZone("Public edge",[n3,n4])\nz3 = InfraZone("GPU fleet",[n5])\nn1 = InfraNode("n1","Work laptop control","service","up","control plane; ops-ctl")\nn2 = InfraNode("n2","Work tablet sixth gen","service","unknown")\nn3 = InfraNode("n3","Cloudflare tunnel","cloud","up","ingress for the gateway")\nn4 = InfraNode("n4","Caddy reverse proxy","gateway","up","fronts all services")\nn5 = InfraNode("n5","gpu-box-a primary","service","up","HAProxy and Postgres")\nl1 = InfraLink("n1","n4","private")\nl2 = InfraLink("n3","n4","tunnel")\nl3 = InfraLink("n4","n5","/v1")`,
};

/** Components that must not lose text to an ellipsis at a phone width (30 columns and up). */
const NO_CUT = ["text_longword", "callout", "metric_row", "metric_row_wrap", "button_row", "card_nest", "tabs_many", "code_long", "markdown_wide", "faq_long", "choice_long", "image", "dag_long", "graph_long", "graph_tb_loops", "infra_long", "erd_wide"];
/** Components that keep a fixed cap on a label, at any width: a legend name or a slice label is cut at 24 characters, a chart axis label at 10. */
const CAPPED: Record<string, string> = {
	table_wide: "a column is squeezed to the user's minimum width (12 unless they set another) before the table scrolls; /openui-config changes it",
	bar_h: "the label column is at most 30% of the width; a longer category is cut",
	bar_v: "",
	line_many: "a legend entry is cut at 24 characters",
	area_many: "",
	pie_long: "a slice label is cut at 24 characters in the legend",
	radar_long: "an axis label is cut at 14 characters around the plot",
	geo: "a pin label is cut at 24 characters",
	sequence_many: "a participant head is cut at 22 characters",
};

const WIDTHS = [20, 30, 40, 50, 60, 80];
const draw = (src: string, width: number) => {
	const c = compile(src);
	assert.deepEqual(c.errors, [], "the audit source compiles");
	const { block } = renderTree(c.root!, width, newState());
	return { block, text: rowsToLines(block.rows).join("\n") };
};

test("every component is accounted for: it is in NO_CUT or CAPPED", () => {
	const all = Object.keys(SOURCES);
	for (const k of all) assert.ok(NO_CUT.includes(k) || k in CAPPED, `${k}: decide whether it may cut text`);
	for (const k of [...NO_CUT, ...Object.keys(CAPPED)]) assert.ok(k in SOURCES, `${k} has no source`);
});

test("every component's source covers the whole library", () => {
	const used = new Set<string>();
	for (const src of Object.values(SOURCES)) for (const m of src.matchAll(/\b([A-Z][A-Za-z]+)\(/g)) used.add(m[1]);
	for (const name of ["Stack", "Text", "Card", "Metric", "Table", "BarChart", "Callout", "Button", "Tabs", "Markdown", "CodeBlock", "Image", "Dag", "Graph", "Erd", "GeoMap", "Faq", "Choice", "LineChart", "AreaChart", "PieChart", "RadarChart", "InfraMap", "SequenceDiagram"]) assert.ok(used.has(name), `${name} is not in the audit`);
});

for (const key of Object.keys(SOURCES)) {
	test(`${key}: never wider than the pane, at 20 to 80 columns`, () => {
		for (const width of WIDTHS) {
			const { block } = draw(SOURCES[key], width);
			assert.ok(block.w <= width, `${key} at ${width}: block is ${block.w} wide`);
			for (const row of block.rows) assert.ok(row.length <= width, `${key} at ${width}: a row is ${row.length} wide`);
		}
	});
}

for (const key of NO_CUT) {
	test(`${key}: no text lost to an ellipsis from 30 columns up`, () => {
		for (const width of WIDTHS.filter((w) => w >= 30)) {
			const { text } = draw(SOURCES[key], width);
			assert.ok(!text.includes("…"), `${key} at ${width} cut something:\n${text}`);
		}
	});
}
