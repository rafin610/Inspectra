import type { AuditResult, ExplorationStep, StateRecord, WebsiteAnalysis } from '../shared/types';

/**
 * Generates one complete, implementation-ready prompt that a user can paste
 * directly into their coding AI (e.g. Claude, Cursor, ChatGPT, Gemini) to fix
 * the exact frontend issues discovered during the audit (Section 35 & 36).
 */
export function generateFixPrompt(
  audit: AuditResult,
  page: WebsiteAnalysis['page'],
  explorationHistory?: ExplorationStep[],
  statesVisited?: StateRecord[],
): string {
  const lines: string[] = [];

  lines.push('You are a senior frontend engineer, UI/UX specialist, and accessibility expert.');
  lines.push('');
  lines.push('I have an existing web application that has undergone a comprehensive autonomous frontend audit using Inspectra.');
  lines.push('');
  lines.push('Your task is to fix the confirmed frontend defects and responsive issues described below. Do NOT rebuild the website or unrelated components.');
  lines.push('');
  lines.push('============================================================');
  lines.push('1. PROJECT & AUDIT CONTEXT');
  lines.push('============================================================');
  lines.push(`- Page Title: "${page.title || '(untitled)'}"`);
  lines.push(`- URL: ${page.url}`);
  lines.push(`- Audited Viewport: ${page.viewportWidth}x${page.viewportHeight} (DPR: ${page.devicePixelRatio || 1})`);
  if (page.framework) {
    lines.push(`- Detected Framework: ${page.framework} (confidence: ${page.frameworkConfidence ?? 'unknown'})`);
  }
  if (statesVisited && statesVisited.length > 0) {
    lines.push(`- UI States Inspected (${statesVisited.length}):`);
    statesVisited.forEach((s) => {
      lines.push(`  • [${s.stateId}] ${s.title}${s.triggeringAction ? ` (via: ${s.triggeringAction})` : ''}`);
    });
  } else if (audit.statesInspectedCount) {
    lines.push(`- Distinct UI States Inspected: ${audit.statesInspectedCount}`);
  }
  lines.push('');

  lines.push('============================================================');
  lines.push('2. EXECUTIVE AUDIT ASSESSMENT');
  lines.push('============================================================');
  lines.push(audit.overallAssessment || audit.summary);
  lines.push('');

  lines.push('============================================================');
  lines.push(`3. DETAILED AUDIT FINDINGS (${audit.issues.length} Issues)`);
  lines.push('============================================================');

  if (audit.issues.length === 0) {
    lines.push('No meaningful frontend defects were found. No modifications required.');
  } else {
    audit.issues.forEach((issue, i) => {
      const num = i + 1;
      const title = issue.title || shortTitle(issue.problem);
      lines.push(`### Issue #${num}: [${issue.severity.toUpperCase()}] ${title}`);
      lines.push(`- Category: ${issue.category}`);
      lines.push(`- Severity: ${issue.severity}`);
      lines.push(`- Confidence: ${Math.round(issue.confidence * 100)}%`);
      if (issue.stateId) lines.push(`- Detected in State: ${issue.stateId}`);
      if (issue.triggeredBy) lines.push(`- Triggered By: ${issue.triggeredBy}`);
      if (issue.viewport) lines.push(`- Viewport: ${issue.viewport}`);
      lines.push(`- Affected Element: ${issue.element}`);
      if (issue.selector) lines.push(`- Verified DOM Selector: \`${issue.selector}\``);
      lines.push('');
      lines.push('PROBLEM:');
      lines.push(issue.problem);
      lines.push('');
      lines.push('EVIDENCE (Observed in DOM/Layout/Styles):');
      lines.push(issue.evidence);
      lines.push('');
      if (issue.rootCause) {
        lines.push('ROOT CAUSE:');
        lines.push(issue.rootCause);
        lines.push('');
      }
      if (issue.whyItMatters) {
        lines.push('USER IMPACT:');
        lines.push(issue.whyItMatters);
        lines.push('');
      }
      lines.push('REQUIRED FIX:');
      lines.push(issue.suggestedFix || issue.recommendedFix);
      lines.push('');
      lines.push('------------------------------------------------------------');
    });
  }

  if (audit.potentialCleanup.length > 0) {
    lines.push('');
    lines.push('============================================================');
    lines.push('4. POTENTIAL CLEANUP CANDIDATES');
    lines.push('============================================================');
    lines.push('The following elements appear potentially redundant or unneeded. Please verify business requirements before removing.');
    lines.push('');
    audit.potentialCleanup.forEach((c, i) => {
      lines.push(`${i + 1}. Element: \`${c.element}\``);
      lines.push(`   Reason: ${c.reason}`);
      lines.push(`   Recommendation: ${c.recommendation}`);
      lines.push('');
    });
  }

  lines.push('');
  lines.push('============================================================');
  lines.push('5. IMPLEMENTATION RULES (PRESERVE DESIGN & STABILITY)');
  lines.push('============================================================');
  lines.push('- PRESERVE DESIGN IDENTITY: Do not perform an unrequested aesthetic redesign. Keep existing colors, typography, and theme.');
  lines.push('- PRESERVE EXISTING FUNCTIONALITY: Do not break existing user journeys, event handlers, or routes.');
  lines.push('- FIX ROOT CAUSES: Target the actual CSS/HTML/JS causes (e.g. container flex/grid constraints, overflow rules, z-index, missing min-height) rather than adding superficial patches.');
  lines.push('- RESPONSIVE DESIGN: Ensure all fixes render cleanly across mobile (375px - 414px), tablet (768px), and desktop (1280px+). Prevent horizontal scrollbars (`overflow-x`).');
  lines.push('- ACCESSIBILITY: Retain or improve keyboard navigation, ARIA attributes, contrast ratios, and visible focus indicators.');
  lines.push('- SCOPE BOUNDARY: Strictly frontend-only. Do not touch backend services, database queries, authentication tokens, or external APIs.');
  lines.push('- MINIMAL CHANGES: Keep diffs surgical, concise, and clean.');
  lines.push('');

  lines.push('============================================================');
  lines.push('6. ACCEPTANCE CRITERIA & VERIFICATION');
  lines.push('============================================================');
  lines.push('After implementing the fixes, verify:');
  lines.push('1. [ ] Mobile layout at 390px viewport renders without horizontal overflow or clipping.');
  lines.push('2. [ ] Navigation menus, dropdowns, and modal dialogs open, close, and fit inside viewport bounds.');
  lines.push('3. [ ] All buttons and links have adequate touch targets (minimum 24x24px, preferably 44x44px).');
  lines.push('4. [ ] Text and headings are legible and maintain proper hierarchy without overlapping.');
  lines.push('5. [ ] Interactive controls maintain appropriate hover, active, and focus-visible states.');
  lines.push('6. [ ] Existing functionality and layout remain unbroken.');
  lines.push('');
  lines.push('Please output the exact file diffs or updated code snippets to resolve all confirmed issues.');

  return lines.join('\n');
}

function shortTitle(problem: string): string {
  const first = problem.split(/(?<=[.!?])\s/)[0] ?? problem;
  return first.length > 90 ? `${first.slice(0, 87)}…` : first;
}
