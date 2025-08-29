<script lang="ts">
  import { onMount } from 'svelte';

  // Only expose the single setting the extension uses: apiKey
  let apiKey = '';
  let status = '';
  let saving = false;
  let showKey = false;

  const setTransientStatus = (text: string) => {
    status = text;
    if (text) {
      setTimeout(() => (status = ''), 2000);
    }
  };

  onMount(async () => {
    const obj = await chrome.storage.sync.get('apiKey');
    if (typeof obj?.apiKey === 'string') apiKey = obj.apiKey;
  });
  function validate(): string | null {
    if (!apiKey.trim()) return 'API Key is required';
    return null;
  }
  const save = async () => {
    const err = validate();
    if (err) {
      setTransientStatus(err);
      return;
    }
    saving = true;
    try {
      await chrome.storage.sync.set({ apiKey: apiKey.trim() });
      setTransientStatus('Saved');
    } finally {
      saving = false;
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setTransientStatus('API Key copied');
    } catch (e) {
      console.error(e);
      setTransientStatus('Copy failed');
    }
  };

  // No demo/test/export features — only what the extension uses.
</script>

<div class="space-y-4">
  <h1 class="text-lg font-semibold">Settings</h1>
  {#if status}
    <div class="text-sm text-gray-800">{status}</div>
  {/if}

  <div>
    <label for="apiKey" class="block text-sm font-medium">API Key</label>
    <div class="mt-1 flex gap-2 items-center">
      {#if showKey}
        <input id="apiKey" class="flex-1 rounded border border-gray-300 p-2 text-sm outline-none focus:ring-2 focus:ring-lime-400 focus:border-lime-400" type="text" placeholder="Enter API key" bind:value={apiKey} />
      {:else}
        <input id="apiKey" class="flex-1 rounded border border-gray-300 p-2 text-sm outline-none focus:ring-2 focus:ring-lime-400 focus:border-lime-400" type="password" placeholder="Enter API key" bind:value={apiKey} />
      {/if}
      <button class="px-2 py-2 rounded border border-gray-300 bg-white text-sm hover:bg-gray-50" on:click={() => (showKey = !showKey)}>{showKey ? 'Hide' : 'Show'}</button>
      <button class="px-3 py-2 rounded border border-gray-300 bg-white text-sm hover:bg-gray-50" on:click={copy}>Copy</button>
    </div>
  </div>

  <div>
    <button class="px-3 py-2 rounded bg-lime-500 text-white text-sm hover:bg-lime-600 disabled:opacity-50" disabled={saving} on:click={save}>{saving ? 'Saving…' : 'Save'}</button>
  </div>
</div>
