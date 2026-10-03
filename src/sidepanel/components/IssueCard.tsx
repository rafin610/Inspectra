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
    <div className="in-card rounded-xl">
      <button
        onClick={() => {
          setOpen((o) => !o);
          onSelect?.();
        }}
        className="w-full px-3.5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`${SEVERITY_STYLE[issue.severity]}`}>
            {severityLabel(issue.severity)}
          </span>
          <span className="in-chip rounded-md px-1.5 py-0.5 text-[11px] font-medium">
            {issue.category}
          </span>
          {issue.viewport && (
            <span className="in-chip rounded-md px-1.5 py-0.5 text-[11px] font-medium">
              {issue.viewport}
            </span>
          )}
          {issue.stateId && (
            <span className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--in-accent)]" style={{ background: 'var(--in-accent-wash)' }}>
              {issue.stateId}
            </span>
          )}
          <span className="in-caption ml-auto text-[11px] font-semibold">
            {Math.round(issue.confidence * 100)}% conf
          </span>
        </div>

        <p className="in-title mt-1.5 text-sm font-semibold leading-snug">
          {index + 1}. {issue.title || (issue.problem.length > 120 ? `${issue.problem.slice(0, 117)}…` : issue.problem)}
        </p>

        <p className="in-caption mt-0.5 truncate font-mono text-[11px]">
          {issue.selector || issue.element}
        </p>
      </button>

      {open && (
        <div className="border-t in-divider px-3.5 py-3 text-[13px] leading-relaxed">
          {issue.title && issue.title !== issue.problem && (
            <div className="mb-2">
              <p className="in-caption text-[10px] font-bold uppercase tracking-wide">Description</p>
              <p className="in-body mt-0.5">{issue.problem}</p>
            </div>
          )}

          <div className="mb-2">
            <p className="in-caption text-[10px] font-bold uppercase tracking-wide">Evidence</p>
            <p className="in-body mt-0.5">{issue.evidence}</p>
          </div>

          {issue.rootCause && (
            <div className="mb-2">
              <p className="in-caption text-[10px] font-bold uppercase tracking-wide">Root Cause</p>
              <p className="in-body mt-0.5">{issue.rootCause}</p>
            </div>
          )}

          {issue.whyItMatters && (
            <div className="mb-2">
              <p className="in-caption text-[10px] font-bold uppercase tracking-wide">User Impact</p>
              <p className="in-body mt-0.5">{issue.whyItMatters}</p>
            </div>
          )}

          <div>
            <p className="in-caption text-[10px] font-bold uppercase tracking-wide">Suggested Fix</p>
            <p className="in-body mt-0.5">{issue.suggestedFix || issue.recommendedFix}</p>
          </div>

          {issue.selector && (
            <div className="mt-3 flex items-center justify-between border-t in-divider pt-2">
              <span className="in-caption truncate font-mono text-[10px]">{issue.selector}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.();
                }}
                className="in-btn-ghost ml-2 shrink-0 px-2 py-1 text-[11px] font-semibold"
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
