// Collects relevant visible elements only — never the whole DOM,
// never input values, tokens, or hidden subtrees.

// NOTE: keep runtime constants local (see scanner.ts) so the built
// content script stays a single self-contained classic script.
const MAX_ELEMENTS = 220;
const MAX_TEXT_LEN = 160;
import { buildSelector, isInteractive, isProbablyVisible, safeText, semanticRole } from './element-scanner';
import { readOverflow, readStyles } from './style-scanner';
import type { ScannedElement } from '../shared/types';

const RELEVANT_SELECTOR = [
  'h1', 'h2', 'h3', 'h4',
  'p', 'button', 'a', 'img',
  'input', 'select', 'textarea', 'form', 'label',
  'nav', 'header', 'footer', 'main', 'section', 'article', 'aside',
  'ul', 'ol', 'table',
  '[role="button"]', '[role="navigation"]', '[role="dialog"]', '[role="alert"]',
  'dialog',
  '.card', '.btn', '.button', '.cta', '.hero', '.navbar', '.menu',
].join(',');

export function collectElements(): ScannedElement[] {
  const out: ScannedElement[] = [];
  let nodes: NodeListOf<Element>;
  try {
    nodes = document.querySelectorAll(RELEVANT_SELECTOR);
  } catch {
    return out;
  }

  for (const el of Array.from(nodes)) {
    if (out.length >= MAX_ELEMENTS) break;
    try {
      if (!isProbablyVisible(el)) continue;
      const htmlEl = el as HTMLElement;
      const rect = htmlEl.getBoundingClientRect();
      const selector = buildSelector(el);
      const parent = el.parentElement ? buildSelector(el.parentElement) : undefined;
      out.push({
        tag: el.tagName.toLowerCase(),
        role: semanticRole(el),
        selector,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        visible: true,
        text: safeText(el, MAX_TEXT_LEN),
        styles: readStyles(el),
        overflow: readOverflow(el),
        parentSelector: parent,
        isInteractive: isInteractive(el),
      });
    } catch {
      continue;
    }
  }
  return out;
}

export function detectFramework(): { name?: string; confidence?: 'high' | 'medium' | 'low' } {
  try {
    const html = document.documentElement.innerHTML.slice(0, 20000);
    // High-confidence markers
    if ((window as unknown as { __NEXT_DATA__?: unknown }).__NEXT_DATA__) {
      return { name: 'Next.js (React)', confidence: 'high' };
    }
    if (document.querySelector('[data-reactroot], [data-reactid]')) {
      return { name: 'React', confidence: 'high' };
    }
    if ((window as unknown as { __VUE__?: unknown; Vue?: unknown }).__VUE__ || (window as unknown as { Vue?: unknown }).Vue) {
      return { name: 'Vue', confidence: 'medium' };
    }
    if (document.querySelector('[ng-app], [ng-version], app-root')) {
      return { name: 'Angular', confidence: 'medium' };
    }
    if (document.querySelector('[data-nuxt], #__nuxt')) {
      return { name: 'Nuxt (Vue)', confidence: 'medium' };
    }
    // CSS frameworks (low-stakes context only)
    const links = Array.from(document.querySelectorAll('link[href]'))
      .map((l) => l.getAttribute('href') ?? '')
      .join(' ');
    if (/tailwind/i.test(links) || /tailwind/i.test(html)) return { name: 'Tailwind CSS (styling)', confidence: 'low' };
    if (/bootstrap/i.test(links)) return { name: 'Bootstrap (styling)', confidence: 'low' };
    // React heuristics via bundle hints
    if (/react/i.test(html) && /__react/i.test(html)) return { name: 'React (likely)', confidence: 'low' };
    return {};
  } catch {
    return {};
  }
}
