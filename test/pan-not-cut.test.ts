// "Pan rather than cut": when a diagram cannot fit the pane even with its shortest labels, it scrolls. It must not ALSO have
// cut its labels: a reader who scrolls to a node should find its whole name.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dag } from "../src/diagram/dag.ts";
import { erd } from "../src/diagram/erd.ts";
import { infra } from "../src/diagram/infra.ts";
import { rowsToLines } from "../src/diagram/canvas.ts";
import { sequence } from "../src/blocks/sequence.ts";
import { compile } from "../src/lang/library.ts";

const text = (rows: any) => rowsToLines(rows).join("\n");

test("Dag: a graph too wide for the pane keeps whole labels", () => {
	const names = ["Compile the frontend bundle", "Run the unit test suite", "Build the docker image", "Push to the registry", "Deploy to staging now", "Run smoke tests live"];
	const nodes = names.map((n, i) => ({ id: `n${i}`, label: n }));
	const edges = names.slice(1).map((_, i) => [`n${i}`, `n${i + 1}`]);
	const res = dag(nodes, edges, { direction: "LR", maxWidth: 40 });
	assert.ok(res.overflow, "it has to scroll at 40 columns");
	for (const n of names) assert.ok(text(res.rows).includes(n), `${n}\n${text(res.rows)}`);
});

test("InfraMap: a map too wide for the pane keeps whole labels and details", () => {
	const z = (name: string, nodes: any[]) => ({ name, nodes });
	const zones = [
		z("Clients", [{ id: "a", label: "Work laptop control", detail: "control plane; ops-ctl host" }]),
		z("Public edge", [{ id: "b", label: "Cloudflare tunnel", detail: "ingress for the gateway" }, { id: "c", label: "Caddy reverse proxy", detail: "fronts all the services" }]),
		z("GPU fleet", [{ id: "d", label: "gpu-box-a primary", detail: "HAProxy and Postgres" }]),
	];
	const res = infra(zones, [{ from: "a", to: "c", label: "private" }, { from: "b", to: "c", label: "tunnel" }, { from: "c", to: "d", label: "/v1" }], { direction: "LR", maxWidth: 40 });
	assert.ok(res.overflow);
	for (const s of ["Work laptop control", "Cloudflare tunnel", "Caddy reverse proxy", "gpu-box-a primary", "ingress for the gateway", "fronts all the services"]) assert.ok(text(res.rows).includes(s), `${s}\n${text(res.rows)}`);
});

test("Erd: an entity too wide for the pane keeps whole field lines", () => {
	const field = "email_verification_token_hash text UNIQUE NOT NULL";
	const res = erd([{ name: "users", fields: ["id uuid PK", field] }, { name: "orders", fields: ["id uuid PK", "user_id uuid FK"] }], [{ from: "users", to: "orders", kind: "1:N", label: "places" }], { maxWidth: 30 });
	assert.ok(res.overflow);
	const t = text(res.rows);
	assert.ok(t.includes("email_verification_token_hash") && t.includes("UNIQUE") && t.includes("NOT NULL"), `the whole field line, with its type and flags:\n${t}`);
});

test("SequenceDiagram: a diagram too wide for the pane keeps whole message labels", () => {
	const src = `root = Stack([s])
s = SequenceDiagram([a,b,c], [m1, m2])
a = SeqParticipant("a","Browser","actor")
b = SeqParticipant("b","API gateway","service")
c = SeqParticipant("c","Postgres primary","database")
m1 = SeqMessage("a","b","POST /v1/orders with a long label")
m2 = SeqMessage("b","c","select * from sessions where id = ?")`;
	const c = compile(src);
	assert.deepEqual(c.errors, []);
	const seq = (c.root!.props.children[0] as any);
	const r = sequence(seq, 30, "0.0");
	assert.ok(r.overflow, "it scrolls at 30 columns");
	const t = text(r.block.rows);
	assert.ok(t.includes("POST /v1/orders with a long label") && t.includes("select * from sessions where id = ?"), t);
	assert.ok(t.includes("Postgres primary") && t.includes("API gateway"), t);
});
