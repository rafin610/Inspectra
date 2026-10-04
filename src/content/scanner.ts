// Orchestrates the full non-destructive scan. Runs inside the page as a
// content script. Listens for INSPECTRA_SCAN_FRONTEND / INSPECTRA_PING.

// NOTE: this file must stay free of runtime imports from src/shared —
// the built content script runs as a classic (non-module) script, so the
// bundler must inline everything. Message names are duplicated here and
// must match src/shared/messages.ts.
const MSG_SCAN_FRONTEND = 'INSPECTRA_SCAN_FRONTEND';
const MSG_PING = 'INSPECTRA_PING';
const MSG_SET_ISSUE_MARKERS = 'INSPECTRA_SET_ISSUE_MARKERS';
const MSG_CLEAR_ISSUE_MARKERS = 'INSPECTRA_CLEAR_ISSUE_MARKERS';
const MSG_FOCUS_ISSUE = 'INSPECTRA_FOCUS_ISSUE';
const MSG_ISSUE_MARKER_CLICK = 'INSPECTRA_ISSUE_MARKER_CLICK';
const MSG_EXECUTE_BROWSER_ACTION = 'INSPECTRA_EXECUTE_BROWSER_ACTION';
const MSG_GET_PAGE_OBSERVATION = 'INSPECTRA_GET_PAGE_OBSERVATION';
const MSG_RESOLVE_TARGET = 'INSPECTRA_RESOLVE_TARGET';
import type { ActionTarget, BrowserAction, PageInfo, ScanResponse, WebsiteAnalysis } from '../shared/types';
import { executeBrowserAction, getCompactPageObservation, resolveTarget } from './browser-executor';
import { collectElements, detectFramework } from './dom-scanner';
import { analyzeLayout } from './layout-scanner';
import { analyzeResponsive } from './responsive-scanner';
import {
  analyzeVisibilitySignals,
  detectClutter,
  summarizeTypography,
  summarizeVisuals,
} from './visibility-scanner';

const winScanner = window as unknown as { __INSPECTRA_SCANNER_LOADED?: boolean };
if (!winScanner.__INSPECTRA_SCANNER_LOADED) {
  winScanner.__INSPECTRA_SCANNER_LOADED = true;

function waitForStable(timeoutMs = 2500): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    if (document.readyState === 'complete') {
      // SPAs keep mutating after load — observe briefly for stability.
      let mutations = 0;
      const observer = new MutationObserver(() => {
        mutations += 1;
      });
      try {
        observer.observe(document.body, { childList: true, subtree: true });
      } catch {
        done();
        return;
      }
      const start = Date.now();
      const quiet: number[] = [];
      const timer = window.setInterval(() => {
        quiet.push(mutations);
        mutations = 0;
        if (quiet.length >= 3) {
          const recent = quiet.slice(-3).reduce((a, b) => a + b, 0);
          if (recent === 0 || Date.now() - start > timeoutMs) {
            window.clearInterval(timer);
            observer.disconnect();
            done();
          }
        }
      }, 350);
      window.setTimeout(() => {
        window.clearInterval(timer);
        observer.disconnect();
        done();
      }, timeoutMs + 500);
    } else {
      window.addEventListener('load', () => done(), { once: true });
      window.setTimeout(done, timeoutMs + 1500);
    }
  });
}

function collectPageInfo(): PageInfo {
  const fw = detectFramework();
  let scrollWidth = 0;
  let scrollHeight = 0;
  let bodyScrollWidth = 0;
  try {
    scrollWidth = document.documentElement.scrollWidth;
    scrollHeight = document.documentElement.scrollHeight;
    bodyScrollWidth = document.body?.scrollWidth ?? 0;
  } catch {
    /* ignore */
  }
  const overflowPx = Math.max(0, scrollWidth - window.innerWidth);
  return {
    url: location.href.split('#')[0].slice(0, 300),
    title: document.title.slice(0, 200),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    scrollWidth,
    scrollHeight,
    bodyScrollWidth,
    hasHorizontalOverflow: overflowPx > 2,
    framework: fw.name,
    frameworkConfidence: fw.confidence,
  };
}

async function runScan(): Promise<WebsiteAnalysis> {
  await waitForStable();
  const elements = collectElements();
  const layoutA = analyzeLayout(elements);
  const responsive = analyzeResponsive(elements);
  const visibility = analyzeVisibilitySignals(elements);
  return {
    page: collectPageInfo(),
    elementCount: elements.length,
    elements,
    layoutSignals: [...layoutA, ...visibility].slice(0, 120),
    responsive,
    typography: summarizeTypography(elements),
    visual: summarizeVisuals(elements),
    clutter: detectClutter(elements),
    collectedAt: new Date().toISOString(),
  };
}

interface MarkerIssue {
  id: string;
  selector: string;
  severity: string;
  title: string;
}

interface MarkerEntry {
  issue: MarkerIssue;
  target: Element;
  frame: HTMLDivElement;
  badge: HTMLButtonElement;
  outline: HTMLDivElement;
}

const MARKER_HOST_ID = 'inspectra-issue-marker-layer';
let markerHost: HTMLElement | null = null;
let markerEntries: MarkerEntry[] = [];
let markerResizeObserver: ResizeObserver | null = null;
let markerMutationObserver: MutationObserver | null = null;
let markerFrame = 0;

function clearMarkers(): void {
  if (markerFrame) cancelAnimationFrame(markerFrame);
  markerFrame = 0;
  markerResizeObserver?.disconnect();
  markerMutationObserver?.disconnect();
  markerResizeObserver = null;
  markerMutationObserver = null;
  window.removeEventListener('scroll', scheduleMarkerUpdate, true);
  window.removeEventListener('resize', scheduleMarkerUpdate);
  window.visualViewport?.removeEventListener('scroll', scheduleMarkerUpdate);
  window.visualViewport?.removeEventListener('resize', scheduleMarkerUpdate);
  window.removeEventListener('inspectra-clear-markers', clearMarkers);
  markerHost?.remove();
  markerHost = null;
  markerEntries = [];
}

function scheduleMarkerUpdate(): void {
  if (markerFrame) return;
  markerFrame = requestAnimationFrame(() => {
    markerFrame = 0;
    if (!document.getElementById('inspectra-floating-overlay-host')) {
      clearMarkers();
      return;
    }
    for (const entry of markerEntries) {
      if (!entry.target.isConnected) {
        entry.frame.hidden = true;
        continue;
      }
      const rect = entry.target.getBoundingClientRect();
      entry.frame.hidden = rect.width <= 0 || rect.height <= 0;
      entry.frame.style.left = `${rect.left}px`;
      entry.frame.style.top = `${rect.top}px`;
      entry.frame.style.width = `${rect.width}px`;
      entry.frame.style.height = `${rect.height}px`;
    }
  });
}

function focusMarker(entry: MarkerEntry): void {
  entry.target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  for (const item of markerEntries) item.outline.classList.remove('selected');
  entry.outline.classList.add('selected');
  scheduleMarkerUpdate();
}

function showMarkers(rawIssues: MarkerIssue[]): void {
  clearMarkers();
  const issues = rawIssues.filter((issue) => typeof issue.selector === 'string' && issue.selector.length > 0);
  if (issues.length === 0) return;

  const host = document.createElement('div');
  host.id = MARKER_HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    pointerEvents: 'none',
  });
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .layer { position: fixed; inset: 0; pointer-events: none; font: 12px/1.3 system-ui, sans-serif; }
    .marker { position: fixed; pointer-events: none; box-sizing: border-box; }
    .outline { position: absolute; inset: 0; border: 2px solid #f59e0b; border-radius: 4px; background: rgba(245, 158, 11, .06); box-shadow: 0 0 0 1px rgba(15, 23, 42, .65); }
    .outline[data-severity="critical"] { border-color: #dc2626; background: rgba(220, 38, 38, .08); }
    .outline[data-severity="major"], .outline[data-severity="important"] { border-color: #ea580c; background: rgba(234, 88, 12, .07); }
    .outline[data-severity="minor"] { border-color: #d97706; background: rgba(217, 119, 6, .06); }
    .outline[data-severity="suggestion"], .outline[data-severity="improvement"], .outline[data-severity="potential-cleanup"] { border-color: #64748b; background: rgba(100, 116, 139, .06); }
    .outline.selected { outline: 3px solid rgba(99, 102, 241, .45); outline-offset: 2px; }
    .badge { position: absolute; top: -13px; left: -9px; min-width: 25px; height: 25px; padding: 0 6px; border: 2px solid #fff; border-radius: 999px; color: #fff; background: #d97706; box-shadow: 0 2px 8px rgba(15, 23, 42, .4); font: 700 11px/1 system-ui, sans-serif; cursor: pointer; pointer-events: auto; }
    .badge[data-severity="critical"] { background: #b91c1c; }
    .badge[data-severity="major"], .badge[data-severity="important"] { background: #c2410c; }
    .badge[data-severity="minor"] { background: #d97706; }
    .badge[data-severity="suggestion"], .badge[data-severity="improvement"], .badge[data-severity="potential-cleanup"] { background: #475569; }
    .badge:focus-visible { outline: 3px solid #6366f1; outline-offset: 2px; }
  `;
  const layer = document.createElement('div');
  layer.className = 'layer';
  shadow.append(style, layer);
  document.documentElement.appendChild(host);
  markerHost = host;
  markerEntries = [];

  const selectorCounts = new Map<string, number>();
  for (const issue of issues) {
    let target: Element | null = null;
    try {
      const matches = document.querySelectorAll(issue.selector);
      if (matches.length !== 1) continue;
      target = matches[0];
    } catch {
      continue;
    }
    if (!target || target === document.body || target === document.documentElement) continue;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const frame = document.createElement('div');
    frame.className = 'marker';
    const outline = document.createElement('div');
    outline.className = 'outline';
    outline.dataset.severity = issue.severity;
    const badge = document.createElement('button');
    badge.className = 'badge';
    badge.dataset.severity = issue.severity;
    badge.textContent = String(markerEntries.length + 1);
    badge.title = `${issue.severity}: ${issue.title}`;
    badge.setAttribute('aria-label', `Issue ${markerEntries.length + 1}: ${issue.severity}, ${issue.title}`);
    frame.append(outline, badge);
    layer.appendChild(frame);

    const entry = { issue, target, frame, badge, outline };
    markerEntries.push(entry);
    const duplicateCount = selectorCounts.get(issue.selector) ?? 0;
    selectorCounts.set(issue.selector, duplicateCount + 1);
    badge.style.top = `${-13 + duplicateCount * 23}px`;
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      focusMarker(entry);
      try {
        chrome.runtime.sendMessage({ type: MSG_ISSUE_MARKER_CLICK, issueId: issue.id });
      } catch {
        /* Extension UI may have been closed. */
      }
    });
    markerResizeObserver ??= new ResizeObserver(scheduleMarkerUpdate);
    markerResizeObserver.observe(target);
  }

  if (markerEntries.length === 0) {
    clearMarkers();
    return;
  }
  window.addEventListener('scroll', scheduleMarkerUpdate, true);
  window.addEventListener('resize', scheduleMarkerUpdate);
  window.visualViewport?.addEventListener('scroll', scheduleMarkerUpdate);
  window.visualViewport?.addEventListener('resize', scheduleMarkerUpdate);
  window.addEventListener('inspectra-clear-markers', clearMarkers);
  markerMutationObserver = new MutationObserver(scheduleMarkerUpdate);
  markerMutationObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
  });
  scheduleMarkerUpdate();
}

function focusIssue(selector: string): void {
  const entry = markerEntries.find((item) => item.issue.selector === selector);
  if (entry) focusMarker(entry);
}

chrome.runtime.onMessage.addListener(
  (msg: { type?: string; issues?: unknown; selector?: unknown }, _sender, sendResponse) => {
  if (msg?.type === MSG_PING) {
    sendResponse({ ok: true, ready: true });
    return true;
  }
  if (msg?.type === MSG_SCAN_FRONTEND) {
    runScan()
      .then((analysis) => {
        const res: ScanResponse = { ok: true, analysis };
        sendResponse(res);
      })
      .catch((err) => {
        const res: ScanResponse = {
          ok: false,
          error: err instanceof Error ? err.message : 'Scan failed unexpectedly.',
        };
        sendResponse(res);
      });
    return true; // async response
  }
  if (msg?.type === MSG_SET_ISSUE_MARKERS) {
    showMarkers(Array.isArray(msg.issues) ? msg.issues as MarkerIssue[] : []);
    sendResponse({ ok: true, count: markerEntries.length });
    return true;
  }
  if (msg?.type === MSG_CLEAR_ISSUE_MARKERS) {
    clearMarkers();
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === MSG_FOCUS_ISSUE) {
    if (typeof msg.selector === 'string') focusIssue(msg.selector);
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === MSG_EXECUTE_BROWSER_ACTION) {
    const rawAction = (msg as { action: BrowserAction }).action;
    executeBrowserAction(rawAction)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) =>
        sendResponse({ ok: false, error: err instanceof Error ? err.message : 'Action failed.' }),
      );
    return true;
  }
  if (msg?.type === MSG_GET_PAGE_OBSERVATION) {
    try {
      const observation = getCompactPageObservation();
      sendResponse({ ok: true, observation });
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : 'Observation failed.' });
    }
    return true;
  }
  if (msg?.type === MSG_RESOLVE_TARGET) {
    try {
      const target = (msg as { target: ActionTarget }).target;
      const el = resolveTarget(target);
      sendResponse({ ok: true, found: Boolean(el) });
    } catch {
      sendResponse({ ok: false, found: false });
    }
    return true;
  }
    return false;
  },
);

// Beacon for readiness checks.
try {
  (window as unknown as { __INSPECTRA_READY?: boolean }).__INSPECTRA_READY = true;
} catch {
  /* ignore */
}
}

export {};
