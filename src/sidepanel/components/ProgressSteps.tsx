import { STAGE_LABELS, type ScanStage } from '../hooks/useScan';

const ORDER: ScanStage[] = ['reading', 'inspecting', 'layout', 'responsive', 'visual', 'analyzing'];

export default function ProgressSteps({ stage }: { stage: ScanStage }) {
  const activeIdx = ORDER.indexOf(stage);
  return (
    <div className="in-card flex flex-col gap-2.5 rounded-xl p-4">
      <p className="in-title text-sm font-semibold">Scanning Frontend</p>
      {STAGE_LABELS.map(({ stage: s, label }, i) => {
        const done = activeIdx > i || stage === 'done';
        const active = activeIdx === i;
        return (
          <div key={s} className="flex items-center gap-2.5 text-sm">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold ${
                done
                  ? 'border-[var(--in-ok)] text-[var(--in-ok)]'
                  : active
                    ? 'border-[var(--in-accent)] text-[var(--in-accent)]'
                    : 'in-caption border-current'
              }`}
              style={done ? { background: 'var(--in-ok-wash)' } : undefined}
            >
              {done ? '✓' : active ? '●' : '○'}
            </span>
            <span className={done || active ? 'in-title' : 'in-caption'}>{label}</span>
          </div>
        );
      })}
      <div className="in-well mt-1 h-1.5 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(100, ((activeIdx + 1) / ORDER.length) * 100)}%`,
            background: 'var(--in-accent)',
          }}
        />
      </div>
    </div>
  );
}
