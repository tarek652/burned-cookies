# Burned Cookies

[![Available in the Chrome Web Store](https://developer.chrome.com/static/docs/webstore/branding/image/iNEddTyWiMfLSwFD6qGq.png)](https://chrome.google.com/webstore/detail/ifopkpnjofinfenbgdmjgiflgcfcplad)

Burned Cookies is a small Manifest V3 browser extension for Brave and Chromium-based browsers. It automatically removes cookies and site data that are not on your whitelist.

It is intentionally simple: whitelist the sites you want to keep, and Burned Cookies clears everything else on install, on browser startup, and when the last tab for a non-whitelisted site is closed.

## Features

- Delete all non-whitelisted cookies on extension install.
- Delete all non-whitelisted cookies on browser startup.
- Delete cookies for a site when its last related tab is closed, unless that site is whitelisted.
- Delete non-whitelisted site data by default when a site's last related tab is closed.
- Site data cleanup removes localStorage, IndexedDB, Cache Storage, service workers, browser cache, File System storage, and WebSQL where supported.
- Site data cleanup can be turned off from the popup or whitelist manager.
- Whitelist the current domain from the popup.
- Whitelist wildcard domains such as `*.example.com`.
- Remove whitelist entries.
- Popup only shows whitelist entries that apply to the current tab.
- Full whitelist manager opens in a separate tab.
- Full whitelist view groups entries by base domain.
- Export the whitelist to JSON.
- Import the whitelist from JSON.
- Manifest V3 compatible.

## Privacy cleanup behavior

By default, Burned Cookies removes both cookies and site data for non-whitelisted sites.

This improves privacy, but it may also reset site preferences, remove offline web app data, clear cached content, unregister service workers, and sign you out of more sites. You can turn site data cleanup off from the popup or the full whitelist manager.

Cookie cleanup runs globally on install and browser startup. Site-data cleanup runs per known origin, especially when the last related tab for a non-whitelisted site is closed.

## Browser support

Burned Cookies is built for:

- Brave
- Chromium-based browsers that support Manifest V3 extensions

It is not designed for Firefox in its current form.

## Installation from Chrome Web Store

You can install Burned Cookies from the Chrome Web Store:

[![Available in the Chrome Web Store](https://developer.chrome.com/static/docs/webstore/branding/image/iNEddTyWiMfLSwFD6qGq.png)](https://chrome.google.com/webstore/detail/ifopkpnjofinfenbgdmjgiflgcfcplad)

## Installation for local testing

1. Download or clone this repository.
2. Open Brave or Chrome.
3. Go to `brave://extensions/` or `chrome://extensions/`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extension folder that contains `manifest.json`.

The extension should now appear in the browser toolbar.

## How it works

### First install

When Burned Cookies is installed, it immediately checks all browser cookies and removes any cookie that does not match the whitelist.

On a fresh install, the whitelist is empty, so all existing cookies are removed.

### Browser startup

When Brave or Chrome starts, Burned Cookies again removes cookies that are not whitelisted.

### Tab close cleanup

When a tab is closed, Burned Cookies checks whether any other open tab still belongs to the same site. If no related tab is open and the site is not whitelisted, cookies and site data for that origin are removed.

## Whitelist rules

Burned Cookies supports two simple whitelist formats.

### Exact domain

```text
example.com
```

This keeps cookies and site data for `example.com`.

### Wildcard domain

```text
*.example.com
```

This keeps cookies and site data for `example.com` and its subdomains, such as:

```text
www.example.com
login.example.com
app.example.com
```

## Import and export format

The whitelist is exported as JSON.

Example:

```json
{
  "whitelist": [
    "example.com",
    "*.example.com",
    "another-site.com"
  ]
}
```

You can import a JSON file with the same structure from the popup or from the full whitelist manager page.

## Permissions

Burned Cookies requests these permissions:

- `cookies` — required to read and delete cookies.
- `storage` — required to save the whitelist and settings.
- `tabs` — required to detect tab URLs and clean cookies/site data when tabs close.
- `browsingData` — required to remove non-whitelisted site data such as localStorage, IndexedDB, Cache Storage, service workers, and cache.
- `<all_urls>` host permission — required so cleanup can work across sites.

## Project structure

```text
.
├── LICENSE
├── README.md
├── manifest.json
├── service-worker.js
├── popup.html
├── popup.css
├── popup.js
├── whitelist.html
├── whitelist.css
├── whitelist.js
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Limitations

Burned Cookies is intentionally minimal. It does not include advanced Cookie AutoDelete-style features such as:

- Greylist timers
- Cleanup logs
- Public suffix list parsing
- Expression rules
- Container support
- Per-cookie rules
- Sync storage

The extension uses a simple base-domain heuristic for related tab detection and grouping. It does not use the Public Suffix List.

## Development

After editing files, reload the extension from `brave://extensions/` or `chrome://extensions/`.

For debugging, open the extension service worker from the extension card in Developer mode and check the console.

## License

Burned Cookies is released under the MIT License. See [LICENSE](LICENSE) for details.
