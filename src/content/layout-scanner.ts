// Geometric layout checks over the collected elements:
// overlaps, clipping, horizontal overflow, misalignment, gap inconsistency.

import type { LayoutSignal, ScannedElement } from '../shared/types';

function rectsOverlap(a: ScannedElement['rect'], b: ScannedElement['rect']): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function overlapArea(a: ScannedElement['rect'], b: ScannedElement['rect']): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function analyzeLayout(elements: ScannedElement[]): LayoutSignal[] {
  const signals: LayoutSignal[] = [];

  // 1. Page-level horizontal overflow.
  try {
    const doc = document.documentElement;
    const overflowPx = Math.max(0, doc.scrollWidth - window.innerWidth);
    if (overflowPx > 2) {
      signals.push({
        kind: 'overflow-x',
        selector: 'document',
        detail: `Page scrolls horizontally by ~${overflowPx}px at ${window.innerWidth}px viewport.`,
        metric: `${overflowPx}px`,
      });
    }
  } catch {
    /* ignore */
  }

  // 2. Clipped / overflowing elements.
  for (const el of elements) {
    if (el.overflow.clipped && el.rect.width > 40) {
      signals.push({
        kind: 'clipped',
        selector: el.selector,
        detail: `Content inside <${el.tag}> is clipped (scroll size exceeds visible box, overflow ${el.overflow.x}/${el.overflow.y}).`,
      });
    }
    // Element sticking out past the viewport horizontally.
    if (el.rect.x + el.rect.width > window.innerWidth + 4 && el.rect.width > 20) {
      signals.push({
        kind: 'overflow-x',
        selector: el.selector,
        detail: `<${el.tag}> extends ~${Math.round(el.rect.x + el.rect.width - window.innerWidth)}px past the right viewport edge.`,
      });
    }
  }

  // 3. Overlaps between meaningful boxes (ignore tiny slivers & containment).
  const boxes = elements.filter((e) => e.rect.width > 30 && e.rect.height > 16);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      // Skip parent/child pairs — nesting is not overlap.
      if (a.selector === b.parentSelector || b.selector === a.parentSelector) continue;
      if (!rectsOverlap(a.rect, b.rect)) continue;
      const area = overlapArea(a.rect, b.rect);
      const smaller = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
      if (smaller <= 0) continue;
      // Only flag substantial overlaps (>25% of the smaller box).
      if (area / smaller > 0.25) {
        signals.push({
          kind: 'overlap',
          selector: `${a.selector} ↔ ${b.selector}`,
          detail: `Two visible blocks overlap substantially (~${Math.round((area / smaller) * 100)}% of the smaller element).`,
        });
        if (signals.length > 60) break;
      }
    }
    if (signals.length > 60) break;
  }

  // 4. Misaligned left edges among siblings (cards, list items).
  try {
    const groups = new Map<string, ScannedElement[]>();
    for (const el of elements) {
      const key = `${el.parentSelector ?? 'root'}::${el.tag}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(el);
    }
    for (const [, group] of groups) {
      if (group.length < 3) continue;
      const xs = group.map((g) => g.rect.x).sort((x, y) => x - y);
      const spread = xs[xs.length - 1] - xs[0];
      // Siblings of the same kind whose left edges scatter >12px.
      const rounded = new Set(xs.map((x) => Math.round(x / 4) * 4));
      if (spread > 12 && rounded.size >= 3) {
        signals.push({
          kind: 'misaligned',
          selector: group[0].parentSelector ?? group[0].selector,
          detail: `${group.length} <${group[0].tag}> siblings have scattered left edges (spread ~${Math.round(spread)}px) — possible broken alignment.`,
          metric: `${Math.round(spread)}px`,
        });
      }
    }
  } catch {
    /* ignore */
  }

  return signals.slice(0, 80);
}
