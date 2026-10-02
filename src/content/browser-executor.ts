// Browser Executor: executes validated browser actions safely inside the live DOM.
// Never directly accessible by AI provider code (Section 23).
// Handles target resolution, element interaction, scrolling, and compact state observation.

import { checkSafetyPolicy, validateActionSchema, validateElementInteractability } from './action-validator';
import { buildSelector, isInteractive, safeText, semanticRole } from './element-scanner';
import { analyzeLayout } from './layout-scanner';
import { analyzeResponsive } from './responsive-scanner';
import { collectElements } from './dom-scanner';
import type {
  ActionResult,
  ActionTarget,
  BrowserAction,
  CompactElement,
  CompactPageState,
} from '../shared/types';

/**
 * Resolves a semantic ActionTarget to a live DOM element (Section 9).
 * Preference order:
 * 1. unique ID
 * 2. stable data attribute (data-testid, etc.)
 * 3. accessible role + name
 * 4. stable CSS selector
 * 5. visible text + element type
 * 6. DOM path
 */
export function resolveTarget(target: ActionTarget): Element | null {
  if (!target) return null;

  // 1. Unique ID
  if (target.id) {
    const cleanId = target.id.replace(/^#/, '');
    const el = document.getElementById(cleanId);
    if (el) return el;
  }

  // 2. Stable data attribute
  if (target.dataTestId) {
    const byTestId = document.querySelector(
      `[data-testid="${CSS.escape(target.dataTestId)}"], [data-test="${CSS.escape(target.dataTestId)}"], [data-cy="${CSS.escape(target.dataTestId)}"]`,
    );
    if (byTestId) return byTestId;
  }

  // 3. Accessible role + name
  if (target.role || target.name) {
    const candidates = Array.from(
      document.querySelectorAll(
        'button, a, input, select, textarea, [role], summary, [tabindex], nav, dialog, h1, h2, h3',
      ),
    );
    const targetName = (target.name ?? target.text ?? '').toLowerCase().trim();
    const targetRole = (target.role ?? '').toLowerCase().trim();

    for (const cand of candidates) {
      if (!isElementVisible(cand)) continue;
      const candRole = (semanticRole(cand) ?? cand.getAttribute('role') ?? cand.tagName.toLowerCase()).toLowerCase();
      const candName = (
        cand.getAttribute('aria-label') ||
        cand.getAttribute('title') ||
        cand.textContent ||
        ''
      )
        .toLowerCase()
        .trim();

      const roleMatches = !targetRole || candRole === targetRole || (targetRole === 'button' && cand.tagName.toLowerCase() === 'button');
      const nameMatches = !targetName || candName === targetName || candName.includes(targetName);

      if (roleMatches && nameMatches) {
        return cand;
      }
    }
  }

  // 4. Stable CSS selector
  if (target.selector) {
    try {
      const match = document.querySelector(target.selector);
      if (match) return match;
    } catch {
      /* ignore invalid selector */
    }
  }

  // 5. Visible text + element type
  if (target.text) {
    const tag = target.tag?.toLowerCase() ?? '';
    const selector = tag ? tag : 'button, a, span, p, h1, h2, h3, h4, label, li';
    const elements = Array.from(document.querySelectorAll(selector));
    const needle = target.text.toLowerCase().trim();

    for (const el of elements) {
      if (!isElementVisible(el)) continue;
      const text = (el.textContent ?? '').toLowerCase().trim();
      if (text === needle || (text.includes(needle) && text.length < needle.length + 40)) {
        return el;
      }
    }
  }

  return null;
}

function isElementVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  const html = el as HTMLElement;
  const style = window.getComputedStyle(html);
  if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') <= 0.05) {
    return false;
  }
  const rect = html.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Waits for DOM mutations and paint to settle (Section 6 & 10).
 */
export function waitForUiStability(settleMs = 400, maxTimeoutMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    let timer: number | null = null;
    let observer: MutationObserver | null = null;
    const start = Date.now();

    const finish = () => {
      if (timer !== null) window.clearTimeout(timer);
      observer?.disconnect();
      // Wait for next RAF frame
      requestAnimationFrame(() => resolve());
    };

    observer = new MutationObserver(() => {
      if (timer !== null) window.clearTimeout(timer);
      if (Date.now() - start > maxTimeoutMs) {
        finish();
      } else {
        timer = window.setTimeout(finish, settleMs);
      }
    });

    try {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-expanded', 'aria-hidden'],
      });
    } catch {
      finish();
      return;
    }

    timer = window.setTimeout(finish, settleMs);
  });
}

/**
 * Categorizes an interactive element by exploration priority (Section 15).
 */
function prioritizeElement(el: Element, text: string, role: string): CompactElement['priorityCategory'] {
  const t = text.toLowerCase();
  const tag = el.tagName.toLowerCase();
  const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase();
  const ariaExpanded = el.getAttribute('aria-expanded');
  const ariaHaspopup = el.getAttribute('aria-haspopup');

  if (el.closest('nav') || role === 'navigation' || cls.includes('nav') || t.includes('menu')) {
    return 'navigation';
  }
  if (ariaHaspopup === 'menu' || ariaHaspopup === 'true' || ariaExpanded !== null || cls.includes('dropdown')) {
    return 'dropdown';
  }
  if (role === 'tab' || cls.includes('tab') || el.closest('[role="tablist"]')) {
    return 'tab';
  }
  if (cls.includes('accordion') || tag === 'summary' || el.closest('details')) {
    return 'accordion';
  }
  if (tag === 'dialog' || el.getAttribute('data-bs-toggle') === 'modal' || t.includes('modal') || t.includes('dialog')) {
    return 'modal';
  }
  if (cls.includes('filter') || t.includes('filter')) {
    return 'filter';
  }
  if (tag === 'input' && (el.getAttribute('type') === 'search' || t.includes('search') || el.getAttribute('placeholder')?.toLowerCase().includes('search'))) {
    return 'search';
  }
  if (cls.includes('cta') || cls.includes('btn-primary') || cls.includes('primary') || t.includes('get started') || t.includes('sign up')) {
    return 'cta';
  }
  if (tag === 'button' || role === 'button') {
    return 'menu';
  }
  if (tag === 'form' || el.closest('form')) {
    return 'form';
  }
  return 'other';
}

/**
 * Computes a fast deterministic state fingerprint (Section 17).
 */
export function computeStateFingerprint(): string {
  const url = location.href.split('#')[0];
  const scrollY = Math.round(window.scrollY / 200) * 200;
  const openModals = Array.from(document.querySelectorAll('dialog[open], [role="dialog"]:not([hidden]), [aria-modal="true"]'))
    .map((m) => m.id || m.tagName)
    .sort()
    .join(',');
  const openMenus = Array.from(document.querySelectorAll('[aria-expanded="true"], .dropdown.show, .menu.open, .is-active'))
    .map((m) => m.id || m.className)
    .sort()
    .join(',');
  const activeTabs = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"], .tab.active'))
    .map((t) => t.textContent?.trim().slice(0, 20) || '')
    .sort()
    .join(',');

  return `${url}::s${scrollY}::m[${openModals}]::menu[${openMenus}]::tabs[${activeTabs}]`;
}

/**
 * Collects a structured, compact page representation (Section 11 & 13).
 */
export function getCompactPageObservation(): CompactPageState {
  const elements = collectElements();
  const layoutSignals = analyzeLayout(elements);
  const responsive = analyzeResponsive(elements);

  // Identify open modals / menus
  const activeModals = Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]'))
    .filter((m) => isElementVisible(m))
    .map((m) => buildSelector(m));

  const openMenus = Array.from(document.querySelectorAll('[aria-expanded="true"]'))
    .filter((m) => isElementVisible(m))
    .map((m) => buildSelector(m));

  // Extract interactive candidates and prioritize them
  const interactableCandidates: CompactElement[] = [];
  const seenSelectors = new Set<string>();

  for (const el of elements) {
    if (!el.isInteractive || !el.visible) continue;
    if (seenSelectors.has(el.selector)) continue;
    seenSelectors.add(el.selector);

    const role = el.role ?? 'generic';
    const text = el.text ?? '';
    const rawEl = document.querySelector(el.selector);
    const category = rawEl ? prioritizeElement(rawEl, text, role) : 'other';

    interactableCandidates.push({
      tag: el.tag,
      role: el.role,
      selector: el.selector,
      name: text.slice(0, 60),
      text: text.slice(0, 80),
      rect: el.rect,
      isInteractive: true,
      priorityCategory: category,
      disabled: false,
    });
  }

  // Sort by priority order (Section 15)
  const priorityRank: Record<string, number> = {
    navigation: 1,
    cta: 2,
    menu: 3,
    dropdown: 4,
    tab: 5,
    accordion: 6,
    filter: 7,
    search: 8,
    modal: 9,
    form: 10,
    other: 11,
  };

  interactableCandidates.sort((a, b) => {
    const rankA = priorityRank[a.priorityCategory ?? 'other'] ?? 99;
    const rankB = priorityRank[b.priorityCategory ?? 'other'] ?? 99;
    return rankA - rankB;
  });

  return {
    url: location.href.split('#')[0],
    title: document.title.slice(0, 150),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scrollPosition: {
      x: window.scrollX,
      y: window.scrollY,
      maxScrollY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    },
    activeModalsOrDialogs: activeModals,
    openMenus,
    interactableCandidates: interactableCandidates.slice(0, 25),
    layoutIssuesSummary: layoutSignals.map((s) => `[${s.kind}] ${s.selector}: ${s.detail}`).slice(0, 15),
    responsiveSignals: {
      hasHorizontalOverflow: responsive.hasHorizontalOverflow,
      overflowPx: responsive.overflowPx,
      fixedWidthElementsCount: responsive.fixedWidthElements.length,
    },
    stateFingerprint: computeStateFingerprint(),
  };
}

/**
 * Main execution dispatch function for all supported browser actions.
 */
export async function executeBrowserAction(action: BrowserAction): Promise<ActionResult> {
  // Step 1: Validate Schema
  const schemaCheck = validateActionSchema(action);
  if (!schemaCheck.valid) {
    return {
      success: false,
      action: action?.action ?? 'OBSERVE',
      reason: schemaCheck.reason ?? 'INVALID_SCHEMA',
    };
  }

  switch (action.action) {
    case 'OBSERVE': {
      const state = getCompactPageObservation();
      return {
        success: true,
        action: 'OBSERVE',
        viewport: state.viewport,
        newScrollPosition: state.scrollPosition.y,
        newVisibleElements: state.interactableCandidates,
        data: { stateFingerprint: state.stateFingerprint },
      };
    }

    case 'SCREENSHOT': {
      // Screenshot is captured from extension side via chrome.tabs.captureVisibleTab
      return {
        success: true,
        action: 'SCREENSHOT',
        viewport: { width: window.innerWidth, height: window.innerHeight },
        newScrollPosition: window.scrollY,
      };
    }

    case 'SCROLL': {
      const dir = action.direction || 'down';
      const amount = action.amount ?? 650;
      let targetScrollY = window.scrollY;

      if (action.target) {
        const targetEl = resolveTarget(action.target);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await waitForUiStability(350);
          const state = getCompactPageObservation();
          return {
            success: true,
            action: 'SCROLL',
            newScrollPosition: window.scrollY,
            viewport: state.viewport,
            newVisibleElements: state.interactableCandidates,
          };
        }
      }

      if (dir === 'down') targetScrollY += amount;
      else if (dir === 'up') targetScrollY = Math.max(0, targetScrollY - amount);
      else if (dir === 'top') targetScrollY = 0;
      else if (dir === 'bottom') targetScrollY = document.documentElement.scrollHeight;

      window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
      await waitForUiStability(400);

      const state = getCompactPageObservation();
      return {
        success: true,
        action: 'SCROLL',
        newScrollPosition: window.scrollY,
        viewport: state.viewport,
        newVisibleElements: state.interactableCandidates,
      };
    }

    case 'CLICK': {
      const targetEl = resolveTarget(action.target);
      const safety = checkSafetyPolicy(action.target, targetEl);
      if (!safety.safe) {
        return {
          success: false,
          action: 'CLICK',
          reason: safety.reason ?? 'MANUAL_REVIEW_REQUIRED',
        };
      }

      const interactCheck = validateElementInteractability(targetEl);
      if (!interactCheck.interactable) {
        return {
          success: false,
          action: 'CLICK',
          reason: interactCheck.reason ?? 'TARGET_NOT_INTERACTABLE',
        };
      }

      const element = targetEl as HTMLElement;

      // Scroll element into view if not in viewport
      const rect = element.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 200));
      }

      // Safe dispatch of user events
      const opts: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
      };

      element.dispatchEvent(new PointerEvent('pointerdown', opts));
      element.dispatchEvent(new MouseEvent('mousedown', opts));
      element.dispatchEvent(new PointerEvent('pointerup', opts));
      element.dispatchEvent(new MouseEvent('mouseup', opts));
      element.click();

      // Wait for DOM stability (e.g. menu opens, modal appears, accordion expands)
      await waitForUiStability(500);

      const state = getCompactPageObservation();
      return {
        success: true,
        action: 'CLICK',
        newScrollPosition: window.scrollY,
        viewport: state.viewport,
        newVisibleElements: state.interactableCandidates,
        stateDescription: `Clicked ${action.target.name || action.target.selector || element.tagName}. Current fingerprint: ${state.stateFingerprint}`,
      };
    }

    case 'HOVER': {
      const targetEl = resolveTarget(action.target);
      const interactCheck = validateElementInteractability(targetEl);
      if (!interactCheck.interactable) {
        return {
          success: false,
          action: 'HOVER',
          reason: interactCheck.reason ?? 'TARGET_NOT_INTERACTABLE',
        };
      }

      const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window };
      targetEl!.dispatchEvent(new PointerEvent('pointerover', opts));
      targetEl!.dispatchEvent(new MouseEvent('mouseover', opts));
      targetEl!.dispatchEvent(new PointerEvent('pointerenter', opts));
      targetEl!.dispatchEvent(new MouseEvent('mouseenter', opts));

      await waitForUiStability(350);
      const state = getCompactPageObservation();
      return {
        success: true,
        action: 'HOVER',
        viewport: state.viewport,
        newVisibleElements: state.interactableCandidates,
      };
    }

    case 'FOCUS': {
      const targetEl = resolveTarget(action.target);
      if (!targetEl) {
        return { success: false, action: 'FOCUS', reason: 'TARGET_NOT_FOUND' };
      }
      (targetEl as HTMLElement).focus?.();
      await waitForUiStability(250);
      return { success: true, action: 'FOCUS' };
    }

    case 'WAIT': {
      const duration = Math.min(3000, Math.max(200, action.duration ?? 800));
      await new Promise((r) => setTimeout(r, duration));
      await waitForUiStability(200);
      const state = getCompactPageObservation();
      return {
        success: true,
        action: 'WAIT',
        newScrollPosition: window.scrollY,
        viewport: state.viewport,
        newVisibleElements: state.interactableCandidates,
      };
    }

    case 'GET_ELEMENT_INFO': {
      const targetEl = resolveTarget(action.target);
      if (!targetEl) {
        return { success: false, action: 'GET_ELEMENT_INFO', reason: 'TARGET_NOT_FOUND' };
      }
      const htmlEl = targetEl as HTMLElement;
      const rect = htmlEl.getBoundingClientRect();
      const style = window.getComputedStyle(htmlEl);

      const info = {
        tag: htmlEl.tagName.toLowerCase(),
        role: semanticRole(htmlEl) ?? htmlEl.getAttribute('role'),
        id: htmlEl.id,
        className: htmlEl.className,
        text: safeText(htmlEl, 150),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        styles: {
          display: style.display,
          position: style.position,
          color: style.color,
          backgroundColor: style.backgroundColor,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          overflow: `${style.overflowX}/${style.overflowY}`,
          zIndex: style.zIndex,
        },
        selector: buildSelector(htmlEl),
        visible: isElementVisible(htmlEl),
      };

      return {
        success: true,
        action: 'GET_ELEMENT_INFO',
        elementInfo: info,
      };
    }

    case 'INSPECT_STATE': {
      const state = getCompactPageObservation();
      return {
        success: true,
        action: 'INSPECT_STATE',
        viewport: state.viewport,
        newScrollPosition: state.scrollPosition.y,
        newVisibleElements: state.interactableCandidates,
        data: {
          fingerprint: state.stateFingerprint,
          activeModals: state.activeModalsOrDialogs,
          openMenus: state.openMenus,
        },
      };
    }

    case 'MARK_ISSUE': {
      // Mark issue is recorded by AgentCore and forwarded to marker layer
      return {
        success: true,
        action: 'MARK_ISSUE',
        data: { marked: true },
      };
    }

    case 'FINISH_AUDIT': {
      return {
        success: true,
        action: 'FINISH_AUDIT',
        data: { finished: true },
      };
    }

    default:
      return {
        success: false,
        action: (action as BrowserAction).action,
        reason: 'UNSUPPORTED_ACTION',
      };
  }
}
