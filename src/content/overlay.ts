const OVERLAY_HOST_ID = 'inspectra-floating-overlay-host';
const MSG_TOGGLE_OVERLAY = 'INSPECTRA_TOGGLE_OVERLAY';

function createOverlay(): HTMLElement {
  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  host.setAttribute('data-inspectra-overlay', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    width: 'min(460px, calc(100vw - 24px))',
    height: 'min(780px, 80vh)',
    maxHeight: 'calc(100vh - 24px)',
    zIndex: '2147483647',
    borderRadius: '20px',
    overflow: 'hidden',
    boxShadow: '0 24px 56px rgba(15, 23, 42, 0.2)',
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: '#f8fafc',
    pointerEvents: 'auto',
  });

  const frame = document.createElement('iframe');
  frame.title = 'Inspectra';
  frame.src = chrome.runtime.getURL('sidepanel.html');
  frame.setAttribute('allow', 'clipboard-read; clipboard-write');
  Object.assign(frame.style, {
    display: 'block',
    width: '100%',
    height: '100%',
    border: '0',
    background: '#f8fafc',
  });
  host.appendChild(frame);
  document.documentElement.appendChild(host);
  return host;
}

function toggleOverlay(): void {
  const existing = document.getElementById(OVERLAY_HOST_ID);
  if (existing) {
    existing.remove();
    return;
  }
  createOverlay();
}

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
  if (message?.type !== MSG_TOGGLE_OVERLAY) return false;
  toggleOverlay();
  sendResponse({ ok: true, open: Boolean(document.getElementById(OVERLAY_HOST_ID)) });
  return true;
});

export {};
