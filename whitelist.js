const ruleInput = document.getElementById("ruleInput");
const addButton = document.getElementById("addButton");
const clearSiteDataToggle = document.getElementById("clearSiteDataToggle");
const groupsEl = document.getElementById("groups");
const emptyState = document.getElementById("emptyState");
const exportButton = document.getElementById("exportButton");
const importInput = document.getElementById("importInput");
const statusEl = document.getElementById("status");

let state = { whitelist: [], clearSiteData: true };

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function normalizeRule(rule) {
  return String(rule || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.+$/, "");
}

function getBaseDomainFromRule(rule) {
  const clean = normalizeRule(rule).replace(/^\*\./, "");
  const parts = clean.split(".").filter(Boolean);
  return parts.length <= 2 ? clean : parts.slice(-2).join(".");
}

function isValidRule(rule) {
  const clean = normalizeRule(rule);
  if (!clean || clean.includes(" ")) {
    return false;
  }

  const domain = clean.replace(/^\*\./, "");
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

function setStatus(message) {
  statusEl.textContent = message;
  if (message) {
    setTimeout(() => {
      if (statusEl.textContent === message) {
        statusEl.textContent = "";
      }
    }, 2500);
  }
}

function groupedWhitelist() {
  const groups = new Map();

  for (const rule of state.whitelist) {
    const base = getBaseDomainFromRule(rule);
    if (!groups.has(base)) {
      groups.set(base, []);
    }
    groups.get(base).push(rule);
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function render() {
  groupsEl.textContent = "";
  emptyState.classList.toggle("hidden", state.whitelist.length > 0);
  clearSiteDataToggle.checked = state.clearSiteData !== false;

  for (const [base, rules] of groupedWhitelist()) {
    const group = document.createElement("section");
    const heading = document.createElement("h3");
    const list = document.createElement("ul");

    group.className = "group";
    heading.textContent = base;

    for (const rule of rules.sort()) {
      const item = document.createElement("li");
      const text = document.createElement("span");
      const button = document.createElement("button");

      text.textContent = rule;
      button.textContent = "Remove";
      button.className = "secondary";
      button.addEventListener("click", async () => {
        const response = await sendMessage({ type: "REMOVE_WHITELIST", rule });
        state.whitelist = response.whitelist || [];
        render();
        setStatus("Whitelist entry removed.");
      });

      item.append(text, button);
      list.append(item);
    }

    group.append(heading, list);
    groupsEl.append(group);
  }
}

async function addRule() {
  const rule = normalizeRule(ruleInput.value);

  if (!isValidRule(rule)) {
    setStatus("Enter a valid domain, such as example.com or *.example.com.");
    return;
  }

  const response = await sendMessage({ type: "ADD_WHITELIST", rule });
  state.whitelist = response.whitelist || [];
  ruleInput.value = "";
  render();
  setStatus(`${rule} added.`);
}

async function load() {
  state = await sendMessage({ type: "GET_STATE" });
  render();
}

addButton.addEventListener("click", addRule);
ruleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addRule();
  }
});

clearSiteDataToggle.addEventListener("change", async () => {
  state = await sendMessage({
    type: "SET_CLEAR_SITE_DATA",
    value: clearSiteDataToggle.checked
  });
  render();
  setStatus(clearSiteDataToggle.checked ? "Site data cleanup enabled." : "Site data cleanup disabled.");
});

exportButton.addEventListener("click", () => {
  const data = JSON.stringify({ whitelist: state.whitelist }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "burned-cookies-whitelist.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Whitelist exported.");
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const response = await sendMessage({
      type: "IMPORT_WHITELIST",
      whitelist: Array.isArray(data.whitelist) ? data.whitelist : []
    });
    state.whitelist = response.whitelist || [];
    render();
    setStatus("Whitelist imported.");
  } catch (_error) {
    setStatus("Import failed. Use a JSON file with a whitelist array.");
  } finally {
    importInput.value = "";
  }
});

load();
