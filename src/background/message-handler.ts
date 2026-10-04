// Background lifecycle for the floating overlay experience.
// The page overlay stays inside the web page; the toolbar button only toggles it.

const MSG_TOGGLE_OVERLAY = 'INSPECTRA_TOGGLE_OVERLAY';
const MSG_CLOSE_OVERLAY = 'INSPECTRA_CLOSE_OVERLAY';
const MSG_MINIMIZE_OVERLAY = 'INSPECTRA_MINIMIZE_OVERLAY';
const MSG_RESTORE_OVERLAY = 'INSPECTRA_RESTORE_OVERLAY';

const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'view-source:',
  'chrome-search://',
  'devtools://',
  'data:',
  'javascript:',
  'file:',
];

function isScannable(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (RESTRICTED_PREFIXES.some((p) => trimmed.startsWith(p))) return false;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'chromewebstore.google.com' || host === 'chrome.google.com') {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

/** Messages that the iframe sends via chrome.runtime.sendMessage and that
 *  must be relayed to the active tab's content script (overlay.ts). */
const RELAY_TYPES = new Set([MSG_CLOSE_OVERLAY, MSG_MINIMIZE_OVERLAY, MSG_RESTORE_OVERLAY]);

function showRestrictedBadge(tabId: number) {
  try {
    void chrome.action.setBadgeText({ tabId, text: '!' });
    void chrome.action.setBadgeBackgroundColor({ tabId, color: '#e0a84b' });
    void chrome.action.setTitle({
      tabId,
      title: 'Inspectra cannot run on restricted browser pages (e.g. Chrome Web Store or internal pages).',
    });
    setTimeout(() => {
      try {
        void chrome.action.setBadgeText({ tabId, text: '' });
      } catch {
        /* ignore */
      }
    }, 3500);
  } catch {
    /* ignore */
  }
}

export function registerLifecycle() {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void chrome.action.setTitle({ title: 'Inspectra — Frontend AI Auditor' });
    }
  });

  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) return;
    if (tab.url && !isScannable(tab.url)) {
      showRestrictedBadge(tab.id);
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { type: MSG_TOGGLE_OVERLAY });
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/overlay.js'] });
        await chrome.tabs.sendMessage(tab.id, { type: MSG_TOGGLE_OVERLAY });
      } catch {
        showRestrictedBadge(tab.id);
      }
    }
  });

  const updateTabState = async (tabId: number, url?: string) => {
    try {
      let pageUrl = url;
      if (!pageUrl) {
        const tab = await chrome.tabs.get(tabId);
        pageUrl = tab.url;
      }
      const ok = isScannable(pageUrl);
      await chrome.action.setTitle({
        tabId,
        title: ok ? 'Inspectra — Frontend AI Auditor' : 'Inspectra (this page cannot be scanned)',
      });
    } catch {
      /* ignore */
    }
  };

  chrome.tabs.onActivated.addListener((info) => {
    void updateTabState(info.tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      void updateTabState(tabId, changeInfo.url || tab.url);
    }
  });

  // Relay overlay control messages from the iframe to the page content script.
  chrome.runtime.onMessage.addListener((message: { type?: string }, sender, sendResponse) => {
    if (message?.type && RELAY_TYPES.has(message.type)) {
      const targetTabId = sender.tab?.id;
      if (targetTabId !== undefined) {
        chrome.tabs.sendMessage(targetTabId, message).then((response) => {
          sendResponse(response ?? { ok: true });
        }).catch(() => {
          sendResponse({ ok: false, error: 'content script unreachable' });
        });
        return true;
      }

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


