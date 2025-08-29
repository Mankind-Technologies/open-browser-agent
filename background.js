// Background service worker for Browser Agent

// Maintain simple per-tab running state in chrome.storage.session
// Key: `running:<tabId>` => boolean

chrome.runtime.onInstalled.addListener(() => {
  // Initialize anything if needed in future
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await chrome.storage.session.remove(`running:${tabId}`);
  } catch (e) {
    // no-op
  }
});

// Provide message-based helpers if needed later
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'getRunningState') {
    const tabId = message.tabId;
    chrome.storage.session.get(`running:${tabId}`).then((obj) => {
      sendResponse({ running: Boolean(obj[`running:${tabId}`]) });
    });
    return true; // async
  }
  if (message?.type === 'setRunningState') {
    const { tabId, running } = message;
    chrome.storage.session.set({ [`running:${tabId}`]: Boolean(running) }).then(() => {
      sendResponse({ ok: true });
    });
    return true; // async
  }
});


