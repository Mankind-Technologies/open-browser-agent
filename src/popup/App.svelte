<script lang="ts">
  import { onMount, tick } from 'svelte';

  type BoundTab = { id: number; title?: string; favicon?: string };
  type TimelineRow = { id: string; label: string; body: string };

  let task = '';
  let statusText = 'idle';
  let running = false;
  let boundTab: BoundTab | undefined;
  let messages: TimelineRow[] = [];
  let sidebar: { id: string; text: string }[] = [];

  let historyContainer: HTMLDivElement | null = null;

  async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }
  async function getRunning(tabId: number): Promise<boolean> {
    const obj = await chrome.storage.session.get(`running:${tabId}`);
    return Boolean(obj[`running:${tabId}`]);
  }
  async function setRunning(tabId: number, val: boolean): Promise<void> {
    await chrome.storage.session.set({ [`running:${tabId}`]: Boolean(val) });
  }
  async function getBoundTab(): Promise<BoundTab | undefined> {
    const obj = await chrome.storage.session.get('boundTab');
    const bt = obj?.boundTab as BoundTab | undefined;
    if (bt && Number.isFinite((bt as any).id)) return bt;
    return undefined;
  }
  async function setBoundTab(tab: BoundTab | undefined): Promise<void> {
    if (!tab) return void (await chrome.storage.session.remove('boundTab'));
    await chrome.storage.session.set({ boundTab: tab });
  }

  let seq = 0;
  function pushRow(label: string, body: string): string {
    const id = `msg-${++seq}`;
    messages = [...messages, { id, label, body }];
    sidebar = [...sidebar, { id, text: label.toUpperCase() }];
    return id;
  }
  function setRowBody(id: string, body: string) {
    messages = messages.map((m) => (m.id === id ? { ...m, body } : m));
  }

  async function loadHistory() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'getHistory' });
      if (res && res.ok) {
        messages = [];
        sidebar = [];
        seq = 0;
        const items: any[] = Array.isArray(res.history) ? res.history : [];
        for (const msg of items.reverse()) {
          const role = String((msg as any)?.role || '');
          if (!role) continue;
          let text = '';
          try {
            if (Array.isArray((msg as any)?.content)) {
              text = (msg as any).content.map((c: any) => (typeof c === 'string' ? c : c.text)).join('\n');
            } else {
              text = String((msg as any)?.content ?? '');
            }
          } catch {}
          pushRow(role, text);
        }
        await tick();
        if (historyContainer) historyContainer.scrollTop = historyContainer.scrollHeight;
      }
    } catch {}
  }

  onMount(async () => {
    let thinkingId: string | null = null;
    let thinkingText = '';
    boundTab = await getBoundTab();
    if (boundTab) running = await getRunning(boundTab.id);
    statusText = running ? 'running' : 'idle';
    await loadHistory();

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'agentStep') {
        console.log(new Date().toISOString(), message);
        const step = message.step as any;
        const t = String(step?.type || '');
        if (t === 'raw_model_stream_event') {
          const ev = step?.data?.event;
          const evType = String(ev?.type || '');
          if (evType === 'response.reasoning_summary_text.delta') {
            const delta = String(ev?.delta || '');
            if (delta) {
              if (!thinkingId) {
                thinkingText = '';
                thinkingId = pushRow('Thinking…', '');
              }
              thinkingText += delta;
              setRowBody(thinkingId, thinkingText);
              tick().then(() => {
                if (historyContainer) historyContainer.scrollTop = historyContainer.scrollHeight;
              });
            }
          } else if (evType === 'response.reasoning_summary_text.completed') {
            thinkingId = null;
            thinkingText = '';
          }
        } else if (t === 'run_item_stream_event') {
          const name = String(step?.name || '');
          const item = step?.item || {};
          const raw = item?.rawItem || {};

          if (name === 'tool_called' || item?.type === 'tool_call_item') {
            const toolName = String(raw?.name || '(tool)');
            let explaining = '';
            try {
              if (raw?.arguments) {
                const parsed = JSON.parse(String(raw.arguments));
                explaining = typeof parsed?.explaining === 'string' ? parsed.explaining : '';
              }
            } catch {}
            pushRow(`Invoking tool: ${toolName}`, explaining);
          } else if (name === 'tool_output' || item?.type === 'tool_call_output_item') {
            const toolName = String(raw?.name || '(tool)');
            // Try to extract whatChangedOnScreen from the tool output payload, if present
            let body = '';
            try {
              const out = (raw?.output ?? raw?.data ?? raw?.content ?? undefined);
              const pickChange = (v: any): string | '' => {
                if (!v) return '';
                if (typeof v === 'string') {
                  // Sometimes tools return plain text; accept as-is
                  return v;
                }
                if (typeof v === 'object') {
                  if (typeof (v as any).whatChangedOnScreen === 'string' && (v as any).whatChangedOnScreen.trim()) {
                    return (v as any).whatChangedOnScreen.trim();
                  }
                  // Some SDKs wrap output under value/result
                  if (typeof (v as any).value === 'object') return pickChange((v as any).value);
                  if (Array.isArray((v as any).content)) {
                    // search within content array for a field
                    for (const c of (v as any).content) {
                      const found = pickChange(c);
                      if (found) return found;
                    }
                  }
                  if (typeof (v as any).text === 'string') return (v as any).text;
                }
                return '';
              };
              const extracted = pickChange(out);
              if (extracted) body = extracted;
            } catch {}
            pushRow(`Tool finished: ${toolName}`, body);
          } else if (name === 'reasoning_item_created' || item?.type === 'reasoning_item') {
            const parts = Array.isArray(raw?.content) ? raw.content : [];
            const text = parts.map((p: any) => p?.text).filter(Boolean).join('\n');
            pushRow('Thinking…', text || '(no content)');
          } else if (name === 'message_output_created' || item?.type === 'message_output_item') {
            const parts = Array.isArray(raw?.content) ? raw.content : [];
            const text = parts.map((p: any) => (p?.type === 'output_text' ? p?.text : '')).filter(Boolean).join('');
            pushRow('Assistant', text || '(no message)');
          } else {
            pushRow('Event', name || t);
          }
          tick().then(() => {
            if (historyContainer) historyContainer.scrollTop = historyContainer.scrollHeight;
          });
        }
      } else if (message?.type === 'agentEnd') {
        statusText = 'idle';
        running = false;
        thinkingId = null;
        thinkingText = '';
      } else if (message?.type === 'agentError') {
        statusText = 'error';
        running = false;
        thinkingId = null;
        thinkingText = '';
      }
    });
  });

  async function clearHistory() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'clearHistory' });
      if (res && res.ok) {
        messages = [];
        sidebar = [];
        boundTab = undefined;
        await setBoundTab(undefined);
      }
    } catch {}
  }

  function newChat() {
    messages = [];
    sidebar = [];
    task = '';
    statusText = 'idle';
  }

  async function launch() {
    const t = task.trim();
    if (!t) {
      statusText = 'enter a task';
      return;
    }
    statusText = 'running';

    if (!boundTab) {
      const active = await getActiveTab();
      if (!active || active.id == null) {
        statusText = 'no active tab';
        return;
      }
      boundTab = { id: active.id, title: active.title || String(active.id), favicon: (active as any).favIconUrl };
      await setBoundTab(boundTab);
    }
    running = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'runAgent', task: t, tabId: boundTab.id, tabTitle: boundTab.title });
      if (!(res && res.ok)) {
        statusText = 'error';
      }
      await setRunning(boundTab.id, false);
    } catch (e) {
      console.error('Agent run failed to start', e);
      statusText = 'error';
      if (boundTab) await setRunning(boundTab.id, false);
    }
  }
</script>

<div class="w-full p-0 md:p-2">
  <div class="grid grid-cols-1 md:grid-cols-[240px,1fr]">
    <!-- Sidebar -->
    <aside class="hidden md:flex md:flex-col h-full max-h-[560px] bg-gradient-to-b from-lime-200/80 to-lime-100/60 border-r border-lime-200">
      <div class="p-3 border-b border-lime-200">
        <div class="text-xs uppercase tracking-wide text-gray-700">Agent</div>
        <div class="mt-1 flex items-center gap-2 text-sm text-gray-800">
          <img alt="favicon" src={boundTab?.favicon} style="width:16px;height:16px;display:{boundTab?.favicon ? 'inline-block' : 'none'}" />
          <div class="truncate">Working on: <span class="font-medium">{boundTab ? (boundTab.title || boundTab.id) : '(none)'}</span></div>
          <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white/60 border border-lime-300 text-gray-700">{statusText}</span>
        </div>
        <div class="mt-3 flex gap-2">
          <button class="flex-1 text-xs px-2 py-1 rounded bg-lime-500 text-white hover:bg-lime-600" on:click={newChat}>New</button>
          <button class="flex-1 text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50" title="Clear conversation" on:click={clearHistory}>Clear</button>
        </div>
      </div>
      <div id="sidebarList" class="flex-1 overflow-auto p-2 space-y-1">
        {#if sidebar.length === 0}
          <div class="text-[11px] text-gray-600">No activity yet.</div>
        {/if}
        {#each sidebar as s}
          <button class="w-full text-left px-2 py-1 rounded hover:bg-lime-200/60 text-xs text-gray-800" on:click={() => {
            const el = document.getElementById(s.id);
            if (el && historyContainer) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>{s.text}</button>
        {/each}
      </div>
    </aside>

    <!-- Main content -->
    <main class="h-full max-h-[560px] flex flex-col">
      <div class="md:hidden px-3 py-2 border-b border-lime-200 bg-lime-100/50 text-sm text-gray-800 flex items-center gap-2">
        <img alt="favicon" src={boundTab?.favicon} style="width:16px;height:16px;display:{boundTab?.favicon ? 'inline-block' : 'none'}" />
        <div class="truncate">Working on: <span class="font-medium">{boundTab ? (boundTab.title || boundTab.id) : '(none)'}</span></div>
        <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white/60 border border-lime-300 text-gray-700">{statusText}</span>
      </div>

      <div class="flex-1 p-3">
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm font-medium">Activity</div>
        </div>
        <div class="h-[380px] md:h-[420px] overflow-auto rounded border border-gray-200 bg-white p-2" bind:this={historyContainer} id="historyList">
          {#each messages as m}
            <div id={m.id} class="flex gap-2">
              <div class="w-3 flex flex-col items-center">
                <div class="mt-1 w-2 h-2 rounded-full bg-gray-400"></div>
                <div class="rail-line flex-1 w-px bg-gray-300"></div>
              </div>
              <div class="flex-1 pb-2">
                <div class="text-xs font-semibold text-gray-700">{m.label}</div>
                <pre class="mt-1 whitespace-pre-wrap break-words text-xs text-gray-800">{m.body}</pre>
              </div>
            </div>
          {/each}
          {#if messages.length === 0}
            <div class="text-xs text-gray-600">No messages yet. Describe a task below and Run.</div>
          {/if}
        </div>
      </div>

      <div class="border-t border-gray-200 p-3">
        <div class="text-sm font-medium mb-2">Ask for follow-up changes</div>
        <div class="flex gap-2 items-start">
          <label for="taskInput" class="sr-only">Task</label>
          <textarea id="taskInput" rows="3" placeholder="Describe what to do..." class="flex-1 rounded border border-gray-300 p-2 text-sm outline-none focus:ring-2 focus:ring-lime-400 focus:border-lime-400" bind:value={task}></textarea>
          <div class="flex items-center gap-2 mt-1">
            <button class="px-3 py-2 rounded bg-lime-500 text-white text-sm hover:bg-lime-600 disabled:opacity-60" on:click={launch} disabled={running}>Run</button>
            <button class="px-3 py-2 rounded border border-gray-300 bg-white text-sm hover:bg-gray-50" on:click={newChat}>New</button>
            <button class="px-3 py-2 rounded border border-gray-300 bg-white text-sm hover:bg-gray-50" on:click={clearHistory}>Clear</button>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>
