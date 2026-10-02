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
    <div className="w-72 bg-white p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          In
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-900">Inspectra</h1>
          <p className="text-xs text-slate-500">Frontend AI Auditor</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-500">Current website</p>
        <p className="truncate text-sm font-medium text-slate-800">{domain || '—'}</p>
      </div>

      {!scannable && (
        <p className="mt-2 text-xs leading-relaxed text-amber-600">
          This page cannot be scanned by Chrome extensions.
        </p>
      )}

      <button
        onClick={openAuditor}
        className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
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
