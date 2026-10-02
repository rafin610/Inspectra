import type { AIProviderConfig, AuditResult, WebsiteAnalysis } from '../shared/types';
import { ConfigError, getAdapter } from './adapters';

/**
 * Builds the compact, evidence-driven audit request body.
 * No raw HTML, no input values, no cookies/tokens — only the structured
 * signals the scanners collected.
 */
export function buildAuditUserPrompt(analysis: WebsiteAnalysis): string {
  const p = analysis.page;
  const elLines = analysis.elements.slice(0, 120).map((e) => {
    const styleBits = [
      e.styles.fontSize ? `fs=${e.styles.fontSize}` : '',
      e.styles.color ? `c=${e.styles.color}` : '',
      e.styles.backgroundColor ? `bg=${e.styles.backgroundColor}` : '',
      e.styles.display ? `d=${e.styles.display}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `- <${e.tag}> ${e.selector} ${e.rect.width}x${e.rect.height}@(${e.rect.x},${e.rect.y})${e.text ? ` text="${e.text.slice(0, 80)}"` : ''}${styleBits ? ` [${styleBits}]` : ''}${e.overflow.clipped ? ' CLIPPED' : ''}`;
  });

  const signalLines = analysis.layoutSignals.slice(0, 80).map(
    (s) => `- [${s.kind}] ${s.selector}: ${s.detail}`,
  );

  return [
    `PAGE: title="${p.title}" url="${p.url}" viewport=${p.viewportWidth}x${p.viewportHeight} dpr=${p.devicePixelRatio} scroll=${p.scrollWidth}x${p.scrollHeight} overflowX=${p.hasHorizontalOverflow}${p.framework ? ` framework=${p.framework}(${p.frameworkConfidence})` : ''}`,
    ``,
    `RESPONSIVE: overflow=${analysis.responsive.hasHorizontalOverflow} (${analysis.responsive.overflowPx}px) viewportMeta=${analysis.responsive.hasViewportMeta} mediaQueries=${analysis.responsive.mediaQueryCount} smallTapTargets=${analysis.responsive.smallTapTargets} tinyText=${analysis.responsive.tinyTextNodes}`,
    analysis.responsive.fixedWidthElements.length
      ? `FIXED-WIDTH RISKS: ${analysis.responsive.fixedWidthElements.map((f) => `${f.selector}(${f.width})`).join(', ')}`
      : `FIXED-WIDTH RISKS: none detected`,
    ``,
    `TYPOGRAPHY: headings=[${analysis.typography.headingOrder.join(',') || 'none'}] fonts=[${analysis.typography.fontFamilies.join('|') || 'unknown'}] sizes=[${analysis.typography.fontSizes.join(',') || 'unknown'}] minBody=${analysis.typography.minBodySize ?? 'n/a'}`,
    `VISUAL: colors=[${analysis.visual.colors.slice(0, 10).join(',') || 'n/a'}] radii=[${analysis.visual.borderRadii.join(',') || 'n/a'}]`,
    analysis.clutter.length
      ? `CLUTTER HINTS: ${analysis.clutter.map((c) => `${c.selector}: ${c.reason}`).join(' | ')}`
      : `CLUTTER HINTS: none`,
    ``,
    `ELEMENTS (${analysis.elementCount} sampled):`,
    ...elLines,
    ``,
    `DETECTED SIGNALS:`,
    ...(signalLines.length ? signalLines : ['- (no automatic signals — judge from elements + styles)']),
  ].join('\n');
}

export const AUDIT_SYSTEM_PROMPT = `You are a senior frontend engineer, UI/UX designer, accessibility reviewer, responsive design specialist, and frontend QA engineer.

PRODUCT PHILOSOPHY — follow strictly:
- Report MEANINGFUL problems only. Ignore trivial pixel differences.
- Three buckets:
  (1) Actual Problem — clearly broken or harms usability (overflow, clipped button, broken alignment, unreadable text, overlap).
  (2) Design Improvement — works but hierarchy/spacing/consistency/CTA is significantly weak.
  (3) Potential Cleanup — possibly redundant UI (duplicate CTA, badge, excessive icon, redundant section) but you CANNOT verify business purpose. Never confidently order deletion; phrase as "verify before removing".
- Evidence-driven: every issue must cite observed evidence from the payload. NEVER hallucinate elements, viewports you did not measure, backend behavior, or hidden functionality.
- Separate DETECTED FACT from DESIGN RECOMMENDATION. Do not call a preference a defect. For each finding provide concrete observed evidence, an explanation of user impact, and confidence from 0.0 to 1.0.
- Set selector only to an exact selector string present in the ELEMENTS or DETECTED SIGNALS payload. Otherwise set selector to an empty string and describe the location as a visual observation with mapping unavailable. Never invent selectors.
- Do not claim a specific viewport was tested unless it is in the payload. Unmeasured responsive widths are risk predictions, not findings.
- Group repeated symptoms when they share one likely root cause. Use potentialCleanup for uncertain redundancy.
- Respect the existing design language. Do not propose a redesign.
- The current viewport is given. Reason about other widths (390px mobile, 768px tablet, 1440px desktop) ONLY as risk predictions grounded in fixed widths / overflow / tap targets — label them as risks, not certainties.
- Frontend only. No backend, database, security, or auth commentary.

OUTPUT — return ONLY a single JSON object, no prose, no markdown fences:
{
  "summary": "2-3 sentence overall frontend assessment",
  "issues": [
    {"id":"UI-001","category":"layout|spacing|responsive|visual|color|contrast|typography|ux|interaction|content|accessibility|cleanup","severity":"critical|major|minor|suggestion","element":"selector or human-readable location","selector":"exact selector from evidence, otherwise empty string","viewport":"current or measured width only","problem":"concise issue title and description","evidence":"observed measurement or structure","whyItMatters":"specific user impact","recommendedFix":"root-cause-oriented frontend fix","confidence":0.0}
  ],
  "potentialCleanup": [
    {"id":"CL-001","element":"selector or region","reason":"why it looks redundant","recommendation":"verify purpose, then consolidate/remove"}
  ],
  "overallAssessment": "paragraph: strongest + weakest areas + what to fix first"
}

RULES:
- Max 25 issues, ordered critical → suggestion. On a clean page return no issues, never filler.
- severity "critical" only for broken/unusable states with direct evidence (overflow, overlap, clipped CTA, unreadable text).
- Confidence below 0.50 must not be returned. 0.50–0.69 is a possible issue or suggestion; 0.70–0.89 is medium confidence; 0.90–1.0 requires direct, strong evidence.
- Put uncertain redundancy ONLY in potentialCleanup, never as critical issues.`;

/**
 * Runs the full AI audit with the user's own provider configuration:
 * validates required fields (naming exactly what is missing — never
 * substituting a default), then delegates to the format adapter.
 * The configured model string is sent verbatim; no fallback exists.
 */
export async function runAudit(
  config: AIProviderConfig,
  analysis: WebsiteAnalysis,
  opts?: { screenshot?: string | null },
): Promise<AuditResult> {
  const adapter = getAdapter(config.format);
  const gaps = adapter.validate(config);
  if (gaps.length > 0) throw new ConfigError(gaps);
  const audit = await adapter.analyze(config, analysis, { screenshot: opts?.screenshot });
  const observedSelectors = new Set([
    ...analysis.elements.map((element) => element.selector),
    ...analysis.layoutSignals.map((signal) => signal.selector),
  ]);
  return {
    ...audit,
    issues: audit.issues.map((issue) => {
      const selector = issue.selector && observedSelectors.has(issue.selector) ? issue.selector : undefined;
      const isSuggestion = issue.confidence < 0.7;
      return {
        ...issue,
        selector,
        severity: isSuggestion ? 'improvement' : issue.severity,
        problem: isSuggestion && !/^possible issue:/i.test(issue.problem)
          ? `Possible issue: ${issue.problem}`
          : issue.problem,
      };
    }),
  };
}
