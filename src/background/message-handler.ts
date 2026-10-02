// Background lifecycle for the floating overlay experience.
// The page overlay stays inside the web page; the toolbar button only toggles it.

import { MSG_TOGGLE_OVERLAY, isScannableUrl } from '../shared/messages';

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
}
