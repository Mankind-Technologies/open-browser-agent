## Open Browser Agent: Chrome Extension + OpenAi Agents SDK
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

### Tools available

- clickElement: Click on the element with the given selector
- typeInFocusedElement: Type in the focused element
- typeInElement: Type in the element with the given selector
- findElementsWithText: Find elements with the given text
- clickElementWithText: Click on the element with the given text
- openUrl: Open the given url
- goBack: Go back to the previous page
- scroll: Scroll the page

## Tech stack

- Chrome Manifest V3
- OpenAi Agents SDK
- Svelte
- Tailwind CSS
- TypeScript
- Zod
