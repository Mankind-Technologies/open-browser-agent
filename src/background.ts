// Background service worker for Browser Agent (TypeScript)

chrome.runtime.onInstalled.addListener(() => {
  // Open the side panel when the action icon is clicked
  try { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch (_) {}
});

// Fallback: explicitly open the side panel on action click if needed
try {
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id != null) {
      try { await chrome.sidePanel.open({ tabId: tab.id }); } catch (_) {}
    }
  });
} catch (_) {}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await chrome.storage.session.remove(`running:${tabId}`);
    // If the removed tab was the bound session tab, clear the binding.
    try {
      const obj = await chrome.storage.session.get('boundTab');
      const bound = (obj as any)?.boundTab as { id?: number } | undefined;
      if (bound && Number.isFinite(bound.id) && bound.id === tabId) {
        await chrome.storage.session.remove('boundTab');
        try { await chrome.runtime.sendMessage({ type: 'boundTabCleared' }); } catch (_) {}
      }
    } catch (_) { /* ignore */ }
  } catch (_) {
    // ignore
  }
});

import { BrowserAgent } from './core/browseragent';
import { ChromeBrowserAgentProvider } from './core/browseragent.provider.impl';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'getRunningState') {
    const tabId: number = message.tabId;
    chrome.storage.session.get(`running:${tabId}`).then((obj) => {
      sendResponse({ running: Boolean(obj[`running:${tabId}`]) });
    });
    return true; // async
  }
  if (message?.type === 'setRunningState') {
    const { tabId, running } = message as { tabId: number; running: boolean };
    chrome.storage.session
      .set({ [`running:${tabId}`]: Boolean(running) })
      .then(() => sendResponse({ ok: true }));
    return true; // async
  }
  if (message?.type === 'runAgent') {
    (async () => {
      try {
        const tabId = Number.isFinite(message.tabId) ? Number(message.tabId) : undefined;
        if (tabId == null) throw new Error('Missing tabId for runAgent');
        const agent = new BrowserAgent(new ChromeBrowserAgentProvider(tabId));
        const history = await chrome.storage.local.get('latestHistory');
        const startingHistory = Array.isArray(history.latestHistory) ? history.latestHistory : undefined;

        // Respond immediately to avoid message timeout; stream events separately.
        try { sendResponse({ ok: true, started: true }); } catch (_) {}

        let finalOutput = '';
        let finalHistory: any[] = [];
        try {
          for await (const evt of agent.run(message.task as string, startingHistory)) {
            if (evt.type === 'step') {
              // Broadcast step event to any listeners (e.g., side panel)
              try { await chrome.runtime.sendMessage({ type: 'agentStep', step: evt.step }); } catch (_) {}
            } else if (evt.type === 'end') {
              finalOutput = evt.output;
              finalHistory = evt.history as any[];
              try { await chrome.runtime.sendMessage({ type: 'agentEnd', output: evt.output, history: evt.history }); } catch (_) {}
            }
          }
        } catch (streamErr) {
          console.error('Background agent stream error', streamErr);
          try { await chrome.runtime.sendMessage({ type: 'agentError', error: String((streamErr as any)?.message || streamErr) }); } catch (_) {}
        }

        if (Array.isArray(finalHistory) && finalHistory.length) {
          try { await chrome.storage.local.set({ latestHistory: finalHistory }); } catch (_) {}
        }
      } catch (error) {
        console.error('Background agent error', error);
        try { sendResponse({ ok: false, error: String(error) }); } catch (_) {}
        try { await chrome.runtime.sendMessage({ type: 'agentError', error: String((error as any)?.message || error) }); } catch (_) {}
      }
    })();
    return true; // async
  }
  if (message?.type === 'getHistory') {
    (async () => {
      try {
        const data = await chrome.storage.local.get('latestHistory');
        const list = Array.isArray((data as any).latestHistory) ? (data as any).latestHistory : [];
        sendResponse({ ok: true, history: list });
      } catch (err: any) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true; // async
  }
  if (message?.type === 'clearHistory') {
    (async () => {
      try {
        await chrome.storage.local.remove('latestHistory');
        sendResponse({ ok: true });
      } catch (err: any) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true; // async
  }
});
