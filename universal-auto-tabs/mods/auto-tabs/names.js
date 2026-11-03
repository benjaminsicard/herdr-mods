import { spaces, panes, shared, setShared, run } from "herdr";

const KEY = "tab-titles.set";
const SPACE_KEY = "space-titles.set";
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

// Renames each item whose reconciled record asks for it, then drops records of
// items that are gone. Space and tab ids differ, so they share retryWaits.
function apply(command, items, records, wanted) {
  let failure;
  for (const [id, item] of items) {
    if (!wanted.has(id)) continue;
    const { name, defaults } = wanted.get(id);
    const { record, request } = reconcile(item, records[id], name, defaults);
    if (record) records[id] = record;
    else delete records[id];
    if (!request) continue;
    try {
      run(command, { id, name: request });
      records[id] = {
        mode: "pending", applied: record.applied,
        from: record.mode === "pending" ? record.from : { named: item.named, name: item.name },
        target: request,
      };
      retryWaits.add(id);
    } catch (error) {
      failure ??= error;
    }
  }
  for (const id of Object.keys(records)) {
    if (!items.has(id)) delete records[id];
  }
  return failure;
}

function save(key, records, saved) {
  if (JSON.stringify(records) !== JSON.stringify(saved)) setShared(key, records);
}

export function syncNames() {
  const saved = shared(KEY) ?? {};
  const records = { ...saved };
  const allSpaces = spaces();
  const tabs = new Map(allSpaces.flatMap(space => space.tabs).map(tab => [tab.id, tab]));
  const grouped = new Map();
  for (const pane of panes()) {
    if (!pane.terminal || !tabs.has(pane.tab)) continue;
    if (!grouped.has(pane.tab)) grouped.set(pane.tab, []);
    grouped.get(pane.tab).push(pane);
  }
  const tabNames = new Map([...grouped].map(([id, tabPanes]) => [id, namesFor(tabPanes)]));
  let failure = apply("tab.rename", tabs, records, tabNames);
  save(KEY, records, saved);

  // A space follows its active tab: the name that tab shows once automatic naming
  // lands. Herdr's own repo or folder name for a space counts as its default.
  const spaceSaved = shared(SPACE_KEY) ?? {};
  const spaceRecords = { ...spaceSaved };
  const spaceMap = new Map(allSpaces.map(space => [space.id, space]));
  const spaceNames = new Map();
  for (const space of allSpaces) {
    const tab = space.tabs.find(item => item.active);
    if (!tab) continue;
    const mode = records[tab.id]?.mode;
    const auto = mode === "auto" || mode === "pending" ? tabNames.get(tab.id)?.name : null;
    const name = auto || (tab.named ? tab.name : null);
    const defaults = new Set([folderName(space.folder)]);
    for (const pane of space.tabs.flatMap(item => grouped.get(item.id) ?? [])) defaults.add(folderName(pane.cwd));
    defaults.delete(null);
    spaceNames.set(space.id, { name, defaults });
  }
  failure ??= apply("space.rename", spaceMap, spaceRecords, spaceNames);
  save(SPACE_KEY, spaceRecords, spaceSaved);

  for (const id of retryWaits) {
    if (!tabs.has(id) && !spaceMap.has(id)) retryWaits.delete(id);
  }
  if (failure) throw failure;
}
