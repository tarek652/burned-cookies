const DEFAULTS = { whitelist: [] };
const els = {
  currentHost: document.getElementById("currentHost"),
  addExact: document.getElementById("addExact"),
  addWildcard: document.getElementById("addWildcard"),
  manualEntry: document.getElementById("manualEntry"),
  addManual: document.getElementById("addManual"),
  listTitle: document.getElementById("listTitle"),
  openFullList: document.getElementById("openFullList"),
  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  exportList: document.getElementById("exportList"),
  importList: document.getElementById("importList"),
  status: document.getElementById("status")
};

let currentHost = "";

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


const COMMON_SECOND_LEVEL_TLDS = new Set([
  "ac", "co", "com", "edu", "gov", "ltd", "me", "net", "nhs", "org", "plc", "police", "sch"
]);

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

function appendWhitelistItem(entry, parent) {
  const li = document.createElement("li");
  const text = document.createElement("span");
  const remove = document.createElement("button");
  text.textContent = entry;
  remove.textContent = "Delist";
  remove.className = "danger";
  remove.addEventListener("click", () => removeEntry(entry));
  li.append(text, remove);
  parent.appendChild(li);
}

function wildcardForHost(host) {
  host = normalizeHost(host);
  if (!host) return "";
  return "*." + baseDomainForEntry(host);
}

function entryMatchesHost(entry, host) {
  entry = normalizeEntry(entry);
  host = normalizeHost(host);
  if (!entry || !host) return false;

  if (entry.startsWith("*.")) {
    const base = entry.slice(2);
    return host === base || host.endsWith("." + base);
  }

  return host === entry;
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
  }, 1800);
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

async function render() {
  const fullList = await getWhitelist();
  const visibleList = fullList.filter((entry) => entryMatchesHost(entry, currentHost));

  els.listTitle.textContent = "Whitelist for current domain";
  els.empty.textContent = currentHost
    ? "Nothing whitelisted for this domain."
    : "Open a website tab to see matching whitelist entries.";

  els.list.textContent = "";
  els.empty.style.display = visibleList.length ? "none" : "block";

  for (const entry of visibleList) appendWhitelistItem(entry, els.list);
}

async function detectCurrentHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab.url || "");
    if (url.protocol === "http:" || url.protocol === "https:") currentHost = normalizeHost(url.hostname);
  } catch {
    currentHost = "";
  }

  els.currentHost.textContent = currentHost || "No website tab selected";
  els.addExact.disabled = !currentHost;
  els.addWildcard.disabled = !currentHost;
}

els.addExact.addEventListener("click", () => addEntry(currentHost));
els.addWildcard.addEventListener("click", () => addEntry(wildcardForHost(currentHost)));
els.addManual.addEventListener("click", () => addEntry(els.manualEntry.value));
els.manualEntry.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addEntry(els.manualEntry.value);
});

els.openFullList.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("whitelist.html") });
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

(async function init() {
  await detectCurrentHost();
  await render();
})();
