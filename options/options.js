function setStatus(text) {
  const el = document.getElementById('status');
  el.textContent = text;
  if (text) {
    setTimeout(() => {
      el.textContent = '';
    }, 1500);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const copyBtn = document.getElementById('copyBtn');

  // Load existing
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (apiKey) input.value = apiKey;

  saveBtn.addEventListener('click', async () => {
    const value = input.value.trim();
    await chrome.storage.sync.set({ apiKey: value });
    setStatus('Saved');
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value || '');
      setStatus('Copied');
    } catch (e) {
      setStatus('Copy failed');
      console.error(e);
    }
  });
});


