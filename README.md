# Burned Cookies

Burned Cookies is a small Manifest V3 browser extension for Brave and Chromium-based browsers. It automatically removes cookies that are not on your whitelist.

It is intentionally simple: whitelist the sites you want to keep, and Burned Cookies clears everything else on install, on browser startup, and when the last tab for a non-whitelisted site is closed.

## Features

- Delete all non-whitelisted cookies on extension install.
- Delete all non-whitelisted cookies on browser startup.
- Delete cookies for a site when its last related tab is closed, unless that site is whitelisted.
- Whitelist the current domain from the popup.
- Whitelist wildcard domains such as `*.example.com`.
- Remove whitelist entries.
- Popup only shows whitelist entries that apply to the current tab.
- Full whitelist manager opens in a separate tab.
- Full whitelist view groups entries by base domain.
- Export the whitelist to JSON.
- Import the whitelist from JSON.
- Manifest V3 compatible.

## Browser support

Burned Cookies is built for:

- Brave
- Chromium-based browsers that support Manifest V3 extensions

It is not designed for Firefox in its current form.

## Installation for local testing

1. Download or clone this repository.
2. Open Brave.
3. Go to `brave://extensions/`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extension folder that contains `manifest.json`.

The extension should now appear in the browser toolbar.

## How it works

### First install

When Burned Cookies is installed, it immediately checks all browser cookies and removes any cookie that does not match the whitelist.

On a fresh install, the whitelist is empty, so all existing cookies are removed.

### Browser startup

When Brave starts, Burned Cookies again removes cookies that are not whitelisted.

### Tab close cleanup

When a tab is closed, Burned Cookies checks whether any other open tab still belongs to the same site. If no related tab is open and the site is not whitelisted, cookies for that site are removed.

## Whitelist rules

Burned Cookies supports two simple whitelist formats.

### Exact domain

```text
example.com
```

This keeps cookies for `example.com`.

### Wildcard domain

```text
*.example.com
```

This keeps cookies for `example.com` and its subdomains, such as:

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
- `storage` — required to save the whitelist.
- `tabs` — required to detect tab URLs and clean cookies when tabs close.
- `<all_urls>` host permission — required so cookie cleanup can work across sites.

## Project structure

```text
.
├── LICENSE
├── manifest.json
├── service-worker.js
├── popup.html
├── popup.css
├── popup.js
├── whitelist.html
├── whitelist.css
├── whitelist.js
└── icons/
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

## Development

After editing files, reload the extension from `brave://extensions/`.

For debugging, open the extension service worker from the extension card in Developer mode and check the console.

## License

Burned Cookies is released under the MIT License. See [LICENSE](LICENSE) for details.
