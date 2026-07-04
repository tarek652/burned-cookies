const DEFAULTS = { whitelist: [] };
const els = {
  manualEntry: document.getElementById("manualEntry"),
  addManual: document.getElementById("addManual"),
  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  exportList: document.getElementById("exportList"),
  importList: document.getElementById("importList"),
  status: document.getElementById("status")
};

const COMMON_SECOND_LEVEL_TLDS = new Set([
  "ac", "co", "com", "edu", "gov", "ltd", "me", "net", "nhs", "org", "plc", "police", "sch"
]);

function normalizeHost(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

function normalizeEntry(entry) {
  let value = String(entry || "").trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (value.startsWith("*.")) return "*." + normalizeHost(value.slice(2));
  return normalizeHost(value);
}

function baseDomainForEntry(entry) {
  entry = normalizeEntry(entry);
  const host = entry.startsWith("*.") ? entry.slice(2) : entry;
  const parts = host.split(".").filter(Boolean);

  if (parts.length <= 2) return host;

  const tld = parts[parts.length - 1];
  const secondLevel = parts[parts.length - 2];
  if (tld.length === 2 && COMMON_SECOND_LEVEL_TLDS.has(secondLevel) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

function groupWhitelist(list) {
  const groups = new Map();

  for (const entry of list) {
    const base = baseDomainForEntry(entry);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(entry);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([base, entries]) => [base, entries.sort((a, b) => a.localeCompare(b))]);
}

async function getWhitelist() {
  const data = await chrome.storage.local.get(DEFAULTS);
  return Array.isArray(data.whitelist) ? data.whitelist.map(normalizeEntry).filter(Boolean) : [];
}

async function setWhitelist(list) {
  const clean = [...new Set(list.map(normalizeEntry).filter(Boolean))].sort();
  await chrome.storage.local.set({ whitelist: clean });
  await render();
}

function setStatus(message) {
  els.status.textContent = message;
  window.setTimeout(() => {
    if (els.status.textContent === message) els.status.textContent = "";
  }, 2200);
}

async function addEntry(entry) {
  entry = normalizeEntry(entry);
  if (!entry) return setStatus("Enter a domain first.");
  const list = await getWhitelist();
  await setWhitelist([...list, entry]);
  els.manualEntry.value = "";
  setStatus("Whitelisted " + entry);
}

async function removeEntry(entry) {
  const list = await getWhitelist();
  await setWhitelist(list.filter((item) => item !== entry));
  setStatus("Removed " + entry);
}

function appendEntry(entry, parent) {
  const row = document.createElement("div");
  row.className = "entry";

  const text = document.createElement("span");
  text.textContent = entry;

  const remove = document.createElement("button");
  remove.textContent = "Delist";
  remove.className = "danger";
  remove.addEventListener("click", () => removeEntry(entry));

  row.append(text, remove);
  parent.appendChild(row);
}

async function render() {
  const whitelist = await getWhitelist();
  els.list.textContent = "";
  els.empty.style.display = whitelist.length ? "none" : "block";

  for (const [base, entries] of groupWhitelist(whitelist)) {
    const group = document.createElement("div");
    group.className = "group";

    const title = document.createElement("div");
    title.className = "groupTitle";
    title.textContent = base;
    group.appendChild(title);

    for (const entry of entries) appendEntry(entry, group);
    els.list.appendChild(group);
  }
}

els.addManual.addEventListener("click", () => addEntry(els.manualEntry.value));
els.manualEntry.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addEntry(els.manualEntry.value);
});

els.exportList.addEventListener("click", async () => {
  const whitelist = await getWhitelist();
  const blob = new Blob([JSON.stringify({ whitelist }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "burned-cookies-whitelist.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Exported whitelist.");
});

els.importList.addEventListener("change", async () => {
  const file = els.importList.files && els.importList.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const imported = Array.isArray(parsed) ? parsed : parsed.whitelist;
    if (!Array.isArray(imported)) throw new Error("Expected an array or { whitelist: [] }.");
    const current = await getWhitelist();
    await setWhitelist([...current, ...imported]);
    setStatus("Imported whitelist.");
  } catch (error) {
    setStatus("Import failed: " + error.message);
  } finally {
    els.importList.value = "";
  }
});

render();
