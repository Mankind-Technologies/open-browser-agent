## Browser Agent: Chrome Extension + OpenAi Agents SDK
A Chrome Manifest V3 extension scaffold with:

- Options page to store an API key (chrome.storage.sync) with copy-to-clipboard.
- Popup with textarea and Launch button that sets the active tab's <title> to the textarea value and shows running status per-tab.
- Background service worker for scripting and tab focus handling.

### Setup

Requires pnpm. If not installed: `npm i -g pnpm`.

Install deps:

```bash
make install
```

Build TypeScript:

```bash
make build
```

Or watch mode:

```bash
pnpm run dev
```

### Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable Developer mode (top right).
3. Click "Load unpacked" and select this folder (`browser-auto/`). The service worker and scripts are emitted to `build/` and referenced by `manifest.json`.

### Usage

- Click the extension icon to open the side bar.
- Enter a task in the textarea and click "Run". The active tab's page title will be updated.
- Use the options page (three dots on the extension card → Details → Extension options) to set/copy your OpenAI API key. The organization has to be verified, since this extension uses the gpt-5-mini model.

### Development Notes

- Uses Manifest V3 with a service worker.
- Stores settings in `chrome.storage.sync`.
- Uses `chrome.scripting.executeScript` to modify the active tab.

### Files

- `manifest.json` – Extension configuration
- `background.js` – Service worker
- `popup/` – Popup UI and logic
- `options/` – Options page for API key


