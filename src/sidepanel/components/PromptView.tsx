import { useState } from 'react';

export default function PromptView({ prompt, onScanAgain }: { prompt: string; onScanAgain: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Clipboard API can be blocked — fall back to execCommand.
      const ta = document.createElement('textarea');
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-3.5 pt-3">
        <p className="text-sm font-bold text-slate-900">AI Fix Prompt</p>
        <span className="text-[11px] text-slate-400">{prompt.length.toLocaleString()} chars</span>
      </div>
      <div className="px-3.5 py-2.5">
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
          {prompt}
        </pre>
      </div>
      <div className="flex gap-2 px-3.5 pb-3.5">
        <button
          onClick={copy}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors ${
            copied ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {copied ? '✓ Prompt copied' : 'Copy Prompt'}
        </button>
        <button
          onClick={onScanAgain}
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
        >
          Scan Again
        </button>
      </div>
    </div>
  );
}
