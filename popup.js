const currentDomainEl = document.getElementById("currentDomain");
const addExactButton = document.getElementById("addExactButton");
const addWildcardButton = document.getElementById("addWildcardButton");
const clearSiteDataToggle = document.getElementById("clearSiteDataToggle");
const cleanNowButton = document.getElementById("cleanNowButton");
const matchingList = document.getElementById("matchingList");
const emptyMatching = document.getElementById("emptyMatching");
const exportButton = document.getElementById("exportButton");
const importInput = document.getElementById("importInput");
const statusEl = document.getElementById("status");

let currentHostname = "";
let currentBaseDomain = "";
let state = { whitelist: [], clearSiteData: true };

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function normalizeDomain(domain) {
  return String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

function getBaseDomain(domain) {
  const parts = normalizeDomain(domain).split(".").filter(Boolean);
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

function hostnameMatchesRule(hostname, rule) {
  const host = normalizeDomain(hostname);
  const cleanRule = String(rule || "").trim().toLowerCase();

  if (cleanRule.startsWith("*.")) {
    const base = cleanRule.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }

  return host === cleanRule;
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

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderMatchingList() {
  matchingList.textContent = "";

  const matching = state.whitelist.filter((rule) => hostnameMatchesRule(currentHostname, rule));
  emptyMatching.classList.toggle("hidden", matching.length > 0);

  for (const rule of matching) {
    const item = document.createElement("li");
    const text = document.createElement("span");
    const removeButton = document.createElement("button");

    text.textContent = rule;
    removeButton.textContent = "Remove";
    removeButton.className = "secondary";
    removeButton.addEventListener("click", async () => {
      const response = await sendMessage({ type: "REMOVE_WHITELIST", rule });
      state.whitelist = response.whitelist || [];
      renderMatchingList();
      setStatus("Whitelist entry removed.");
    });

    item.append(text, removeButton);
    matchingList.append(item);
  }
}

async function load() {
  const tab = await getCurrentTab();

  try {
    const url = new URL(tab.url || "");
    if (url.protocol === "http:" || url.protocol === "https:") {
      currentHostname = normalizeDomain(url.hostname);
      currentBaseDomain = getBaseDomain(currentHostname);
      currentDomainEl.textContent = currentHostname;
      addExactButton.disabled = false;
      addWildcardButton.disabled = false;
    } else {
      currentDomainEl.textContent = "This page cannot be whitelisted.";
      addExactButton.disabled = true;
      addWildcardButton.disabled = true;
    }
  } catch (_error) {
    currentDomainEl.textContent = "This page cannot be whitelisted.";
    addExactButton.disabled = true;
    addWildcardButton.disabled = true;
  }

  state = await sendMessage({ type: "GET_STATE" });
  clearSiteDataToggle.checked = state.clearSiteData !== false;
  renderMatchingList();
}

addExactButton.addEventListener("click", async () => {
  if (!currentHostname) {
    return;
  }

  const response = await sendMessage({ type: "ADD_WHITELIST", rule: currentHostname });
  state.whitelist = response.whitelist || [];
  renderMatchingList();
  setStatus(`${currentHostname} added.`);
});

addWildcardButton.addEventListener("click", async () => {
  if (!currentBaseDomain) {
    return;
  }

  const rule = `*.${currentBaseDomain}`;
  const response = await sendMessage({ type: "ADD_WHITELIST", rule });
  state.whitelist = response.whitelist || [];
  renderMatchingList();
  setStatus(`${rule} added.`);
});

clearSiteDataToggle.addEventListener("change", async () => {
  state = await sendMessage({
    type: "SET_CLEAR_SITE_DATA",
    value: clearSiteDataToggle.checked
  });
  setStatus(clearSiteDataToggle.checked ? "Site data cleanup enabled." : "Site data cleanup disabled.");
});

cleanNowButton.addEventListener("click", async () => {
  cleanNowButton.disabled = true;
  await sendMessage({ type: "CLEAN_NOW" });
  cleanNowButton.disabled = false;
  setStatus("Cleanup complete.");
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
    renderMatchingList();
    setStatus("Whitelist imported.");
  } catch (_error) {
    setStatus("Import failed. Use a JSON file with a whitelist array.");
  } finally {
    importInput.value = "";
  }
});

load();
