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
      <div className="in-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-2.5 w-2.5 rounded-full ${
                isPaused
                  ? 'bg-amber-400'
                  : isSynthesizing
                    ? 'animate-bounce bg-violet-400'
                    : 'animate-pulse bg-emerald-400'
              }`}
            />
            <span className="in-title text-xs font-bold uppercase tracking-wider">
              Inspectra Agent · {isPaused ? 'Paused' : isSynthesizing ? 'Synthesizing Audit' : 'Exploring'}
            </span>
          </div>
          <span className="font-mono text-xs font-semibold text-[var(--in-accent)]">
            Step {step} / {maxSteps}
          </span>
        </div>

        {/* Progress bar */}
        <div className="in-well mt-2.5 h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${percent}%`, background: 'var(--in-accent)' }}
          />
        </div>

        {/* Current State & Action */}
        <div className="in-well mt-3 rounded-xl p-3">
          <p className="in-caption text-[10px] font-bold uppercase tracking-wide">Current State</p>
          <p className="in-title truncate text-xs font-semibold">
            {progress?.currentStateTitle || 'Initial Page'}
          </p>

          <p className="in-caption mt-2 text-[10px] font-bold uppercase tracking-wide">Current Action</p>
          <p className="in-body text-xs font-medium">
            {progress?.currentActionDescription || 'Analyzing page...'}
          </p>
        </div>

        {/* Controls */}
        <div className="mt-3 flex gap-2">
          {isPaused ? (
            <button
              onClick={onResume}
              className="in-btn-primary flex-1 px-3 py-2 text-xs"
            >
              ▶ Resume
            </button>
          ) : (
            <button
              onClick={onPause}
              disabled={isSynthesizing}
              className="in-btn-ghost flex-1 px-3 py-2 text-xs font-semibold"
            >
              ⏸ Pause
            </button>
          )}

          <button
            onClick={onStop}
            disabled={isSynthesizing}
            className="in-btn-danger-ghost px-3 py-2 text-xs font-semibold"
          >
            ⏹ Stop Audit
          </button>
        </div>

        {/* Live Counters */}
        <div className="in-body mt-3 flex items-center justify-between border-t in-divider pt-2 text-[11px]">
          <span>
            Issues found:{' '}
            <strong className="text-[var(--in-warn)]">{progress?.issues.length ?? 0}</strong>
          </span>
          <span>
            States inspected:{' '}
            <strong className="in-title">{progress?.statesInspected.length ?? 1}</strong>
          </span>
          <span>
            Clicks left:{' '}
            <strong className="in-title">{progress?.clicksRemaining ?? 15}</strong>
          </span>
        </div>
      </div>

      {/* Live Exploration Timeline */}
      <div className="in-card flex flex-col gap-2 rounded-2xl p-3.5">
        <div className="flex items-center justify-between">
          <h3 className="in-body text-xs font-bold uppercase tracking-wider">Exploration Timeline</h3>
          <span className="in-caption text-[11px]">
            {progress?.timeline.length ?? 0} actions recorded
          </span>
        </div>

        <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
          {(!progress?.timeline || progress.timeline.length === 0) && (
            <p className="in-caption py-4 text-center text-xs">Observing initial page...</p>
          )}

          {progress?.timeline.map((stepItem, idx) => {
            const isIssue = stepItem.action.action === 'MARK_ISSUE';
            const actionType = stepItem.action.action;

            return (
              <div
                key={idx}
                className={`flex items-start gap-2 rounded-lg p-2 text-xs transition-colors ${
                  isIssue ? 'in-notice-warn' : 'in-muted-box'
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    isIssue
                      ? 'text-[var(--in-warn)]'
                      : actionType === 'CLICK'
                        ? 'text-[var(--in-info)]'
                        : actionType === 'SCROLL'
                          ? 'text-[var(--in-accent)]'
                          : 'in-caption'
                  }`}
                  style={{ background: 'var(--in-inset)' }}
                >
                  {actionType}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="in-title truncate font-medium">{stepItem.description}</p>
                  <p className="in-caption font-mono text-[10px]">{stepItem.stateId}</p>
                </div>

                <span className="in-caption shrink-0">
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
