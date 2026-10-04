// Background lifecycle for the floating overlay experience.
// The page overlay stays inside the web page; the toolbar button only toggles it.

import { MSG_TOGGLE_OVERLAY, MSG_CLOSE_OVERLAY, MSG_MINIMIZE_OVERLAY, MSG_RESTORE_OVERLAY, isScannableUrl } from '../shared/messages';

/** Messages that the iframe sends via chrome.runtime.sendMessage and that
 *  must be relayed to the active tab's content script (overlay.ts). */
const RELAY_TYPES = new Set([MSG_CLOSE_OVERLAY, MSG_MINIMIZE_OVERLAY, MSG_RESTORE_OVERLAY]);

export function registerLifecycle() {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void chrome.action.setTitle({ title: 'Inspectra — Frontend AI Auditor' });
    }
  });

  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: MSG_TOGGLE_OVERLAY });
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/overlay.js'] });
        await chrome.tabs.sendMessage(tab.id, { type: MSG_TOGGLE_OVERLAY });
      } catch {
        // Ignore restricted pages / injected script errors.
      }
    }
  });

  chrome.tabs.onActivated.addListener(async (info) => {
    try {
      const tab = await chrome.tabs.get(info.tabId);
      const ok = isScannableUrl(tab.url);
      await chrome.action.setTitle({
        tabId: info.tabId,
        title: ok ? 'Inspectra — Frontend AI Auditor' : 'Inspectra (this page cannot be scanned)',
      });
    } catch {
      /* ignore */
    }
  });

  // Relay overlay control messages from the iframe to the page content script.
  chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
    if (message?.type && RELAY_TYPES.has(message.type)) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
        if (tab?.id === undefined) {
          sendResponse({ ok: false, error: 'no active tab' });
          return;
        }
        chrome.tabs.sendMessage(tab.id, message).then((response) => {
          sendResponse(response ?? { ok: true });
        }).catch(() => {
          sendResponse({ ok: false, error: 'content script unreachable' });
        });
      }).catch(() => {
        sendResponse({ ok: false, error: 'tabs query failed' });
      });
      return true; // keep sendResponse channel open for async
    }
    return false;
  });
}

