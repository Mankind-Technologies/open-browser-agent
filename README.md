## Open Browser Agent: Chrome Extension + OpenAi Agents SDK
A Chrome extension that the user can invoke on a tab via the extension side panel, the user writes the task and an AI agent backed by Openai Agents SDK will perform the task in browser.

https://github.com/user-attachments/assets/3fce12e5-d32c-48e1-807f-0f325cdaa370

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
