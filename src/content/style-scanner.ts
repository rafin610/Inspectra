// Reads a narrow, meaningful subset of computed styles.
// Patterns (not every diff) are what the AI reasons about downstream.

const STYLE_PROPS = [
  'fontSize',
  'fontWeight',
  'lineHeight',
  'color',
  'backgroundColor',
  'borderTopWidth',
  'borderTopStyle',
  'borderTopColor',
  'borderRadius',
  'boxShadow',
  'paddingTop',
  'paddingRight',
  'marginTop',
  'width',
  'height',
  'display',
  'position',
  'overflowX',
  'overflowY',
] as const;

const DEFAULTY: Record<string, string> = {
  boxShadow: 'none',
  borderTopStyle: 'none',
};

export function readStyles(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const cs = window.getComputedStyle(el as HTMLElement);
    for (const prop of STYLE_PROPS) {
      const v = cs[prop as keyof CSSStyleDeclaration] as unknown as string;
      if (typeof v !== 'string' || v === '') continue;
      if (DEFAULTY[prop] === v) continue;
      // Skip default transparent backgrounds to keep payload compact.
      if (prop === 'backgroundColor' && (v === 'rgba(0, 0, 0, 0)' || v === 'transparent')) continue;
      out[prop] = v;
    }
  } catch {
    /* ignore — element may be detached */
  }
  return out;
}

export function readOverflow(el: Element): {
  x: string;
  y: string;
  clipped: boolean;
} {
  try {
    const htmlEl = el as HTMLElement;
    const cs = window.getComputedStyle(htmlEl);
    const x = cs.overflowX || 'visible';
    const y = cs.overflowY || 'visible';
    let clipped = false;
    try {
      clipped =
        htmlEl.scrollWidth > htmlEl.clientWidth + 2 ||
        htmlEl.scrollHeight > htmlEl.clientHeight + 2;
      // Only flag clipping when overflow is actually hidden-ish; plain
      // scrollable regions are intentional.
      if (x === 'auto' || x === 'scroll' || y === 'auto' || y === 'scroll') {
        clipped = false;
      }
    } catch {
      clipped = false;
    }
    return { x, y, clipped };
  } catch {
    return { x: 'visible', y: 'visible', clipped: false };
  }
}
