import assert from "node:assert/strict";
import test from "node:test";
import { alertFor, diff, isLooking, message } from "../mods/desktop-notifications/alerts.js";

const agent = (o = {}) => ({
  address: "t1", space: "sp1", tab: "tb1", space_name: "acme-api", tab_name: "Fix login redirect",
  title: "Fix login redirect", status: "idle", app: "claude-code", program: { name: "Claude Code" }, ...o,
});
const away = { focus: { space: "sp1", tab: "tb9" }, windowActive: true };
const here = { focus: { space: "sp1", tab: "tb1" }, windowActive: true };
const background = { focus: { space: "sp1", tab: "tb1" }, windowActive: false };

// Runs a status sequence through diff, collecting what it posts and clears.
function run(statuses, ctx = away, extra = {}) {
  let known = null;
  const posts = [], clears = [];
  for (const status of statuses) {
    const r = diff(known, [agent({ status })], { ...ctx, ...extra });
    known = r.known;
    posts.push(...r.post.map((p) => p.alert));
    clears.push(...r.clear);
  }
  return { posts, clears };
}

test("alertFor follows Herdr's attention rule", () => {
  assert.equal(alertFor("working", "blocked", true), "blocked");
  assert.equal(alertFor("idle", "blocked", false), "blocked");
  assert.equal(alertFor("blocked", "blocked", false), null);
  assert.equal(alertFor("working", "done", false), "done");
  assert.equal(alertFor("working", "idle", false), "done");
  assert.equal(alertFor("blocked", "done", false), "done");
  assert.equal(alertFor("working", "idle", true), null);
  assert.equal(alertFor("idle", "working", false), null);
  assert.equal(alertFor("done", "idle", false), null);
});

test("looking means the window is in front and the agent's tab is shown", () => {
  assert.equal(isLooking(agent(), here.focus, true), true);
  assert.equal(isLooking(agent(), here.focus, false), false);
  assert.equal(isLooking(agent(), away.focus, true), false);
  assert.equal(isLooking(agent(), null, true), false);
});

test("the first look only records", () => {
  const r = diff(null, [agent({ status: "blocked" })], away);
  assert.deepEqual(r.post, []);
  assert.equal(r.known.get("t1").status, "blocked");
});

test("a blocked agent posts even while you look at it, like Herdr's sound", () => {
  assert.deepEqual(run(["working", "blocked"], here).posts, ["blocked"]);
});

test("finishing posts only when you weren't looking", () => {
  assert.deepEqual(run(["working", "done"], away).posts, ["done"]);
  assert.deepEqual(run(["working", "idle"], here).posts, []);
  assert.deepEqual(run(["working", "idle"], background).posts, ["done"]);
});

test("a posted notification clears once the agent moves on", () => {
  assert.deepEqual(run(["working", "blocked", "working"]).clears, ["t1"]);
  assert.deepEqual(run(["working", "done", "idle"]).clears, ["t1"]);
  assert.deepEqual(run(["working", "blocked", "done"]).clears, []);
});

test("a vanished agent clears its notification", () => {
  let r = diff(null, [agent({ status: "working" })], away);
  r = diff(r.known, [agent({ status: "blocked" })], away);
  r = diff(r.known, [], away);
  assert.deepEqual(r.clear, ["t1"]);
});

test("sub-agents never post", () => {
  assert.deepEqual(run(["working", "blocked"], away, { subAgents: new Set(["t1"]) }).posts, []);
});

test("props can turn off either kind", () => {
  assert.deepEqual(run(["working", "blocked", "working", "done"], away, { want: { done: false } }).posts, ["blocked"]);
  assert.deepEqual(run(["working", "blocked", "working", "done"], away, { want: { blocked: false } }).posts, ["done"]);
});

test("messages use the program, space and tab", () => {
  assert.deepEqual(message(agent(), "blocked"), { title: "Claude Code needs you", subtitle: "acme-api / Fix login redirect", body: "Fix login redirect" });
  assert.equal(message(agent({ program: {}, app: null }), "done").title, "An agent finished");
  assert.equal(message(agent({ space_name: "Fix login redirect" }), "done").subtitle, "Fix login redirect");
  assert.equal(message(agent({ title: "" , tab_name: "" }), "done").body, "Claude Code");
});
