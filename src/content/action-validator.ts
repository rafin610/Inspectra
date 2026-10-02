// Action validator & Safety Policy enforcement.
// Runs inside the content script context before any browser action is executed.
// Strictly prevents destructive or sensitive automated actions (Section 21 & 22).

import type { ActionTarget, BrowserAction } from '../shared/types';

export interface ValidationCheckResult {
  allowed: boolean;
  reason?: string;
  element?: Element;
}

const SUPPORTED_ACTIONS = new Set<string>([
  'OBSERVE',
  'SCREENSHOT',
  'SCROLL',
  'CLICK',
  'HOVER',
  'FOCUS',
  'WAIT',
  'GET_ELEMENT_INFO',
  'INSPECT_STATE',
  'MARK_ISSUE',
  'FINISH_AUDIT',
]);

const SENSITIVE_PATTERNS = [
  // Payments / checkout
  /\b(buy|purchase|checkout|pay|payment|credit\s*card|debit\s*card|cvv|billing|stripe|paypal|order\s*now|place\s*order)\b/i,
  // Account / deletion
  /\b(delete\s*account|delete\s*all|remove\s*account|destroy|erase|drop\s*table|terminate)\b/i,
  // Passwords / auth modification
  /\b(change\s*password|reset\s*password|update\s*password|new\s*password)\b/i,
  // Irreversible communications
  /\b(send\s*email|send\s*message|transfer\s*funds|wire\s*money|submit\s*application)\b/i,
];

/**
 * Validates that an action conforms to the strict action schema (Section 7)
 * and doesn't violate the safety policy (Section 21).
 */
export function validateActionSchema(action: BrowserAction): { valid: boolean; reason?: string } {
  if (!action || typeof action !== 'object') {
    return { valid: false, reason: 'Action payload must be a non-null object.' };
  }
  if (!SUPPORTED_ACTIONS.has(action.action)) {
    return { valid: false, reason: `UNKNOWN_ACTION: "${action.action}" is not a supported browser action.` };
  }
  if (['CLICK', 'HOVER', 'FOCUS', 'GET_ELEMENT_INFO'].includes(action.action)) {
    const act = action as { target?: ActionTarget };
    if (!act.target || typeof act.target !== 'object') {
      return { valid: false, reason: `TARGET_MISSING: Action "${action.action}" requires a target object.` };
    }
  }
  if (action.action === 'SCROLL') {
    const validDirs = ['down', 'up', 'top', 'bottom'];
    if (action.direction && !validDirs.includes(action.direction)) {
      return { valid: false, reason: `INVALID_SCROLL_DIRECTION: Must be one of ${validDirs.join(', ')}.` };
    }
  }
  return { valid: true };
}

/**
 * Inspects element text and attributes for sensitive or destructive intent.
 */
export function checkSafetyPolicy(target: ActionTarget, element?: Element | null): { safe: boolean; reason?: string } {
  // Check target metadata
  const textToCheck: string[] = [
    target.name ?? '',
    target.text ?? '',
    target.selector ?? '',
    target.id ?? '',
    target.role ?? '',
  ];

  if (element) {
    const tag = element.tagName.toLowerCase();
    const type = element.getAttribute('type')?.toLowerCase();

    // Section 22: Form submissions must NOT be performed automatically
    if (tag === 'form' || type === 'submit') {
      return {
        safe: false,
        reason: 'MANUAL_REVIEW_REQUIRED: Form submissions are restricted by safety policy.',
      };
    }

    if (tag === 'input' && ['password', 'credit-card'].includes(type ?? '')) {
      return {
        safe: false,
        reason: 'MANUAL_REVIEW_REQUIRED: Sensitive input fields are restricted by safety policy.',
      };
    }

    const ariaLabel = element.getAttribute('aria-label') ?? '';
    const title = element.getAttribute('title') ?? '';
    const elText = element.textContent ?? '';
    textToCheck.push(ariaLabel, title, elText.slice(0, 100));
  }

  const combined = textToCheck.join(' ').toLowerCase();

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        safe: false,
        reason: `MANUAL_REVIEW_REQUIRED: Action matches sensitive pattern (${pattern.source}). Automatic execution blocked.`,
      };
    }
  }

  return { safe: true };
}

/**
 * Verifies element interactability and visibility (Section 10).
 */
export function validateElementInteractability(element: Element | null): { interactable: boolean; reason?: string } {
  if (!element) {
    return { interactable: false, reason: 'TARGET_NOT_FOUND: Element does not exist in DOM.' };
  }
  if (!element.isConnected) {
    return { interactable: false, reason: 'ELEMENT_DISCONNECTED: Element is no longer attached to document.' };
  }

  const htmlEl = element as HTMLElement;
  const style = window.getComputedStyle(htmlEl);

  if (style.display === 'none') {
    return { interactable: false, reason: 'ELEMENT_NOT_VISIBLE: Element has display: none.' };
  }
  if (style.visibility === 'hidden') {
    return { interactable: false, reason: 'ELEMENT_NOT_VISIBLE: Element has visibility: hidden.' };
  }
  if (parseFloat(style.opacity || '1') <= 0.05) {
    return { interactable: false, reason: 'ELEMENT_NOT_VISIBLE: Element is transparent (opacity ~ 0).' };
  }

  const rect = htmlEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { interactable: false, reason: 'ELEMENT_ZERO_SIZE: Element dimensions are 0x0.' };
  }

  // Check disabled attributes
  if (htmlEl.hasAttribute('disabled') || htmlEl.getAttribute('aria-disabled') === 'true') {
    return { interactable: false, reason: 'ELEMENT_DISABLED: Element is disabled.' };
  }

  // Check obstruction by overlay (excluding Inspectra's own host)
  const centerX = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
  const centerY = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));

  // If in current viewport, check topmost element
  if (centerY >= 0 && centerY < window.innerHeight && centerX >= 0 && centerX < window.innerWidth) {
    try {
      const topEl = document.elementFromPoint(centerX, centerY);
      if (topEl && topEl !== element && !element.contains(topEl) && !topEl.contains(element)) {
        // Check if topEl is part of inspectra overlay
        if (!topEl.closest('#inspectra-floating-overlay-host') && !topEl.closest('#inspectra-issue-marker-layer')) {
          // May be obstructed by a backdrop or modal
          const topStyle = window.getComputedStyle(topEl);
          if (topStyle.pointerEvents !== 'none' && topStyle.zIndex !== 'auto') {
            return {
              interactable: false,
              reason: `ELEMENT_OBSTRUCTED: Element may be blocked by <${topEl.tagName.toLowerCase()}> at point (${Math.round(centerX)}, ${Math.round(centerY)}).`,
            };
          }
        }
      }
    } catch {
      /* continue */
    }
  }

  return { interactable: true };
}
