import { useState } from 'react';
import type { AuditIssue } from '../../shared/types';
import { SEVERITY_STYLE, severityLabel } from './severity';

export default function IssueCard({
  issue,
  index,
  onSelect,
}: {
  issue: AuditIssue;
  index: number;
  onSelect?: () => void;
}) {
  const [open, setOpen] = useState(index < 3);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => {
          setOpen((o) => !o);
          onSelect?.();
        }}
        className="w-full px-3.5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${SEVERITY_STYLE[issue.severity]}`}
          >
            {severityLabel(issue.severity)}
          </span>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
            {issue.category}
          </span>
          {issue.viewport && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
              {issue.viewport}
            </span>
          )}
          {issue.stateId && (
            <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-indigo-700">
              {issue.stateId}
            </span>
          )}
          <span className="ml-auto text-[11px] font-semibold text-slate-400">
            {Math.round(issue.confidence * 100)}% conf
          </span>
        </div>

        <p className="mt-1.5 text-sm font-semibold leading-snug text-slate-900">
          {index + 1}. {issue.title || (issue.problem.length > 120 ? `${issue.problem.slice(0, 117)}…` : issue.problem)}
        </p>

        <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
          {issue.selector || issue.element}
        </p>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3.5 py-3 text-[13px] leading-relaxed">
          {issue.title && issue.title !== issue.problem && (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Description</p>
              <p className="mt-0.5 text-slate-700">{issue.problem}</p>
            </div>
          )}

          <div className="mb-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Evidence</p>
            <p className="mt-0.5 text-slate-700">{issue.evidence}</p>
          </div>

          {issue.rootCause && (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Root Cause</p>
              <p className="mt-0.5 text-slate-700">{issue.rootCause}</p>
            </div>
          )}

          {issue.whyItMatters && (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">User Impact</p>
              <p className="mt-0.5 text-slate-700">{issue.whyItMatters}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Suggested Fix</p>
            <p className="mt-0.5 text-slate-700">{issue.suggestedFix || issue.recommendedFix}</p>
          </div>

          {issue.selector && (
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
              <span className="truncate font-mono text-[10px] text-slate-400">{issue.selector}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.();
                }}
                className="shrink-0 rounded bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                Focus on Page
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
