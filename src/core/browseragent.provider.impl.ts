import { BrowserAgentProvider, ClickElementWithTextOutput, ElementBriefing, TypeInElementOutput, GoBackOutput, ScrollOutput } from './browseragent.provider';
/** No longer use active tab — we bind to a specific tabId per session. */

/**
 * Chrome-backed implementation of the `BrowserAgentProvider` interface.
 *
 * Notes on approach:
 * - For DOM querying and value setting, we inject small functions into the page via `chrome.scripting.executeScript`.
 * - For robust, user-like clicks, we compute coordinates in the top-most viewport and then dispatch real mouse
 *   events through the Chrome DevTools Protocol (via `chrome.debugger`). This avoids issues with synthetic
 *   click() calls being blocked by pages or buried in iframes.
 */
export class ChromeBrowserAgentProvider implements BrowserAgentProvider {
  constructor(private readonly tabId: number) {}
  
  // Internal: dispatch a sequence of typing steps to the bound tab via CDP
  private async dispatchTyping(sequence: Array<{ text?: string; key?: string; modifiers?: any }>, opts?: { delayMean?: number; delayJitter?: number }): Promise<boolean> {
    const tabId = this.tabId;
    if (tabId == null) return false;
    const target = { tabId } as const;
    const delayMean = Number.isFinite(opts?.delayMean as any) ? Number(opts?.delayMean) : 100;
    const delayJitter = Number.isFinite(opts?.delayJitter as any) ? Number(opts?.delayJitter) : 50;

    const modMask = (m: any = {}) => ((m.altKey ? 1 : 0) | (m.ctrlKey ? 2 : 0) | (m.metaKey ? 4 : 0) | (m.shiftKey ? 8 : 0));
    const KEYCODES: Record<string, number> = { Enter: 13, Tab: 9, Backspace: 8, Delete: 46, Escape: 27, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Home: 36, End: 35 };
    const keyPayload = (k: string) => {
      const kc = KEYCODES[k] ?? 0;
      return { key: k, code: k, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc };
    };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    await chrome.debugger.attach(target, '1.3');
    try {
      for (const step of sequence) {
        const modifiers = modMask(step.modifiers || {});
        if (step.text != null) {
          await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', text: String(step.text), modifiers });
          await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', text: String(step.text), modifiers });
        } else if (step.key) {
          const payload = { ...keyPayload(String(step.key)), modifiers } as any;
          await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', ...payload });
          await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', ...payload });
        }
        const jitter = Math.max(0, delayMean + (Math.random() * 2 - 1) * delayJitter);
        if (jitter > 0) await sleep(jitter);
      }
    } finally {
      try { await chrome.debugger.detach(target); } catch (_) { /* ignore */ }
    }
    return true;
  }
  /**
   * Capture a screenshot (data URL) of the currently visible area of the active tab.
   */
  async takeScreenshot(): Promise<string> {
    // Use CDP to capture the screenshot of the bound tab (not whichever is active).
    const target = { tabId: this.tabId } as const;
    await chrome.debugger.attach(target, '1.3');
    try {
      const res = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', { format: 'png' } as any);
      const base64 = (res as any)?.data as string | undefined;
      if (!base64) return '';
      // Return as data URL to preserve previous contract
      return `data:image/png;base64,${base64}`;
    } finally {
      try { await chrome.debugger.detach(target); } catch (_) { /* ignore */ }
    }
  }

  /** Get the URL of the active tab in the current window. */
  async getCurrentUrl(): Promise<string> {
    try {
      const tab = await chrome.tabs.get(this.tabId);
      return tab?.url ?? '';
    } catch (_) {
      return '';
    }
  }

  /**
   * Click an element by CSS selector.
   *
   * Strategy:
   * 1) In the page: find the element, scroll it into view, and compute its screen coordinates relative to the top window,
   *    correctly accounting for nested iframes and visual viewport offsets.
   * 2) In the extension: perform a trusted click at those coordinates using CDP (`chrome.debugger`).
   */
  async clickElement(selector: string): Promise<boolean> {
    const tabId = this.tabId;
    if (tabId == null) return false;
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel: string) => {
        // Resolve target element within the document.
        function resolveTarget(targetOrSelector: string, root: Document = document) {
          const el = root.querySelector<HTMLElement>(targetOrSelector);
          if (!el) return null;
          return el as HTMLElement;
        }
        // Attempt to center the element in view to avoid overlapping UI.
        function scrollIntoViewIfNeeded(el: Element) {
          try { (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
        }
        // Compute coordinates in the top window viewport, walking up through iframes and adding offsets.
        function pointInTopViewport(el: Element, position?: { offsetX?: number; offsetY?: number }) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          const ox = position?.offsetX ?? rect.width / 2;
          const oy = position?.offsetY ?? rect.height / 2;
          let x = rect.left + Math.max(0, Math.min(rect.width, Number(ox)));
          let y = rect.top  + Math.max(0, Math.min(rect.height, Number(oy)));
          let win: Window | null = el.ownerDocument.defaultView;
          while (win && win !== win.top) {
            const frameEl = (win as any).frameElement as Element | null;
            if (!frameEl) break;
            const fr = (frameEl as HTMLElement).getBoundingClientRect();
            x += fr.left;
            y += fr.top;
            const pvv = (win.parent as any)?.visualViewport;
            if (pvv) { x += pvv.offsetLeft; y += pvv.offsetTop; }
            win = win.parent;
          }
          return { x: Math.round(x), y: Math.round(y) };
        }
        const el = resolveTarget(sel);
        if (!el || !(el as any).isConnected) return { ok: false };
        scrollIntoViewIfNeeded(el);
        const { x, y } = pointInTopViewport(el);
        return { ok: true, x, y };
      },
      args: [selector],
    });
    const result = (injection as any)?.result as ({ ok: false } | { ok: true; x: number; y: number }) | undefined;
    if (!result || !('ok' in result) || !result.ok) return false;

    // Perform a trusted, user-like click via CDP (chrome.debugger) from the background.
    const target = { tabId } as const;

    // Normalize human-friendly button values to CDP inputs.
    const normalizeButton = (btn: number | string) => {
      const map: Record<string, 'left' | 'middle' | 'right'> = {
        '0': 'left',
        '1': 'middle',
        '2': 'right',
        left: 'left',
        middle: 'middle',
        right: 'right',
      };
      const button = (map[String(btn)] ?? 'left') as 'left' | 'middle' | 'right';
      const buttons = { left: 1, right: 2, middle: 4 }[button];
      return { button, buttons } as const;
    };

    const { button, buttons } = normalizeButton('left');
    const x = result.x;
    const y = result.y;

    await chrome.debugger.attach(target, '1.3');
    try {
      // Move, press, and release to emulate a realistic single click.
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers: 0 });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mousePressed', x, y, button, buttons, clickCount: 1, modifiers: 0,
      });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1, modifiers: 0,
      });
    } finally {
      try { await chrome.debugger.detach(target); } catch (_) { /* ignore */ }
    }
    return true;
  }

  /**
   * Set the value of the currently focused input/textarea/contenteditable element.
   * Now implemented via CDP keystrokes for a trusted, user-like input.
  */
  async typeInFocusedElement(text: string): Promise<boolean> {
    // Build a simple key sequence that types the provided text (mapping \n to Enter)
    const sequence: Array<{ text?: string; key?: string }> = [];
    for (const ch of String(text ?? '')) {
      if (ch === '\n') sequence.push({ key: 'Enter' });
      else sequence.push({ text: ch });
    }
    return await this.dispatchTyping(sequence, { delayMean: 100, delayJitter: 50 });
  }

  /**
   * Type into a specific element matched by selector with detailed outcome reporting.
   * Returns whether typing succeeded, and if not, the reason plus candidates when multiple elements match.
   */
  async typeInElement(selector: string, text: string): Promise<TypeInElementOutput> {
    const tabId = this.tabId;
    if (tabId == null) return { typed: false, reason: 'not found' } as TypeInElementOutput;
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel: string, value: string) => {
        // Basic visibility check to avoid hidden elements.
        function isVisible(el: Element): boolean {
          const style = window.getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') return false;
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }
        // Determine if an element accepts text input.
        function isEditable(el: Element): boolean {
          const he = el as HTMLElement;
          if (!he) return false;
          if (he instanceof HTMLInputElement) return he.type !== 'button' && he.type !== 'submit' && !he.readOnly && !he.disabled;
          if (he instanceof HTMLTextAreaElement) return !he.readOnly && !he.disabled;
          if (he.isContentEditable) return true;
          const role = he.getAttribute && he.getAttribute('role');
          if (role && ['textbox', 'searchbox', 'combobox'].includes(role)) return true;
          return false;
        }
        // Create a stable, human-readable unique selector for diagnostics.
        function getUniqueSelector(el: Element): string {
          if (!(el instanceof Element)) return '';
          if ((el as HTMLElement).id) return `#${CSS.escape((el as HTMLElement).id)}`;
          const parts: string[] = [];
          let node: Element | null = el;
          while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
            const tag = node.tagName.toLowerCase();
            let s = tag;
            const parent = node.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter((n) => (n as Element).tagName === node!.tagName);
              if (siblings.length > 1) {
                const index = siblings.indexOf(node) + 1;
                s += `:nth-of-type(${index})`;
              }
            }
            parts.unshift(s);
            node = node.parentElement;
          }
          return parts.join(' > ');
        }
        // Rough position bucket to help the model reason about layout.
        function computePosition(el: Element): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' {
          const rect = (el as HTMLElement).getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const horiz = cx < vw / 3 ? 'left' : cx > (2 * vw) / 3 ? 'right' : 'center';
          const vert = cy < vh / 3 ? 'top' : cy > (2 * vh) / 3 ? 'bottom' : 'center';
          if (horiz === 'center' && vert === 'center') return 'center';
          if (vert === 'top' && horiz === 'left') return 'top-left';
          if (vert === 'top' && horiz === 'right') return 'top-right';
          if (vert === 'bottom' && horiz === 'left') return 'bottom-left';
          if (vert === 'bottom' && horiz === 'right') return 'bottom-right';
          return 'center';
        }
        const matches = Array.from(document.querySelectorAll(sel));
        if (matches.length === 0) return { typed: false, reason: 'not found' } as const;
        if (matches.length > 1) {
          const foundElements = matches.slice(0, 10).map((m) => ({
            selector: getUniqueSelector(m),
            text: (m as HTMLElement).innerText || (m as any).value || '',
            isVisible: isVisible(m),
            position: computePosition(m),
          }));
          return { typed: false, reason: 'multiple found', foundElements } as const;
        }
        const el = matches[0] as HTMLElement;
        if (!isEditable(el)) return { typed: false, reason: 'not editable' } as const;
        // Focus and place caret at end
        try { (el as any).scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
        if ((el as any).focus) { try { (el as any).focus({ preventScroll: true }); } catch {} }
        if ('setSelectionRange' in (el as any) && typeof (el as any).value === 'string') {
          const i = (el as any).value.length;
          try { (el as any).setSelectionRange(i, i); } catch {}
        }
        if ((el as HTMLElement).isContentEditable) {
          const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
          const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
        }
        // Build key sequence from text tokens like "Hello{Enter}"
        const TOKEN = /\{([^}]+)\}|[\s\S]/g;
        const SPECIAL = new Set([
          'Enter','Tab','Backspace','Delete','Escape',
          'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'
        ]);
        function parseTextToSequence(input: string) {
          const seq: any[] = [];
          let m: RegExpExecArray | null;
          while ((m = TOKEN.exec(input))) {
            if (m[1]) {
              const parts = m[1].split('+');
              const last = parts.pop() as string;
              const mods = Object.fromEntries(parts.map((p) => [p.toLowerCase() + 'Key', true]));
              if (!SPECIAL.has(last)) throw new Error(`Unsupported key: ${m[1]}`);
              seq.push({ key: last, modifiers: mods });
            } else {
              const ch = m[0];
              if (ch === '\n') seq.push({ key: 'Enter' }); else seq.push({ text: ch });
            }
          }
          return seq;
        }
        return { typed: true, sequence: parseTextToSequence(String(value ?? '')) } as const;
      },
      args: [selector, text],
    });
    const result = (injection as any)?.result as (TypeInElementOutput & { sequence?: any[] }) | undefined;
    if (!result) return { typed: false, reason: 'not found' } as TypeInElementOutput;
    if (!result.typed) return result as TypeInElementOutput;
    const seq = result.sequence;
    if (!Array.isArray(seq)) return { typed: false, reason: 'not found' } as TypeInElementOutput;
    const ok = await this.dispatchTyping(seq, { delayMean: 100, delayJitter: 50 });
    if (!ok) return { typed: false, reason: 'not found' } as TypeInElementOutput;
    return { typed: true } as TypeInElementOutput;
  }

  /**
   * Find elements whose text or accessible metadata includes the provided text.
   * Scans visible DOM and collects a stable selector, representative text, visibility, and rough position bucket.
   */
  async findElementsWithText(text: string): Promise<ElementBriefing[]> {
    const tabId = this.tabId;
    if (tabId == null) return [] as ElementBriefing[];
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (needle: string) => {
        // Visibility heuristic to avoid off-screen or hidden nodes.
        function isVisible(el: Element): boolean {
          const style = window.getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') return false;
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }
        // Consider elements interactive even if not text-visible (e.g., inputs, buttons, ARIA roles).
        function isInteractive(el: Element): boolean {
          const he = el as HTMLElement;
          if (!he) return false;
          if (he instanceof HTMLInputElement || he instanceof HTMLTextAreaElement || he instanceof HTMLButtonElement) return true;
          if (he instanceof HTMLAnchorElement && (he as HTMLAnchorElement).href) return true;
          if (he.isContentEditable) return true;
          const role = he.getAttribute && he.getAttribute('role');
          if (role && ['button', 'link', 'tab', 'menuitem', 'option', 'textbox', 'searchbox'].includes(role)) return true;
          return false;
        }
        // Build a descriptive unique selector for display and follow-up actions.
        function getUniqueSelector(el: Element): string {
          if (!(el instanceof Element)) return '';
          if ((el as HTMLElement).id) return `#${CSS.escape((el as HTMLElement).id)}`;
          const parts: string[] = [];
          let node: Element | null = el;
          while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
            const tag = node.tagName.toLowerCase();
            let selector = tag;
            const parent = node.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter((n) => n.tagName === node!.tagName);
              if (siblings.length > 1) {
                const index = siblings.indexOf(node) + 1; // nth-of-type is 1-based
                selector += `:nth-of-type(${index})`;
              }
            }
            parts.unshift(selector);
            node = node.parentElement;
          }
          return parts.join(' > ');
        }
        // Rough position bucket for reasoning about page layout.
        function computePosition(el: Element): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' {
          const rect = (el as HTMLElement).getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const horiz = cx < vw / 3 ? 'left' : cx > (2 * vw) / 3 ? 'right' : 'center';
          const vert = cy < vh / 3 ? 'top' : cy > (2 * vh) / 3 ? 'bottom' : 'center';
          if (horiz === 'center' && vert === 'center') return 'center';
          if (vert === 'top' && horiz === 'left') return 'top-left';
          if (vert === 'top' && horiz === 'right') return 'top-right';
          if (vert === 'bottom' && horiz === 'left') return 'bottom-left';
          if (vert === 'bottom' && horiz === 'right') return 'bottom-right';
          // default bucket
          return 'center';
        }
        const query = needle.toLowerCase();
        const result: { selector: string; text: string; isVisible: boolean; position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' }[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        let current: Element | null = walker.currentNode as Element;
        while (current) {
          const visible = isVisible(current);
          const el = current as HTMLElement;
          const textContent = el.innerText || '';
          const placeholder = (el.getAttribute && (el.getAttribute('placeholder')
            || el.getAttribute('aria-placeholder')
            || el.getAttribute('data-placeholder'))) || '';
          const ariaLabel = (el.getAttribute && el.getAttribute('aria-label')) || '';
          const titleAttr = (el.getAttribute && el.getAttribute('title')) || '';
          const valueAttr = (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) ? (el.value || '') : '';
          const altAttr = (el as any).alt || '';
          // Associated label text
          let labelText = '';
          const elId = (el.getAttribute && el.getAttribute('id')) || '';
          if (elId) {
            const lbl = document.querySelector(`label[for="${CSS.escape(elId)}"]`) as HTMLElement | null;
            if (lbl) labelText = lbl.innerText || '';
          }
          if (!labelText) {
            const wrappingLabel = el.closest('label');
            if (wrappingLabel) labelText = (wrappingLabel as HTMLElement).innerText || '';
          }
          const candidates = [
            textContent,
            placeholder,
            ariaLabel,
            titleAttr,
            labelText,
            valueAttr,
            altAttr,
          ].filter(Boolean).map((s) => s.toLowerCase());
          const matchText = candidates.some((s) => s.includes(query));
          if (matchText && (visible || isInteractive(el))) {
            const selector = getUniqueSelector(current);
            if (selector) {
              const winningText = (textContent || placeholder || ariaLabel || titleAttr || labelText || valueAttr || altAttr || '');
              result.push({ selector, text: winningText, isVisible: true, position: computePosition(current) });
            }
          }
          current = walker.nextNode() as Element | null;
        }
        return result;
      },
      args: [text],
    });
    return (injection as any)?.result ?? ([] as ElementBriefing[]);
  }

  /**
   * Click the single element that matches the given text.
   * Returns structured info indicating whether the click happened and if the URL changed after it.
   */
  async clickElementWithText(text: string): Promise<ClickElementWithTextOutput> {
    const matches = await this.findElementsWithText(text);
    if (matches.length === 0) {
      return { clicked: false, reason: 'not found' } as ClickElementWithTextOutput;
    }
    if (matches.length > 1) {
      return { clicked: false, reason: 'multiple found', foundElements: matches } as ClickElementWithTextOutput;
    }
    const only = matches[0];

    const beforeUrl = await this.getCurrentUrl();
    const clicked = await this.clickElement(only.selector);
    if (!clicked) return { clicked: false, reason: 'not found' } as ClickElementWithTextOutput;

    // After click, wait briefly to detect a navigation (URL change) triggered by the action.
    const tabId = this.tabId;
    if (tabId == null) return { clicked: true, urlChanged: false } as ClickElementWithTextOutput;

    const changedUrl = await (async () => {
      const timeoutMs = 2000;
      const intervalMs = 100;
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const tab = await chrome.tabs.get(tabId);
        const url = tab?.url ?? '';
        if (url && url !== beforeUrl) return url;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return '';
    })();

    if (changedUrl) {
      return { clicked: true, urlChanged: true, newUrl: changedUrl } as ClickElementWithTextOutput;
    }
    return { clicked: true, urlChanged: false } as ClickElementWithTextOutput;
  }

  /**
   * Navigate back in the active tab's history and report if the URL changed.
   */
  async goBack(): Promise<GoBackOutput> {
    const tabId = this.tabId;
    if (tabId == null) return { wentBack: false } as GoBackOutput;

    const before = await this.getCurrentUrl();
    // Use CDP to navigate back in history when possible.
    const target = { tabId } as const;
    let issued = false;
    try {
      await chrome.debugger.attach(target, '1.3');
      // Query navigation history and go to previous entry if available.
      const hist = await chrome.debugger.sendCommand(target, 'Page.getNavigationHistory');
      const currentIndex = Number((hist as any)?.currentIndex ?? -1);
      const entries = Array.isArray((hist as any)?.entries) ? (hist as any).entries : [];
      if (currentIndex > 0 && entries[currentIndex - 1]?.id != null) {
        const prevId = entries[currentIndex - 1].id as number;
        await chrome.debugger.sendCommand(target, 'Page.navigateToHistoryEntry', { entryId: prevId });
        issued = true;
      }
    } catch (_) {
      // ignore and fall back
    } finally {
      try { await chrome.debugger.detach(target); } catch (_) { /* ignore */ }
    }
    if (!issued) {
      // Fallback: synthesize Alt+Left (common Back shortcut). May be ignored on some platforms.
      try {
        await chrome.runtime.sendMessage({
          type: 'trusted-type',
          tabId,
          sequence: [{ key: 'ArrowLeft', modifiers: { altKey: true } }],
          delayMean: 0,
          delayJitter: 0,
        });
      } catch (_) { /* ignore */ }
    }

    // Wait briefly for a navigation to complete (URL change)
    const changedUrl = await (async () => {
      const timeoutMs = 3000;
      const intervalMs = 100;
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          const tab = await chrome.tabs.get(tabId);
          const url = tab?.url ?? '';
          if (url && url !== before) return url;
        } catch (_) {
          // ignore transient errors while navigating
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return '';
    })();

    if (changedUrl) return { wentBack: true, newUrl: changedUrl } as GoBackOutput;
    return { wentBack: false } as GoBackOutput;
  }

  /**
   * Scroll the page up or down by a viewport chunk and report edge conditions.
   */
  async scroll(direction: 'up' | 'down'): Promise<ScrollOutput> {
    const tabId = this.tabId;
    if (tabId == null) return { scrolled: false, reason: direction === 'up' ? 'already at the top' : 'already at the bottom' } as ScrollOutput;

    // Read current scroll state and viewport center (read operations via injection).
    const [pre] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const root = document.scrollingElement || document.documentElement || document.body;
        const y = window.scrollY || root.scrollTop || 0;
        const vh = window.innerHeight || 0;
        const sh = root.scrollHeight || 0;
        const maxY = Math.max(0, sh - vh);
        const cx = Math.floor(window.innerWidth / 2);
        const cy = Math.floor(window.innerHeight / 2);
        return { y, maxY, vh, cx, cy };
      },
    });
    const state = (pre as any)?.result as { y: number; maxY: number; vh: number; cx: number; cy: number } | undefined;
    if (!state) return { scrolled: false, reason: direction === 'up' ? 'already at the top' : 'already at the bottom' } as ScrollOutput;

    if (direction === 'down' && state.y >= state.maxY - 1) return { scrolled: false, reason: 'already at the bottom' } as ScrollOutput;
    if (direction === 'up' && state.y <= 0) return { scrolled: false, reason: 'already at the top' } as ScrollOutput;

    const target = { tabId } as const;
    const delta = Math.max(50, Math.round(state.vh * 0.8));
    const dy = direction === 'down' ? delta : -delta;
    await chrome.debugger.attach(target, '1.3');
    try {
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: state.cx, y: state.cy, deltaX: 0, deltaY: dy, modifiers: 0,
      } as any);
    } finally {
      try { await chrome.debugger.detach(target); } catch (_) { /* ignore */ }
    }
    return { scrolled: true, direction } as ScrollOutput;
  }

  /**
   * Open the provided URL in the bound tab. Normalizes missing scheme to https://
   * and waits briefly for the tab URL to reflect the change.
   */
  async openUrl(url: string): Promise<boolean> {
    const tabId = this.tabId;
    if (tabId == null) return false;

    try {
      let targetUrl = String(url || '').trim();
      if (!targetUrl) return false;
      // If no scheme provided, default to https://
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
      }

      // Issue navigation
      await chrome.tabs.update(tabId, { url: targetUrl });

      // Wait briefly for navigation to reflect in the tab's URL
      const timeoutMs = 4000;
      const intervalMs = 100;
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          const tab = await chrome.tabs.get(tabId);
          const current = tab?.url ?? '';
          if (current && current.startsWith(targetUrl)) return true;
        } catch (_) {
          // ignore transient tab access errors during navigation
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      // Consider navigation initiated even if we didn't observe final URL in time
      return true;
    } catch (_) {
      return false;
    }
  }
}
