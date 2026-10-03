import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/globals.css';

function Popup() {
  const [domain, setDomain] = useState('');
  const [scannable, setScannable] = useState(true);

  useEffect(() => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
      try {
        if (tab?.url) {
          const u = new URL(tab.url);
          setDomain(u.hostname);
          setScannable(/^(http|https):$/.test(u.protocol));
        } else {
          setDomain('');
          setScannable(false);
        }
      } catch {
        setDomain(tab?.url ?? '');
        setScannable(false);
      }
    });
  }, []);

  async function openAuditor() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id !== undefined) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'INSPECTRA_TOGGLE_OVERLAY' });
      } catch {
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/overlay.js'] });
          await chrome.tabs.sendMessage(tab.id, { type: 'INSPECTRA_TOGGLE_OVERLAY' });
        } catch {
          // Silent fallback when the page is not ready or is restricted.
        }
      }
    }
    window.close();
  }

  return (
    <div className="in-app w-72 p-4">
      <div className="flex items-center gap-2">
        <div className="in-btn-primary flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold">
          In
        </div>
        <div>
          <h1 className="in-title text-sm font-bold">Inspectra</h1>
          <p className="in-caption text-xs">Frontend AI Auditor</p>
        </div>
      </div>

      <div className="in-well mt-3 rounded-lg px-3 py-2">
        <p className="in-caption text-xs">Current website</p>
        <p className="in-title truncate text-sm font-medium">{domain || '—'}</p>
      </div>

      {!scannable && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--in-warn)]">
          This page cannot be scanned by Chrome extensions.
        </p>
      )}

      <button
        onClick={openAuditor}
        className="in-btn-primary mt-3 w-full px-4 py-2 text-sm"
      >
        Open Auditor
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
