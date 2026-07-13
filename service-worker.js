const DEFAULT_STATE = {
  whitelist: [],
  clearSiteData: true,
  knownOrigins: []
};

const tabUrls = new Map();

function isHttpUrl(url) {
  return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
}

function parseUrl(url) {
  try {
    return new URL(url);
  } catch (_error) {
    return null;
  }
}

function normalizeDomain(domain) {
  return String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

function normalizeRule(rule) {
  return String(rule || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.+$/, "");
}

function getBaseDomain(domain) {
  const clean = normalizeDomain(domain);
  const parts = clean.split(".").filter(Boolean);
  if (parts.length <= 2) {
    return clean;
  }
  return parts.slice(-2).join(".");
}

function hostnameMatchesRule(hostname, rule) {
  const host = normalizeDomain(hostname);
  const cleanRule = normalizeRule(rule);

  if (!host || !cleanRule) {
    return false;
  }

  if (cleanRule.startsWith("*.")) {
    const base = cleanRule.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }

  return host === cleanRule;
}

async function getState() {
  const state = await chrome.storage.local.get(DEFAULT_STATE);
  return {
    whitelist: Array.isArray(state.whitelist) ? state.whitelist.map(normalizeRule).filter(Boolean) : [],
    clearSiteData: state.clearSiteData !== false,
    knownOrigins: Array.isArray(state.knownOrigins) ? state.knownOrigins.filter(Boolean) : []
  };
}

async function setWhitelist(whitelist) {
  const clean = [...new Set((whitelist || []).map(normalizeRule).filter(Boolean))].sort();
  await chrome.storage.local.set({ whitelist: clean });
  return clean;
}

async function isDomainWhitelisted(domain) {
  const { whitelist } = await getState();
  return whitelist.some((rule) => hostnameMatchesRule(domain, rule));
}

function cookieUrl(cookie) {
  const domain = normalizeDomain(cookie.domain);
  const scheme = cookie.secure ? "https" : "http";
  const path = cookie.path || "/";
  return `${scheme}://${domain}${path}`;
}

async function removeCookie(cookie) {
  try {
    await chrome.cookies.remove({
      url: cookieUrl(cookie),
      name: cookie.name,
      storeId: cookie.storeId
    });
  } catch (error) {
    console.warn("Failed to remove cookie", cookie.name, cookie.domain, error);
  }
}

async function removeNonWhitelistedCookies() {
  const { whitelist } = await getState();
  const cookies = await chrome.cookies.getAll({});

  await Promise.all(
    cookies.map(async (cookie) => {
      const domain = normalizeDomain(cookie.domain);
      const keep = whitelist.some((rule) => hostnameMatchesRule(domain, rule));
      if (!keep) {
        await removeCookie(cookie);
      }
    })
  );
}

async function rememberOrigin(origin) {
  if (!origin || !origin.startsWith("http")) {
    return;
  }

  const { knownOrigins } = await getState();
  if (knownOrigins.includes(origin)) {
    return;
  }

  const next = [...knownOrigins, origin].slice(-1000);
  await chrome.storage.local.set({ knownOrigins: next });
}

async function forgetOrigin(origin) {
  const { knownOrigins } = await getState();
  const next = knownOrigins.filter((item) => item !== origin);
  if (next.length !== knownOrigins.length) {
    await chrome.storage.local.set({ knownOrigins: next });
  }
}

async function clearSiteDataForOrigin(origin) {
  const { clearSiteData } = await getState();
  if (!clearSiteData || !origin || !origin.startsWith("http")) {
    return;
  }

  try {
    await chrome.browsingData.remove(
      { origins: [origin] },
      {
        cache: true,
        cacheStorage: true,
        cookies: true,
        fileSystems: true,
        indexedDB: true,
        localStorage: true,
        serviceWorkers: true,
        webSQL: true
      }
    );
    await forgetOrigin(origin);
  } catch (error) {
    console.warn("Failed to clear site data for origin", origin, error);
  }
}

function relatedHostnames(a, b) {
  const first = normalizeDomain(a);
  const second = normalizeDomain(b);

  if (!first || !second) {
    return false;
  }

  const firstBase = getBaseDomain(first);
  const secondBase = getBaseDomain(second);
  return firstBase === secondBase;
}

async function hasRelatedOpenTab(hostname) {
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    const url = parseUrl(tab.url);
    if (!url || !isHttpUrl(url.href)) {
      continue;
    }

    if (relatedHostnames(hostname, url.hostname)) {
      return true;
    }
  }

  return false;
}

async function cleanKnownNonWhitelistedOrigins() {
  const { whitelist, knownOrigins, clearSiteData } = await getState();
  if (!clearSiteData) {
    return;
  }

  for (const origin of knownOrigins) {
    const url = parseUrl(origin);
    if (!url) {
      continue;
    }

    const keep = whitelist.some((rule) => hostnameMatchesRule(url.hostname, rule));
    if (!keep) {
      await clearSiteDataForOrigin(origin);
    }
  }
}

async function cleanCookiesAndKnownSiteData() {
  await removeNonWhitelistedCookies();
  await cleanKnownNonWhitelistedOrigins();
}

chrome.runtime.onInstalled.addListener(async () => {
  const state = await chrome.storage.local.get(DEFAULT_STATE);
  await chrome.storage.local.set({
    whitelist: Array.isArray(state.whitelist) ? state.whitelist : DEFAULT_STATE.whitelist,
    clearSiteData: state.clearSiteData !== false,
    knownOrigins: Array.isArray(state.knownOrigins) ? state.knownOrigins : DEFAULT_STATE.knownOrigins
  });

  await cleanCookiesAndKnownSiteData();
});

chrome.runtime.onStartup.addListener(async () => {
  await cleanCookiesAndKnownSiteData();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (!isHttpUrl(url)) {
    return;
  }

  tabUrls.set(tabId, url);
  const parsed = parseUrl(url);
  if (parsed) {
    await rememberOrigin(parsed.origin);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isHttpUrl(tab.url)) {
      return;
    }

    tabUrls.set(tabId, tab.url);
    const parsed = parseUrl(tab.url);
    if (parsed) {
      await rememberOrigin(parsed.origin);
    }
  } catch (_error) {
    // Ignore tabs that no longer exist.
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const oldUrl = tabUrls.get(tabId);
  tabUrls.delete(tabId);

  if (!isHttpUrl(oldUrl)) {
    return;
  }

  const url = parseUrl(oldUrl);
  if (!url) {
    return;
  }

  const whitelisted = await isDomainWhitelisted(url.hostname);
  if (whitelisted) {
    return;
  }

  const stillOpen = await hasRelatedOpenTab(url.hostname);
  if (!stillOpen) {
    await clearSiteDataForOrigin(url.origin);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "GET_STATE") {
      sendResponse(await getState());
      return;
    }

    if (message?.type === "SET_CLEAR_SITE_DATA") {
      await chrome.storage.local.set({ clearSiteData: Boolean(message.value) });
      sendResponse(await getState());
      return;
    }

    if (message?.type === "ADD_WHITELIST") {
      const { whitelist } = await getState();
      const next = await setWhitelist([...whitelist, message.rule]);
      sendResponse({ whitelist: next });
      return;
    }

    if (message?.type === "REMOVE_WHITELIST") {
      const { whitelist } = await getState();
      const target = normalizeRule(message.rule);
      const next = await setWhitelist(whitelist.filter((rule) => rule !== target));
      sendResponse({ whitelist: next });
      return;
    }

    if (message?.type === "IMPORT_WHITELIST") {
      const list = Array.isArray(message.whitelist) ? message.whitelist : [];
      const next = await setWhitelist(list);
      sendResponse({ whitelist: next });
      return;
    }

    if (message?.type === "CLEAN_NOW") {
      await cleanCookiesAndKnownSiteData();
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ error: "Unknown message" });
  })();

  return true;
});
