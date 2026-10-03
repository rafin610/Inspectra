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
    <div className="in-card rounded-xl">
      <div className="flex items-center justify-between px-3.5 pt-3">
        <p className="in-title text-sm font-bold">AI Fix Prompt</p>
        <span className="in-caption text-[11px]">{prompt.length.toLocaleString()} chars</span>
      </div>
      <div className="px-3.5 py-2.5">
        <pre className="in-code max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 font-mono text-[11px] leading-relaxed">
          {prompt}
        </pre>
      </div>
      <div className="flex gap-2 px-3.5 pb-3.5">
        <button
          onClick={copy}
          className={`flex-1 px-4 py-2.5 text-sm transition-colors ${copied ? 'in-btn-ok' : 'in-btn-primary'}`}
        >
          {copied ? '✓ Prompt copied' : 'Copy Prompt'}
        </button>
        <button
          onClick={onScanAgain}
          className="in-btn-ghost px-4 py-2.5 text-sm font-medium"
        >
          Scan Again
        </button>
      </div>
    </div>
  );
}
