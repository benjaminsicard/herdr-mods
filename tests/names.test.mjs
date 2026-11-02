import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SourceTextModule, SyntheticModule, createContext } from "node:vm";

const source = await readFile(new URL("../mods/auto-tabs/names.js", import.meta.url), "utf8");
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tab = (overrides = {}) => ({ id: "tab1", name: "1", named: false, ...overrides });
const pane = (overrides = {}) => ({
  tab: "tab1", terminal: "t1", title: "", cwd: "/home/user/project", app: null,
  program: { key: "shell", name: "zsh", shell: true, agent: false }, ...overrides,
});
const program = (name = "Codex", overrides = {}) => pane({
  program: { key: name.toLowerCase(), name, shell: false, agent: false }, ...overrides,
});

async function host({ tabs = [tab()], panes = [pane()], saved } = {}) {
  const state = { tabs, panes, saved: clone(saved), calls: [], writes: [], error: null };
  const context = createContext();
  const exports = {
    spaces: () => [{ tabs: state.tabs }],
    panes: () => state.panes,
    shared: key => { assert.equal(key, "tab-titles.set"); return clone(state.saved); },
    setShared: (key, value) => {
      assert.equal(key, "tab-titles.set");
      state.saved = clone(value);
      state.writes.push(clone(value));
    },
    run: (command, args) => {
      assert.equal(command, "tab.rename");
      if (state.error) throw state.error;
      state.calls.push(clone(args));
      return null;
    },
  };
  const mock = new SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  const module = new SourceTextModule(source, { context });
  await module.link(specifier => {
    assert.equal(specifier, "herdr");
    return mock;
  });
  await module.evaluate();
  state.poll = () => module.namespace.syncNames();
  state.ack = (call = state.calls.at(-1)) => {
    const target = state.tabs.find(item => item.id === call.id);
    Object.assign(target, { name: call.name, named: true });
  };
  state.settle = () => { state.poll(); state.ack(); state.poll(); };
  return state;
}

for (const name of ["Claude Code", "Codex", "OpenCode", "Grok Build", "Future Agent"]) {
  test(`${name} uses a title without agent registration or agent=true`, async () => {
    const h = await host({ tabs: [tab({ name, named: true })], panes: [program(name, { title: "Fix retries?!" })] });
    h.settle();
    assert.deepEqual(h.calls, [{ id: "tab1", name: "Fix retries?!" }]);
    assert.deepEqual(h.saved.tab1, { mode: "auto", applied: "Fix retries?!" });
  });
}

test("programs use configured names, raw identities, app fallback, and generic titles", async () => {
  for (const [p, expected] of [
    [program("Custom Assistant"), "Custom Assistant"],
    [program("Custom Assistant", { title: "custom-assistant", app: "custom-assistant" }), "Custom Assistant"],
    [program("Custom Assistant", { title: "custom assistant" }), "Custom Assistant"],
    [program("", { app: "unknown-tool" }), "unknown-tool"],
    [program("", { program: undefined, app: "unlisted-app", title: "   " }), "unlisted-app"],
    [program("Neovim", { title: "[README.md] + Neovim" }), "[README.md] + Neovim"],
  ]) {
    const h = await host({ panes: [p] });
    h.poll();
    assert.equal(h.calls[0].name, expected);
  }
});

test("shell transitions ignore the previous program's title", async () => {
  const h = await host({ panes: [program("Codex", { title: "Fix retries" })] });
  h.settle();
  h.panes = [pane({ title: "Fix retries", cwd: "/Users/user/other/" })];
  h.settle();
  assert.equal(h.tabs[0].name, "other");
  h.panes = [program("Python")];
  h.settle();
  assert.equal(h.tabs[0].name, "Python");
});

test("a launch label equal to its fallback is adopted before equality returns", async () => {
  const h = await host({ tabs: [tab({ name: "Codex", named: true })], panes: [program()] });
  h.poll();
  assert.deepEqual(h.saved.tab1, { mode: "auto", applied: "Codex" });
  assert.equal(h.calls.length, 0);
  h.panes[0].title = "A new topic";
  h.poll();
  assert.equal(h.calls.at(-1).name, "A new topic");
});

test("a launcher label is adopted after a slow program starts from its shell", async () => {
  const h = await host({ tabs: [tab({ name: "Codex", named: true })] });
  h.poll();
  assert.equal(h.calls.length, 0);
  h.panes = [program("Codex", { title: "Fix slow startup" })];
  h.poll();
  assert.deepEqual(h.calls, [{ id: "tab1", name: "Fix slow startup" }]);
  h.ack();
  h.poll();
  assert.equal(h.tabs[0].name, "Fix slow startup");
  h.panes = [pane()];
  h.settle();
  assert.equal(h.tabs[0].name, "project");
});

test("an unowned manual name equal to a title never gains automatic ownership", async () => {
  const h = await host({ tabs: [tab({ name: "Release", named: true })], panes: [program("Codex", { title: "Release" })] });
  h.poll();
  h.panes[0].title = "Next topic";
  h.poll();
  assert.equal(h.saved?.tab1, undefined);
  assert.equal(h.calls.length, 0);
});

test("manual overrides survive title equality and default labels until cleared", async () => {
  const h = await host({ panes: [program("Codex", { title: "Original" })] });
  h.settle();
  h.tabs[0].name = "My topic";
  h.panes[0].title = "My topic";
  h.poll();
  assert.deepEqual(h.saved.tab1, { mode: "manual" });
  h.tabs[0].name = "Codex";
  h.panes[0].title = "Changed";
  h.poll();
  assert.equal(h.calls.length, 1);
  Object.assign(h.tabs[0], { named: false, name: "1" });
  h.settle();
  assert.equal(h.tabs[0].name, "Changed");
});

test("legacy strings retain ownership, detect overrides, and prune closed tabs", async () => {
  const h = await host({
    tabs: [tab({ name: "Old", named: true }), tab({ id: "tab2", name: "Manual", named: true })],
    panes: [program("Codex", { title: "New" }), program("Other", { tab: "tab2", title: "Manual" })],
    saved: { tab1: "Old", tab2: "Generated", closed: "Gone" },
  });
  h.poll();
  assert.equal(h.saved.tab1.mode, "pending");
  assert.equal(h.saved.tab1.applied, "Old");
  assert.deepEqual(h.saved.tab2, { mode: "manual" });
  assert.equal(h.saved.closed, undefined);
  h.ack();
  h.poll();
  assert.deepEqual(h.saved.tab1, { mode: "auto", applied: "New" });
});

test("delayed commands wait, retry a dropped command, and coalesce changing titles", async () => {
  const h = await host({ panes: [program("Codex", { title: "First" })] });
  h.poll();
  assert.equal(h.saved.tab1.mode, "pending");
  assert.equal(h.saved.tab1.applied, null);
  const writes = h.writes.length;
  h.panes[0].title = "Newest";
  h.poll();
  assert.equal(h.calls.length, 1);
  assert.equal(h.writes.length, writes);
  h.poll();
  assert.deepEqual(h.calls, [{ id: "tab1", name: "First" }, { id: "tab1", name: "First" }]);
  assert.equal(h.writes.length, writes);
  h.ack();
  h.poll();
  assert.equal(h.calls.at(-1).name, "Newest");
  assert.equal(h.saved.tab1.applied, "First");
  h.ack();
  h.poll();
  const stableWrites = h.writes.length;
  const stableCalls = h.calls.length;
  h.poll();
  h.poll();
  assert.equal(h.writes.length, stableWrites);
  assert.equal(h.calls.length, stableCalls);
});

test("a pending named baseline respects an override or clear", async () => {
  for (const clear of [false, true]) {
    const h = await host({ tabs: [tab({ name: "Codex", named: true })], panes: [program("Codex", { title: "First" })] });
    h.poll();
    Object.assign(h.tabs[0], clear ? { name: "1", named: false } : { name: "Custom", named: true });
    h.panes[0].title = "Next";
    h.poll();
    assert.equal(h.calls.length, clear ? 2 : 1);
    assert.equal(h.saved.tab1.mode, clear ? "pending" : "manual");
    if (clear) assert.equal(h.calls.at(-1).name, "Next");
  }
});

test("unnamed pending baselines tolerate tab position changes", async () => {
  const h = await host({ panes: [program("Codex", { title: "Topic" })] });
  h.poll();
  h.tabs[0].name = "2";
  h.poll();
  assert.equal(h.calls.length, 1);
  assert.equal(h.saved.tab1.mode, "pending");
  h.poll();
  assert.equal(h.calls.length, 2);
});

test("synchronous command errors leave no false pending or applied success", async () => {
  const h = await host({ panes: [program("Codex", { title: "Topic" })] });
  h.error = new Error("queue failed");
  assert.throws(h.poll, /queue failed/);
  assert.deepEqual(h.saved.tab1, { mode: "auto", applied: null });
  h.error = null;
  h.settle();
  assert.deepEqual(h.saved.tab1, { mode: "auto", applied: "Topic" });
  h.panes[0].title = "Next";
  h.error = new Error("again");
  assert.throws(h.poll, /again/);
  assert.deepEqual(h.saved.tab1, { mode: "auto", applied: "Topic" });
});

test("manual names win before an automatic name has been applied", async () => {
  for (const queueFailure of [false, true]) {
    const h = await host({ panes: queueFailure ? [program("Codex", { title: "Topic" })] : [pane({ cwd: null })] });
    if (queueFailure) {
      h.error = new Error("initial queue failed");
      assert.throws(h.poll, /initial queue failed/);
      h.error = null;
    } else {
      h.poll();
    }
    Object.assign(h.tabs[0], { name: "Keep this name", named: true });
    h.panes = [pane()];
    h.poll();
    assert.deepEqual(h.calls, []);
    assert.equal(h.tabs[0].name, "Keep this name");
  }
});

test("split panes rank titles over program names over shells, with stable ties", async () => {
  const h = await host({ panes: [
    pane({ title: "Stale" }), program("Fallback"),
    program("Codex", { title: "First title" }), program("Claude Code", { title: "Second title", focused: true, status: "working" }),
  ] });
  h.settle();
  assert.equal(h.tabs[0].name, "First title");
  h.panes = [pane(), program("First fallback"), program("Second fallback")];
  h.settle();
  assert.equal(h.tabs[0].name, "First fallback");
});

test("all live non-shell display names in a tab qualify as launch defaults", async () => {
  const h = await host({ tabs: [tab({ name: "Other", named: true })], panes: [
    program("Codex", { title: "Topic" }), program("Other"),
  ] });
  h.poll();
  assert.equal(h.calls[0].name, "Topic");
});

test("shell display names do not count as launch defaults", async () => {
  const h = await host({ tabs: [tab({ name: "zsh", named: true })] });
  h.poll();
  assert.equal(h.calls.length, 0);
  assert.equal(h.saved?.tab1, undefined);
});

test("mod-only tabs and tabs without usable metadata remain unchanged", async () => {
  const h = await host({ tabs: [tab({ name: "Notes", named: true }), tab({ id: "empty" })], panes: [
    pane({ terminal: null, title: "Notes" }),
    pane({ tab: "empty", cwd: null, title: "Stale" }),
    program("Ghost", { tab: "closed" }),
  ], saved: { tab1: "Notes", gone: { mode: "manual" } } });
  h.poll();
  assert.equal(h.calls.length, 0);
  assert.equal(h.saved.tab1, "Notes");
  assert.equal(h.saved.gone, undefined);
  const writes = h.writes.length;
  h.poll();
  assert.equal(h.writes.length, writes);
});

test("folder names support conventional homes, filesystem roots, and path separators", async () => {
  for (const [cwd, expected] of [
    ["/home/user", "~"], ["/home/user/", "~"], ["/root", "~"], ["/rooted", "rooted"], ["/ROOT", "ROOT"],
    ["/Users/user/", "~"], ["C:\\Users\\User\\", "~"], ["C:/Users/User", "~"],
    ["/", "/"], ["C:\\", "C:\\"], ["D:/", "D:\\"],
    ["\\\\server\\share\\", "\\\\server\\share"], ["//server/share/", "//server/share"],
    ["C:\\Users\\User\\my project\\", "my project"], ["/Users/user/project//", "project"],
    ["/srv/custom-home", "custom-home"], ["~/project", "project"],
  ]) {
    const h = await host({ panes: [pane({ cwd, title: "Stale topic" })] });
    h.poll();
    assert.equal(h.calls[0].name, expected, cwd);
  }
});

test("titles preserve punctuation and remove only known leading spinner frames", async () => {
  for (const [title, expected] of [
    ["  [WIP] #42: Fix?  ", "[WIP] #42: Fix?"], ["✓ build passed", "✓ build passed"],
    ["!important", "!important"], ["/api/v1", "/api/v1"], ["✨ custom", "✨ custom"],
    ["✳ Fix retries", "Fix retries"], ["⠋ Fix retries", "Fix retries"],
    ["✳No space", "✳No space"], ["✳", "✳"], ["✳ [WIP]", "[WIP]"],
  ]) {
    const h = await host({ panes: [program("Unknown", { title })] });
    h.poll();
    assert.equal(h.calls[0].name, expected, title);
  }
});
