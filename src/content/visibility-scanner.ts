// Frontend-visible accessibility + typography/visual pattern helpers.
// Advisory only — never a compliance verdict.

import type { LayoutSignal, ScannedElement } from '../shared/types';

function parseRgb(color: string): [number, number, number] | null {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  if (m) return [+m[1], +m[2], +m[3]];
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(color.trim());
  if (!hex) return null;
  let h = hex[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(fg: string, bg: string): number | null {
  const a = parseRgb(fg);
  const b = parseRgb(bg);
  if (!a || !b) return null;
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function effectiveBackground(el: Element): string {
  // Walk up until a non-transparent background is found.
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 6) {
    try {
      const bg = window.getComputedStyle(cur as HTMLElement).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    } catch {
      break;
    }
    cur = cur.parentElement;
    depth += 1;
  }
  return 'rgb(255, 255, 255)';
}

export function analyzeVisibilitySignals(elements: ScannedElement[]): LayoutSignal[] {
  const signals: LayoutSignal[] = [];

  // Map selectors → live elements for bg-color walk (cheap lookup).
  for (const el of elements) {
    const fs = parseFloat(el.styles.fontSize ?? '');
    if (el.text && !Number.isNaN(fs) && fs > 0 && fs < 12) {
      signals.push({
        kind: 'small-text',
        selector: el.selector,
        detail: `Text renders at ${el.styles.fontSize}, below comfortable reading size.`,
        metric: el.styles.fontSize,
      });
    }
    if (el.isInteractive && el.rect.width > 0 && el.rect.height > 0) {
      if (el.rect.width < 24 || el.rect.height < 24) {
        signals.push({
          kind: 'tiny-tap-target',
          selector: el.selector,
          detail: `Interactive <${el.tag}> is ${el.rect.width}×${el.rect.height}px — smaller than the ~24px minimum tap target.`,
          metric: `${el.rect.width}x${el.rect.height}`,
        });
      }
    }
  }

  // Contrast + alt + labels need live DOM access.
  try {
    const live = document.querySelectorAll('p, h1, h2, h3, h4, span, a, button, li');
    let checked = 0;
    for (const node of Array.from(live)) {
      if (checked >= 60) break;
      const htmlEl = node as HTMLElement;
      const rect = htmlEl.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const cs = window.getComputedStyle(htmlEl);
      const text = (htmlEl.textContent ?? '').trim();
      if (!text || text.length > 300) continue;
      const ratio = contrastRatio(cs.color, effectiveBackground(node));
      if (ratio !== null && ratio < 3.0) {
        // Find a selector-ish label for the report.
        const tag = node.tagName.toLowerCase();
        signals.push({
          kind: 'low-contrast',
          selector: tag,
          detail: `Text contrast ratio is ~${ratio.toFixed(2)}:1 (“${text.slice(0, 80)}”), below readable thresholds.`,
          metric: `${ratio.toFixed(2)}:1`,
        });
      }
      checked += 1;
      if (signals.length > 60) break;
    }
  } catch {
    /* ignore */
  }

  try {
    const imgs = Array.from(document.querySelectorAll('img')).slice(0, 40);
    for (const img of imgs) {
      const rect = (img as HTMLElement).getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      if (!img.getAttribute('alt')) {
        signals.push({
          kind: 'missing-alt',
          selector: 'img',
          detail: `Visible image${img.getAttribute('src') ? ` (${(img.getAttribute('src') ?? '').slice(0, 60)})` : ''} has no alt text.`,
        });
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).slice(0, 30);
    for (const input of inputs) {
      const htmlEl = input as HTMLElement;
      const rect = htmlEl.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      const type = (input as HTMLInputElement).type?.toLowerCase();
      if (type === 'hidden' || type === 'submit') continue;
      const labelled =
        !!input.getAttribute('aria-label') ||
        !!input.getAttribute('aria-labelledby') ||
        !!input.getAttribute('placeholder') ||
        (!!(input as HTMLInputElement).id && !!document.querySelector(`label[for="${(input as HTMLInputElement).id}"]`)) ||
        !!input.closest('label');
      if (!labelled) {
        signals.push({
          kind: 'missing-label',
          selector: input.tagName.toLowerCase(),
          detail: `Visible form field has no associated label, aria-label, or placeholder.`,
        });
      }
    }
  } catch {
    /* ignore */
  }

  return signals.slice(0, 80);
}

export function summarizeTypography(elements: ScannedElement[]) {
  const headingOrder: string[] = [];
  const families = new Set<string>();
  const sizes = new Set<string>();
  let minBody: number | null = null;
  for (const el of elements) {
    if (/^h[1-4]$/.test(el.tag)) headingOrder.push(el.tag.toUpperCase());
    const fam = el.styles.fontFamily;
    if (fam) fam.split(',')[0]?.trim() && families.add(fam.split(',')[0].trim().replace(/["']/g, ''));
    if (el.styles.fontSize) sizes.add(el.styles.fontSize);
    if (el.tag === 'p') {
      const v = parseFloat(el.styles.fontSize ?? '');
      if (!Number.isNaN(v) && v > 0 && (minBody === null || v < minBody)) minBody = v;
    }
  }
  return {
    headingOrder: headingOrder.slice(0, 20),
    fontFamilies: [...families].slice(0, 8),
    fontSizes: [...sizes].slice(0, 12),
    minBodySize: minBody,
  };
}

export function summarizeVisuals(elements: ScannedElement[]) {
  const colors = new Set<string>();
  const radii = new Set<string>();
  const shadows = new Set<string>();
  for (const el of elements) {
    if (el.styles.color) colors.add(el.styles.color);
    if (el.styles.backgroundColor) colors.add(el.styles.backgroundColor);
    if (el.styles.borderRadius) radii.add(el.styles.borderRadius);
    if (el.styles.boxShadow) shadows.add(el.styles.boxShadow);
  }
  return {
    colors: [...colors].slice(0, 16),
    borderRadii: [...radii].slice(0, 10),
    shadows: [...shadows].slice(0, 8),
  };
}

export function detectClutter(elements: ScannedElement[]): { selector: string; reason: string }[] {
  const out: { selector: string; reason: string }[] = [];
  try {
    // Duplicate CTA text.
    const ctaCounts = new Map<string, number>();
    for (const el of elements) {
      if ((el.tag === 'button' || (el.tag === 'a' && el.isInteractive)) && el.text) {
        const key = el.text.toLowerCase().slice(0, 40);
        if (key.length >= 3) ctaCounts.set(key, (ctaCounts.get(key) ?? 0) + 1);
      }
    }
    for (const [text, count] of ctaCounts) {
      if (count >= 3) {
        out.push({ selector: `cta:"${text}"`, reason: `Identical call-to-action “${text}” appears ${count}× — verify whether all instances are needed.` });
      }
    }
    // Excessive decorative icons (aria-hidden svg/i).
    const icons = document.querySelectorAll('svg[aria-hidden="true"], i[class*="icon"]');
    if (icons.length > 25) {
      out.push({ selector: 'icons', reason: `${icons.length} decorative icons detected — page may be visually noisy.` });
    }
  } catch {
    /* ignore */
  }
  return out.slice(0, 10);
}
