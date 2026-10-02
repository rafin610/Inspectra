import type { AgentProgress } from '../../agent/agent-core';

export default function AgentExploringView({
  progress,
  onPause,
  onResume,
  onStop,
}: {
  progress: AgentProgress | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  const status = progress?.status ?? 'exploring';
  const step = progress?.currentStep ?? 0;
  const maxSteps = progress?.maxSteps ?? 30;
  const percent = Math.min(100, Math.round((step / Math.max(1, maxSteps)) * 100));

  const isPaused = status === 'paused';
  const isSynthesizing = status === 'synthesizing';

  return (
    <div className="flex flex-col gap-3">
      {/* Header card */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/60 to-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-2.5 w-2.5 rounded-full ${
                isPaused
                  ? 'bg-amber-500'
                  : isSynthesizing
                    ? 'animate-bounce bg-purple-500'
                    : 'animate-pulse bg-emerald-500'
              }`}
            />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Inspectra Agent · {isPaused ? 'Paused' : isSynthesizing ? 'Synthesizing Audit' : 'Exploring'}
            </span>
          </div>
          <span className="font-mono text-xs font-semibold text-indigo-700">
            Step {step} / {maxSteps}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Current State & Action */}
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Current State</p>
          <p className="truncate text-xs font-semibold text-slate-800">
            {progress?.currentStateTitle || 'Initial Page'}
          </p>

          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Current Action</p>
          <p className="text-xs font-medium text-indigo-900">
            {progress?.currentActionDescription || 'Analyzing page...'}
          </p>
        </div>

        {/* Controls */}
        <div className="mt-3 flex gap-2">
          {isPaused ? (
            <button
              onClick={onResume}
              className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              ▶ Resume
            </button>
          ) : (
            <button
              onClick={onPause}
              disabled={isSynthesizing}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              ⏸ Pause
            </button>
          )}

          <button
            onClick={onStop}
            disabled={isSynthesizing}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            ⏹ Stop Audit
          </button>
        </div>

        {/* Live Counters */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          <span>
            Issues found:{' '}
            <strong className="text-amber-700">{progress?.issues.length ?? 0}</strong>
          </span>
          <span>
            States inspected:{' '}
            <strong className="text-slate-700">{progress?.statesInspected.length ?? 1}</strong>
          </span>
          <span>
            Clicks left:{' '}
            <strong className="text-slate-700">{progress?.clicksRemaining ?? 15}</strong>
          </span>
        </div>
      </div>

      {/* Live Exploration Timeline */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Exploration Timeline</h3>
          <span className="text-[11px] text-slate-400">
            {progress?.timeline.length ?? 0} actions recorded
          </span>
        </div>

        <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
          {(!progress?.timeline || progress.timeline.length === 0) && (
            <p className="py-4 text-center text-xs text-slate-400">Observing initial page...</p>
          )}

          {progress?.timeline.map((stepItem, idx) => {
            const isIssue = stepItem.action.action === 'MARK_ISSUE';
            const actionType = stepItem.action.action;

            return (
              <div
                key={idx}
                className={`flex items-start gap-2 rounded-lg p-2 text-xs transition-colors ${
                  isIssue ? 'bg-amber-50/80 ring-1 ring-amber-200' : 'bg-slate-50'
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    isIssue
                      ? 'bg-amber-200 text-amber-900'
                      : actionType === 'CLICK'
                        ? 'bg-blue-100 text-blue-800'
                        : actionType === 'SCROLL'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {actionType}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{stepItem.description}</p>
                  <p className="font-mono text-[10px] text-slate-400">{stepItem.stateId}</p>
                </div>

                <span className="shrink-0 text-slate-400">
                  {stepItem.result?.success ? '✓' : isIssue ? '⚠' : '•'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
