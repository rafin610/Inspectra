import type { IssueSeverity } from '../../shared/types';

export const SEVERITY_STYLE: Record<IssueSeverity, string> = {
  critical: 'in-sev in-sev-critical',
  major: 'in-sev in-sev-major',
  important: 'in-sev in-sev-major',
  minor: 'in-sev in-sev-minor',
  suggestion: 'in-sev in-sev-suggestion',
  improvement: 'in-sev in-sev-suggestion',
  'potential-cleanup': 'in-sev in-sev-cleanup',
};

export const SEVERITY_DOT: Record<IssueSeverity, string> = {
  critical: 'bg-red-400',
  major: 'bg-orange-400',
  important: 'bg-orange-400',
  minor: 'bg-amber-300',
  suggestion: 'bg-sky-400',
  improvement: 'bg-sky-400',
  'potential-cleanup': 'bg-violet-400',
};

export function severityLabel(s: IssueSeverity): string {
  if (s === 'important') return 'major';
  if (s === 'improvement') return 'suggestion';
  return s === 'potential-cleanup' ? 'cleanup' : s;
}
