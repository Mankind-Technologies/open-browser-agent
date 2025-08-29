async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getRunning(tabId) {
  const obj = await chrome.storage.session.get(`running:${tabId}`);
  return Boolean(obj[`running:${tabId}`]);
}

async function setRunning(tabId, running) {
  await chrome.storage.session.set({ [`running:${tabId}`]: Boolean(running) });
}

function setStatus(text) {
  const el = document.getElementById('statusText');
  el.textContent = text;
}

document.addEventListener('DOMContentLoaded', async () => {
  const titleInput = document.getElementById('titleInput');
  const launchBtn = document.getElementById('launchBtn');

  const tab = await getActiveTab();
  if (!tab) {
    setStatus('no active tab');
    return;
  }

  const running = await getRunning(tab.id);
  setStatus(running ? 'running' : 'idle');

  launchBtn.addEventListener('click', async () => {
    const newTitle = titleInput.value.trim();
    if (!newTitle) {
      setStatus('enter a title');
      return;
    }
    setStatus('running');
    await setRunning(tab.id, true);

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (title) => {
          document.title = title;
        },
        args: [newTitle],
      });
      // Keep running state true to reflect ongoing session, could be toggled off later
    } catch (e) {
      setStatus('error');
      console.error(e);
      await setRunning(tab.id, false);
      return;
    }
  });
});


