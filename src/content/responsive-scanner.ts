// Non-destructive responsive reasoning at the CURRENT viewport.
// We never resize the user's window. Instead we flag patterns that break
// at small widths: horizontal overflow, fixed px widths, missing viewport
// meta, tiny tap targets, tiny text.

import type { ResponsiveSignal, ScannedElement } from '../shared/types';

export function analyzeResponsive(elements: ScannedElement[]): ResponsiveSignal {
  let overflowPx = 0;
  try {
    overflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  } catch {
    overflowPx = 0;
  }

  const fixedWidthElements: { selector: string; width: string }[] = [];
  let smallTapTargets = 0;
  let tinyTextNodes = 0;

  for (const el of elements) {
    const w = el.styles.width ?? '';
    // Flag rigid px widths wider than a phone.
    const m = /^(\d+(?:\.\d+)?)px$/.exec(w);
    if (m && parseFloat(m[1]) >= 480 && (el.tag === 'div' || el.tag === 'section' || el.tag === 'table' || el.tag === 'img' || el.tag === 'form')) {
      fixedWidthElements.push({ selector: el.selector, width: w });
    }
    if (el.isInteractive && el.rect.width > 0 && el.rect.height > 0) {
      if (el.rect.width < 24 || el.rect.height < 24) smallTapTargets += 1;
    }
    const fs = parseFloat(el.styles.fontSize ?? '');
    if (!Number.isNaN(fs) && fs > 0 && fs < 12 && el.text) tinyTextNodes += 1;
  }

  let mediaQueryCount = 0;
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin stylesheet — unreadable, skip.
      }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (rule.type === CSSRule.MEDIA_RULE) mediaQueryCount += 1;
        if (mediaQueryCount > 50) break;
      }
      if (mediaQueryCount > 50) break;
    }
  } catch {
    /* ignore */
  }

  let hasViewportMeta = false;
  try {
    hasViewportMeta = !!document.querySelector('meta[name="viewport"]');
  } catch {
    hasViewportMeta = false;
  }

  return {
    hasHorizontalOverflow: overflowPx > 2,
    overflowPx,
    fixedWidthElements: fixedWidthElements.slice(0, 20),
    mediaQueryCount,
    hasViewportMeta,
    smallTapTargets,
    tinyTextNodes,
  };
}
