import { STAGE_LABELS, type ScanStage } from '../hooks/useScan';

const ORDER: ScanStage[] = ['reading', 'inspecting', 'layout', 'responsive', 'visual', 'analyzing'];

export default function ProgressSteps({ stage }: { stage: ScanStage }) {
  const activeIdx = ORDER.indexOf(stage);
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Scanning Frontend</p>
      {STAGE_LABELS.map(({ stage: s, label }, i) => {
        const done = activeIdx > i || stage === 'done';
        const active = activeIdx === i;
        return (
          <div key={s} className="flex items-center gap-2.5 text-sm">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold ${
                done
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : active
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-slate-300 text-slate-300'
              }`}
            >
              {done ? '✓' : active ? '●' : '○'}
            </span>
            <span className={done || active ? 'text-slate-800' : 'text-slate-400'}>{label}</span>
          </div>
        );
      })}
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-indigo-600 transition-all duration-500"
          style={{ width: `${Math.min(100, ((activeIdx + 1) / ORDER.length) * 100)}%` }}
        />
      </div>
    </div>
  );
}
