// Message types exchanged between sidepanel ↔ content ↔ background.

export const MSG_SCAN_FRONTEND = 'INSPECTRA_SCAN_FRONTEND';
export const MSG_PING = 'INSPECTRA_PING';
export const MSG_TOGGLE_OVERLAY = 'INSPECTRA_TOGGLE_OVERLAY';
export const MSG_CLOSE_OVERLAY = 'INSPECTRA_CLOSE_OVERLAY';
export const MSG_MINIMIZE_OVERLAY = 'INSPECTRA_MINIMIZE_OVERLAY';
export const MSG_RESTORE_OVERLAY = 'INSPECTRA_RESTORE_OVERLAY';
export const MSG_OPEN_OPTIONS = 'INSPECTRA_OPEN_OPTIONS';
export const MSG_SET_ISSUE_MARKERS = 'INSPECTRA_SET_ISSUE_MARKERS';
export const MSG_CLEAR_ISSUE_MARKERS = 'INSPECTRA_CLEAR_ISSUE_MARKERS';
export const MSG_FOCUS_ISSUE = 'INSPECTRA_FOCUS_ISSUE';
export const MSG_ISSUE_MARKER_CLICK = 'INSPECTRA_ISSUE_MARKER_CLICK';

// Autonomous browser agent messages
export const MSG_EXECUTE_BROWSER_ACTION = 'INSPECTRA_EXECUTE_BROWSER_ACTION';
export const MSG_GET_PAGE_OBSERVATION = 'INSPECTRA_GET_PAGE_OBSERVATION';
export const MSG_RESOLVE_TARGET = 'INSPECTRA_RESOLVE_TARGET';

export interface ScanRequestMessage {
  type: typeof MSG_SCAN_FRONTEND;
}

export interface PingMessage {
  type: typeof MSG_PING;
}

export interface ToggleOverlayMessage {
  type: typeof MSG_TOGGLE_OVERLAY;
}

export type ExtensionMessage = ScanRequestMessage | PingMessage | ToggleOverlayMessage;

export const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'view-source:',
  'chrome-search://',
  'devtools://',
  'data:',
  'javascript:',
  'file:',
];

export function isScannableUrl(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (RESTRICTED_PREFIXES.some((p) => trimmed.startsWith(p))) return false;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'chromewebstore.google.com' || host === 'chrome.google.com') {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}
