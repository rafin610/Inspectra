// ── Inspectra shared types ────────────────────────────────────────────────
// Compact, evidence-driven representation of the rendered frontend.
// Never include passwords, tokens, cookies, or full HTML dumps.

// ── Flexible AI provider configuration ────────────────────────────────────
// Inspectra knows HOW to speak to an AI provider (adapters), but never
// assumes WHICH provider or model the user must use. The provider name is
// a human label only; the `format` field selects the wire adapter.

export type AIAdapterFormat = 'openai-compatible' | 'gemini-native' | 'custom';

export interface AIProviderConfig {
  id: string;
  name: string;
  format: AIAdapterFormat;
  /** Base endpoint, e.g. "https://example.com/v1". Optional for gemini-native. */
  endpoint: string;
  apiKey: string;
  /** Exact model string sent to the provider. Never defaulted by Inspectra. */
  model: string;
}

export interface AIStore {
  providers: AIProviderConfig[];
  /** Id of the provider used for scans. */
  activeId: string | null;
  includeScreenshot: boolean;
}

export type IssueCategory =
  | 'layout'
  | 'spacing'
  | 'responsive'
  | 'visual'
  | 'color'
  | 'contrast'
  | 'typography'
  | 'ux'
  | 'interaction'
  | 'components'
  | 'content'
  | 'performance'
  | 'accessibility'
  | 'cleanup';

export type IssueSeverity =
  | 'critical'
  | 'major'
  | 'minor'
  | 'suggestion'
  // Legacy aliases
  | 'important'
  | 'improvement'
  | 'potential-cleanup';

export interface AuditIssue {
  id: string;
  title: string;
  category: IssueCategory;
  severity: IssueSeverity;
  confidence: number;

  problem: string;
  evidence: string;
  whyItMatters?: string;
  rootCause?: string;
  suggestedFix: string;
  recommendedFix: string;

  element: string;
  selector?: string;

  stateId?: string;
  triggeredBy?: string;
  viewport?: string;
  screenshotReference?: string;
}

export interface CleanupSuggestion {
  id: string;
  element: string;
  reason: string;
  recommendation: string;
}

export interface AuditResult {
  summary: string;
  issues: AuditIssue[];
  potentialCleanup: CleanupSuggestion[];
  overallAssessment: string;
  statesInspectedCount?: number;
  interactionsTestedCount?: number;
}

// ── Scan payload (content script → UI) ─────────────────────────────────────

export interface PageInfo {
  url: string;
  title: string;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  scrollWidth: number;
  scrollHeight: number;
  bodyScrollWidth: number;
  hasHorizontalOverflow: boolean;
  framework?: string;
  frameworkConfidence?: 'high' | 'medium' | 'low';
}

export interface ScannedElement {
  tag: string;
  role?: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  visible: boolean;
  text?: string;
  styles: Record<string, string>;
  overflow: { x: string; y: string; clipped: boolean };
  parentSelector?: string;
  isInteractive: boolean;
}

export interface LayoutSignal {
  kind:
    | 'overlap'
    | 'overflow-x'
    | 'clipped'
    | 'misaligned'
    | 'inconsistent-gap'
    | 'fixed-width-risk'
    | 'tiny-tap-target'
    | 'small-text'
    | 'low-contrast'
    | 'missing-alt'
    | 'missing-label';
  selector: string;
  detail: string;
  metric?: string;
}

export interface ResponsiveSignal {
  hasHorizontalOverflow: boolean;
  overflowPx: number;
  fixedWidthElements: { selector: string; width: string }[];
  mediaQueryCount: number;
  hasViewportMeta: boolean;
  smallTapTargets: number;
  tinyTextNodes: number;
}

export interface WebsiteAnalysis {
  page: PageInfo;
  elementCount: number;
  elements: ScannedElement[];
  layoutSignals: LayoutSignal[];
  responsive: ResponsiveSignal;
  typography: {
    headingOrder: string[];
    fontFamilies: string[];
    fontSizes: string[];
    minBodySize: number | null;
  };
  visual: {
    colors: string[];
    borderRadii: string[];
    shadows: string[];
  };
  clutter: { selector: string; reason: string }[];
  collectedAt: string;
}

export interface ScanResponse {
  ok: boolean;
  analysis?: WebsiteAnalysis;
  error?: string;
}

// ── Browser Action & Autonomous Agent Types ────────────────────────────────

export interface ActionTarget {
  selector?: string;
  id?: string;
  role?: string;
  name?: string;
  text?: string;
  tag?: string;
  dataTestId?: string;
}

export type BrowserActionType =
  | 'OBSERVE'
  | 'SCREENSHOT'
  | 'SCROLL'
  | 'CLICK'
  | 'HOVER'
  | 'FOCUS'
  | 'WAIT'
  | 'GET_ELEMENT_INFO'
  | 'INSPECT_STATE'
  | 'MARK_ISSUE'
  | 'FINISH_AUDIT';

export interface ObserveAction {
  action: 'OBSERVE';
}

export interface ScreenshotAction {
  action: 'SCREENSHOT';
  reason?: string;
}

export interface ScrollAction {
  action: 'SCROLL';
  direction: 'down' | 'up' | 'top' | 'bottom';
  amount?: number;
  target?: ActionTarget;
}

export interface ClickAction {
  action: 'CLICK';
  target: ActionTarget;
}

export interface HoverAction {
  action: 'HOVER';
  target: ActionTarget;
}

export interface FocusAction {
  action: 'FOCUS';
  target: ActionTarget;
}

export interface WaitAction {
  action: 'WAIT';
  duration?: number;
}

export interface GetElementInfoAction {
  action: 'GET_ELEMENT_INFO';
  target: ActionTarget;
}

export interface InspectStateAction {
  action: 'INSPECT_STATE';
  name?: string;
  focusArea?: string;
}

export interface MarkIssueAction {
  action: 'MARK_ISSUE';
  issue: {
    title: string;
    category: IssueCategory;
    severity: IssueSeverity;
    problem: string;
    evidence: string;
    whyItMatters?: string;
    rootCause?: string;
    suggestedFix: string;
    confidence: number;
    target?: ActionTarget;
    selector?: string;
  };
}

export interface FinishAuditAction {
  action: 'FINISH_AUDIT';
  summary?: string;
  overallAssessment?: string;
}

export type BrowserAction =
  | ObserveAction
  | ScreenshotAction
  | ScrollAction
  | ClickAction
  | HoverAction
  | FocusAction
  | WaitAction
  | GetElementInfoAction
  | InspectStateAction
  | MarkIssueAction
  | FinishAuditAction;

export interface ActionResult {
  success: boolean;
  action: BrowserActionType;
  reason?: string;
  newScrollPosition?: number;
  viewport?: { width: number; height: number };
  newVisibleElements?: CompactElement[];
  elementInfo?: Record<string, unknown>;
  stateDescription?: string;
  data?: Record<string, unknown>;
}

export interface CompactElement {
  id?: string;
  tag: string;
  role?: string;
  selector: string;
  name?: string;
  text?: string;
  rect: { x: number; y: number; width: number; height: number };
  isInteractive: boolean;
  priorityCategory?:
    | 'navigation'
    | 'cta'
    | 'menu'
    | 'dropdown'
    | 'tab'
    | 'accordion'
    | 'filter'
    | 'search'
    | 'modal'
    | 'form'
    | 'other';
  classes?: string[];
  disabled?: boolean;
}

export interface CompactPageState {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  scrollPosition: { x: number; y: number; maxScrollY: number };
  activeModalsOrDialogs: string[];
  openMenus: string[];
  interactableCandidates: CompactElement[];
  layoutIssuesSummary: string[];
  responsiveSignals: {
    hasHorizontalOverflow: boolean;
    overflowPx: number;
    fixedWidthElementsCount: number;
  };
  stateFingerprint: string;
}

export interface StateRecord {
  stateId: string;
  title: string;
  url: string;
  viewport: { width: number; height: number };
  scrollPosition: number;
  triggeringAction?: string;
  timestamp: string;
  fingerprint: string;
  screenshotRef?: string;
}

export interface ExplorationStep {
  stepNumber: number;
  action: BrowserAction;
  description: string;
  stateId: string;
  timestamp: string;
  result?: ActionResult;
  issueMarked?: AuditIssue;
}

export interface AgentLimits {
  maxSteps: number;
  maxClicks: number;
  maxScrolls: number;
  maxDurationSec: number;
}

export type AgentStatus =
  | 'idle'
  | 'exploring'
  | 'paused'
  | 'stopped'
  | 'synthesizing'
  | 'completed'
  | 'error';

export interface AgentDecisionContext {
  currentState: CompactPageState;
  previousSteps: ExplorationStep[];
  detectedIssues: AuditIssue[];
  stepNumber: number;
  maxSteps: number;
  clicksRemaining: number;
  scrollsRemaining: number;
  visitedStates: string[];
  screenshot?: string | null;
}

export interface AgentDecision {
  thought?: string;
  action: BrowserAction;
}
