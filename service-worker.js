const DEFAULTS = { whitelist: [] };

function normalizeHost(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

function hostFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return normalizeHost(parsed.hostname);
  } catch {
    return "";
  }
}

function normalizeEntry(entry) {
  let value = String(entry || "").trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (value.startsWith("*.")) return "*." + normalizeHost(value.slice(2));
  return normalizeHost(value);
}

async function getWhitelist() {
  const data = await chrome.storage.local.get(DEFAULTS);
  return Array.isArray(data.whitelist) ? data.whitelist.map(normalizeEntry).filter(Boolean) : [];
}

function isWhitelisted(host, whitelist) {
  host = normalizeHost(host);
  if (!host) return false;

  return whitelist.some((entry) => {
    entry = normalizeEntry(entry);
    if (!entry) return false;

    if (entry.startsWith("*.")) {
      const base = entry.slice(2);
      return host === base || host.endsWith("." + base);
    }

    return host === entry;
  });
}

function cookieDomain(cookie) {
  return normalizeHost(cookie.domain || "");
}

function domainsRelated(a, b) {
  a = normalizeHost(a);
  b = normalizeHost(b);
  if (!a || !b) return false;
  return a === b || a.endsWith("." + b) || b.endsWith("." + a);
}

async function rememberTab(tabId, url) {
  const host = hostFromUrl(url);
  if (!host) return;
  await chrome.storage.session.set({ ["tab:" + tabId]: host });
}

async function forgetTab(tabId) {
  await chrome.storage.session.remove("tab:" + tabId);
}

async function getRememberedHost(tabId) {
  const key = "tab:" + tabId;
  const data = await chrome.storage.session.get(key);
  return normalizeHost(data[key]);
}

async function openHosts() {
  const tabs = await chrome.tabs.query({});
  return tabs.map((tab) => hostFromUrl(tab.url || tab.pendingUrl || "")).filter(Boolean);
}

function cookieUrl(cookie) {
  const scheme = cookie.secure ? "https://" : "http://";
  const domain = cookieDomain(cookie);
  return scheme + domain + (cookie.path || "/");
}

async function deleteCookie(cookie) {
  try {
    await chrome.cookies.remove({
      url: cookieUrl(cookie),
      name: cookie.name,
      storeId: cookie.storeId
    });
  } catch (error) {
    console.warn("Could not remove cookie", cookie, error);
  }
}


async function cleanupAllNonWhitelistedCookies() {
  const whitelist = await getWhitelist();
  const cookies = await chrome.cookies.getAll({});
  const removals = [];

  for (const cookie of cookies) {
    const domain = cookieDomain(cookie);
    if (!domain) continue;

    // Keep cookies covered by exact entries like example.com or wildcard entries like *.example.com.
    if (isWhitelisted(domain, whitelist)) continue;

    removals.push(deleteCookie(cookie));
  }

  await Promise.allSettled(removals);
}

async function cleanupForClosedHost(closedHost) {
  closedHost = normalizeHost(closedHost);
  if (!closedHost) return;

  const whitelist = await getWhitelist();
  const currentlyOpenHosts = await openHosts();
  const cookies = await chrome.cookies.getAll({});
  const removals = [];

  for (const cookie of cookies) {
    const domain = cookieDomain(cookie);
    if (!domainsRelated(domain, closedHost)) continue;

    // Keep anything covered by either exact entries like example.com or wildcard entries like *.example.com.
    if (isWhitelisted(domain, whitelist)) continue;

    // Avoid deleting cookies while another related tab is still open.
    const stillOpen = currentlyOpenHosts.some((host) => domainsRelated(host, domain));
    if (stillOpen) continue;

    removals.push(deleteCookie(cookie));
  }

  await Promise.allSettled(removals);
}

async function rememberOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => rememberTab(tab.id, tab.url || tab.pendingUrl || "")));
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(DEFAULTS);
  if (!Array.isArray(data.whitelist)) await chrome.storage.local.set(DEFAULTS);

  await rememberOpenTabs();
  await cleanupAllNonWhitelistedCookies();
});

chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get(DEFAULTS);
  if (!Array.isArray(data.whitelist)) await chrome.storage.local.set(DEFAULTS);

  await rememberOpenTabs();
  await cleanupAllNonWhitelistedCookies();
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id && (tab.url || tab.pendingUrl)) rememberTab(tab.id, tab.url || tab.pendingUrl);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url || tab.pendingUrl;
  if (url) rememberTab(tabId, url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await rememberTab(tabId, tab.url || tab.pendingUrl || "");
  } catch {
    // Tab disappeared before it could be read.
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const host = await getRememberedHost(tabId);
  await forgetTab(tabId);
  await cleanupForClosedHost(host);
});
