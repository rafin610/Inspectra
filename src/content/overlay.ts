const OVERLAY_HOST_ID = 'inspectra-floating-overlay-host';
const MINIMIZED_BTN_ID = 'inspectra-minimized-btn';
const MSG_TOGGLE_OVERLAY = 'INSPECTRA_TOGGLE_OVERLAY';
const MSG_CLOSE_OVERLAY = 'INSPECTRA_CLOSE_OVERLAY';
const MSG_MINIMIZE_OVERLAY = 'INSPECTRA_MINIMIZE_OVERLAY';
const MSG_RESTORE_OVERLAY = 'INSPECTRA_RESTORE_OVERLAY';

// Guard against duplicate injection
const win = window as unknown as { __INSPECTRA_OVERLAY_LOADED?: boolean };
if (!win.__INSPECTRA_OVERLAY_LOADED) {
  win.__INSPECTRA_OVERLAY_LOADED = true;

  // ── State ────────────────────────────────────────────────────────────────
  type OverlayState = 'CLOSED' | 'OPEN' | 'MINIMIZED';
  let currentState: OverlayState = 'CLOSED';

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getHost(): HTMLElement | null {
    return document.getElementById(OVERLAY_HOST_ID);
  }

  function getMinimizedBtn(): HTMLElement | null {
    return document.getElementById(MINIMIZED_BTN_ID);
  }

  /** Remove everything Inspectra has injected into the page. */
  function removeAll(): void {
    getHost()?.remove();
    getMinimizedBtn()?.remove();
    try {
      document.getElementById('inspectra-issue-marker-layer')?.remove();
      window.dispatchEvent(new CustomEvent('inspectra-clear-markers'));
    } catch {
      /* ignore */
    }
    currentState = 'CLOSED';
  }

  // ── Create the full overlay ──────────────────────────────────────────────

  function createOverlay(): HTMLElement {
    // Ensure no duplicates
    getHost()?.remove();
    getMinimizedBtn()?.remove();

    const host = document.createElement('div');
    host.id = OVERLAY_HOST_ID;
    host.setAttribute('data-inspectra-overlay', 'true');
    host.style.all = 'initial';
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
      boxShadow: '0 24px 56px rgba(15, 23, 42, 0.45)',
      border: '1px solid rgba(148, 163, 184, 0.25)',
      background: '#16181d',
      pointerEvents: 'auto',
      transition: 'opacity 200ms ease, transform 200ms ease',
      opacity: '1',
      transform: 'scale(1)',
      colorScheme: 'dark',
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
      background: '#16181d',
      colorScheme: 'dark',
    });
    host.appendChild(frame);
    document.documentElement.appendChild(host);

    currentState = 'OPEN';
    return host;
  }

  // ── Create the minimized floating button ─────────────────────────────────

  function createMinimizedButton(): HTMLElement {
    // Remove existing if any
    getMinimizedBtn()?.remove();

    const btn = document.createElement('button');
    btn.id = MINIMIZED_BTN_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open Inspectra');
    btn.setAttribute('title', 'Open Inspectra');
    btn.style.all = 'initial';
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '48px',
      height: '48px',
      zIndex: '2147483647',
      borderRadius: '14px',
      border: '1px solid rgba(148, 163, 184, 0.45)',
      background: 'linear-gradient(135deg, #6f96e8 0%, #5b7fd4 100%)',
      color: '#ffffff',
      fontWeight: '800',
      fontSize: '14px',
      lineHeight: '1',
      cursor: 'pointer',
      boxShadow: '0 4px 20px rgba(111, 150, 232, 0.35), 0 2px 8px rgba(0,0,0,0.15)',
      pointerEvents: 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'transform 200ms ease, box-shadow 200ms ease, opacity 200ms ease',
      opacity: '1',
      transform: 'scale(1)',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      padding: '0',
      margin: '0',
      outline: 'none',
      letterSpacing: 'normal',
      textTransform: 'none',
      textDecoration: 'none',
      textAlign: 'center',
      boxSizing: 'border-box',
    });
    btn.textContent = 'In';

    // Hover effect
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.08)';
      btn.style.boxShadow = '0 6px 28px rgba(111, 150, 232, 0.5), 0 2px 10px rgba(0,0,0,0.2)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 20px rgba(111, 150, 232, 0.35), 0 2px 8px rgba(0,0,0,0.15)';
    });

    // Click to restore
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      restoreOverlay();
    });

    document.documentElement.appendChild(btn);
    return btn;
  }

  // ── State transitions ────────────────────────────────────────────────────

  function minimizeOverlay(): void {
    const host = getHost();
    if (host) {
      // Animate out
      host.style.opacity = '0';
      host.style.transform = 'scale(0.95)';
      setTimeout(() => {
        host.style.display = 'none';
      }, 200);
    }
    createMinimizedButton();
    currentState = 'MINIMIZED';
  }

  function restoreOverlay(): void {
    getMinimizedBtn()?.remove();

    let host = getHost();
    if (host) {
      // Restore visibility
      host.style.display = '';
      // Force reflow to trigger transition
      void host.offsetHeight;
      host.style.opacity = '1';
      host.style.transform = 'scale(1)';
    } else {
      // Host was somehow removed, recreate
      host = createOverlay();
    }
    currentState = 'OPEN';
  }

  function closeOverlay(): boolean {
    const hadOverlay = !!(getHost() || getMinimizedBtn());
    removeAll();
    return hadOverlay;
  }

  function toggleOverlay(): void {
    if (currentState === 'OPEN') {
      closeOverlay();
    } else if (currentState === 'MINIMIZED') {
      restoreOverlay();
    } else {
      createOverlay();
    }
  }

  // ── Message listener ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
    if (message?.type === MSG_TOGGLE_OVERLAY) {
      toggleOverlay();
      sendResponse({ ok: true, state: currentState });
      return true;
    }
    if (message?.type === MSG_CLOSE_OVERLAY) {
      const removed = closeOverlay();
      sendResponse({ ok: true, removed, state: currentState });
      return true;
    }
    if (message?.type === MSG_MINIMIZE_OVERLAY) {
      minimizeOverlay();
      sendResponse({ ok: true, state: currentState });
      return true;
    }
    if (message?.type === MSG_RESTORE_OVERLAY) {
      restoreOverlay();
      sendResponse({ ok: true, state: currentState });
      return true;
    }
    return false;
  });
}

export {};
