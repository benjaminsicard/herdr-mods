import { spaces, panes, shared, setShared, run } from "herdr";

const KEY = "tab-titles.set";
const retryWaits = new Set();

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function titleFor(value) {
  const title = text(value);
  const prefix = title.match(/^[\s\u2800-\u28ff·✢✳✶✻✽◐-◓]+/)?.[0] ?? "";
  return /[\u2800-\u28ff·✢✳✶✻✽◐-◓]/.test(prefix) && /\s$/.test(prefix)
    ? title.slice(prefix.length) || title
    : title;
}

function folderName(value) {
  const cwd = text(value);
  if (!cwd) return null;
  const path = cwd.replace(/\\/g, "/");
  const bare = path.replace(/\/+$/, "");
  if (/^(\/home\/[^/]+|\/Users\/[^/]+|\/root)$/.test(bare) || /^[a-z]:\/Users\/[^/]+$/i.test(bare)) return "~";
  if (!bare) return "/";
  if (/^[a-z]:$/i.test(bare)) return `${bare}\\`;
  if (/^\/\/[^/]+\/[^/]+$/.test(bare)) return cwd.replace(/[\\/]+$/, "");
  return bare.split("/").pop();
}

function namesFor(tabPanes) {
  let best = null;
  let rank = 0;
  const defaults = new Set();
  for (const pane of tabPanes) {
    let name;
    let priority;
    if (pane.program?.shell) {
      name = folderName(pane.cwd);
      priority = 1;
    } else {
      const display = text(pane.program?.name);
      if (display) defaults.add(display);
      const title = titleFor(pane.title);
      const identity = title === text(pane.program?.key) || title === text(pane.app) || title === display;
      name = identity ? display || title : title;
      priority = name && !identity ? 3 : 2;
      name ||= display || text(pane.app);
    }
    if (name && priority > rank) {
      best = name;
      rank = priority;
    }
  }
  return { name: best, defaults };
}

function reconcile(tab, stored, name, defaults) {
  let record = typeof stored === "string" ? { mode: "auto", applied: stored } : stored;
  if (!tab.named && !(record?.mode === "pending" && !record.from.named)) {
    record = { mode: "auto", applied: null };
    retryWaits.delete(tab.id);
  }
  if (record?.mode === "pending") {
    if (tab.named && tab.name === record.target) {
      record = { mode: "auto", applied: record.target };
      retryWaits.delete(tab.id);
    } else if (tab.named === record.from.named && (!tab.named || tab.name === record.from.name)) {
      return { record, request: retryWaits.delete(tab.id) ? null : record.target };
    } else {
      retryWaits.delete(tab.id);
      return { record: { mode: "manual" }, request: null };
    }
  }
  if (record?.mode === "manual") return { record, request: null };
  if (record?.mode === "auto" && tab.named && tab.name !== record.applied) {
    return { record: { mode: "manual" }, request: null };
  }
  if (!record) {
    if (tab.named && !defaults.has(tab.name)) return { record: undefined, request: null };
    record = { mode: "auto", applied: tab.named ? tab.name : null };
  }
  return { record, request: record.mode === "auto" && name && (!tab.named || tab.name !== name) ? name : null };
}

export function syncNames() {
  const saved = shared(KEY) ?? {};
  const records = { ...saved };
  const tabs = new Map(spaces().flatMap(space => space.tabs).map(tab => [tab.id, tab]));
  const grouped = new Map();
  for (const pane of panes()) {
    if (!pane.terminal || !tabs.has(pane.tab)) continue;
    if (!grouped.has(pane.tab)) grouped.set(pane.tab, []);
    grouped.get(pane.tab).push(pane);
  }
  let failure;
  for (const [id, tabPanes] of grouped) {
    const tab = tabs.get(id);
    const { name, defaults } = namesFor(tabPanes);
    const { record, request } = reconcile(tab, records[id], name, defaults);
    if (record) records[id] = record;
    else delete records[id];
    if (!request) continue;
    try {
      run("tab.rename", { id, name: request });
      records[id] = {
        mode: "pending", applied: record.applied,
        from: record.mode === "pending" ? record.from : { named: tab.named, name: tab.name },
        target: request,
      };
      retryWaits.add(id);
    } catch (error) {
      failure ??= error;
    }
  }
  for (const id of Object.keys(records)) {
    if (!tabs.has(id)) delete records[id];
  }
  for (const id of retryWaits) {
    if (!tabs.has(id)) retryWaits.delete(id);
  }
  if (JSON.stringify(records) !== JSON.stringify(saved)) setShared(KEY, records);
  if (failure) throw failure;
}
