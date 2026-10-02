import type { IssueSeverity } from '../../shared/types';

export const SEVERITY_STYLE: Record<IssueSeverity, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  major: 'bg-orange-100 text-orange-700 border-orange-200',
  important: 'bg-orange-100 text-orange-700 border-orange-200',
  minor: 'bg-amber-100 text-amber-700 border-amber-200',
  suggestion: 'bg-blue-100 text-blue-700 border-blue-200',
  improvement: 'bg-blue-100 text-blue-700 border-blue-200',
  'potential-cleanup': 'bg-purple-100 text-purple-700 border-purple-200',
};

export const SEVERITY_DOT: Record<IssueSeverity, string> = {
  critical: 'bg-red-500',
  major: 'bg-orange-500',
  important: 'bg-orange-500',
  minor: 'bg-amber-500',
  suggestion: 'bg-blue-500',
  improvement: 'bg-blue-500',
  'potential-cleanup': 'bg-purple-500',
};

export function severityLabel(s: IssueSeverity): string {
  if (s === 'important') return 'major';
  if (s === 'improvement') return 'suggestion';
  return s === 'potential-cleanup' ? 'cleanup' : s;
}
