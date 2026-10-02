// Validates + normalizes raw AI JSON into AuditResult. Never throws away
// the whole audit because of one malformed item.

import type { AuditIssue, AuditResult, CleanupSuggestion, IssueCategory, IssueSeverity } from '../shared/types';

const CATEGORIES: IssueCategory[] = [
  'layout', 'spacing', 'responsive', 'visual', 'color', 'contrast', 'typography', 'ux',
  'interaction', 'content', 'performance', 'accessibility', 'cleanup',
];
const SEVERITIES: IssueSeverity[] = [
  'critical', 'important', 'minor', 'improvement', 'potential-cleanup',
];

function cleanStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.slice(0, 600).trim() || fallback : fallback;
}

function normCategory(v: unknown): IssueCategory {
  return typeof v === 'string' && (CATEGORIES as string[]).includes(v.toLowerCase())
    ? (v.toLowerCase() as IssueCategory)
    : 'layout';
}

function normSeverity(v: unknown): IssueSeverity {
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s === 'critical') return 'critical';
    if (s === 'major' || s === 'important') return 'major';
    if (s === 'minor') return 'minor';
    if (s === 'suggestion' || s === 'improvement') return 'suggestion';
    if (s === 'potential-cleanup') return 'potential-cleanup';
  }
  return 'minor';
}

function normConfidence(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0.5;
  const normalized = v > 1 ? v / 100 : v;
  return Math.max(0, Math.min(1, normalized));
}

function normIssue(raw: unknown, idx: number): AuditIssue | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const problem = cleanStr(r.problem || r.title);
  if (!problem) return null;
  const title = cleanStr(r.title, problem.length > 80 ? `${problem.slice(0, 77)}…` : problem);
  const confidence = normConfidence(r.confidence);
  if (confidence < 0.5) return null;
  const recommendedFix = cleanStr(r.recommendedFix || r.suggestedFix, 'Review and fix per evidence.');
  const suggestedFix = cleanStr(r.suggestedFix || r.recommendedFix, recommendedFix);

  return {
    id: cleanStr(r.id, `UI-${String(idx + 1).padStart(3, '0')}`),
    title,
    category: normCategory(r.category),
    severity: normSeverity(r.severity),
    element: cleanStr(r.element, 'page'),
    viewport: typeof r.viewport === 'string' ? r.viewport.slice(0, 40) : undefined,
    problem,
    evidence: cleanStr(r.evidence, 'Detected during structured frontend scan.'),
    recommendedFix,
    suggestedFix,
    whyItMatters: cleanStr(r.whyItMatters),
    rootCause: cleanStr(r.rootCause),
    selector: cleanStr(r.selector || r.element),
    confidence,
    stateId: typeof r.stateId === 'string' ? r.stateId : undefined,
    triggeredBy: typeof r.triggeredBy === 'string' ? r.triggeredBy : undefined,
  };
}

function normCleanup(raw: unknown, idx: number): CleanupSuggestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const reason = cleanStr(r.reason);
  if (!reason) return null;
  return {
    id: cleanStr(r.id, `CL-${String(idx + 1).padStart(3, '0')}`),
    element: cleanStr(r.element, 'page'),
    reason,
    recommendation: cleanStr(
      r.recommendation,
      'Verify its purpose with the product owner before removing or consolidating.',
    ),
  };
}

export function validateAuditResult(raw: unknown): AuditResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('AI returned an empty or non-JSON response.');
  }
  const r = raw as Record<string, unknown>;
  const issues = Array.isArray(r.issues)
    ? r.issues.map((i, idx) => normIssue(i, idx)).filter((i): i is AuditIssue => i !== null)
    : [];
  const potentialCleanup = Array.isArray(r.potentialCleanup)
    ? r.potentialCleanup.map((c, idx) => normCleanup(c, idx)).filter((c): c is CleanupSuggestion => c !== null)
    : [];
  return {
    summary: cleanStr(r.summary, 'Frontend audit completed.'),
    issues: issues.slice(0, 40),
    potentialCleanup: potentialCleanup.slice(0, 15),
    overallAssessment: cleanStr(
      r.overallAssessment,
      cleanStr(r.summary, 'See findings below.'),
    ),
  };
}

/** Extracts JSON from a model reply that may include prose/fences. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Fast path: pure JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  // Fenced code block.
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  // Largest {...} span.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new Error('Could not parse structured JSON from the AI response.');
}
