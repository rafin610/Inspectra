// AgentCore: orchestrates the autonomous frontend exploration and audit loop (Section 18, 19, 20).
// Controls the browser via safe tools, maintains exploration limits, and manages user pause/stop signals.

import { getAdapter } from '../ai/adapters';
import { runAudit } from '../ai/analyzer';
import { captureScreenshot } from '../content/screenshot-manager';
import { describeActionForUser } from './context-engine';
import { StateManager } from './state-manager';
import {
  MSG_EXECUTE_BROWSER_ACTION,
  MSG_GET_PAGE_OBSERVATION,
  MSG_SCAN_FRONTEND,
  MSG_SET_ISSUE_MARKERS,
} from '../shared/messages';
import type {
  ActionResult,
  AgentDecisionContext,
  AgentLimits,
  AgentStatus,
  AIProviderConfig,
  AuditIssue,
  AuditResult,
  BrowserAction,
  CompactPageState,
  ExplorationStep,
  ScanResponse,
  StateRecord,
  WebsiteAnalysis,
} from '../shared/types';

export interface AgentProgress {
  status: AgentStatus;
  currentStep: number;
  maxSteps: number;
  currentActionDescription: string;
  currentStateTitle: string;
  clicksRemaining: number;
  scrollsRemaining: number;
  timeline: ExplorationStep[];
  issues: AuditIssue[];
  statesInspected: StateRecord[];
}

export interface AgentOutcome {
  audit: AuditResult;
  fixPrompt: string;
  page: WebsiteAnalysis['page'];
  providerName: string;
  model: string;
  statesVisited: StateRecord[];
  timeline: ExplorationStep[];
  hadScreenshot: boolean;
}

export interface AgentCallbacks {
  onProgress?: (progress: AgentProgress) => void;
  onIssueFound?: (issue: AuditIssue) => void;
  onComplete?: (outcome: AgentOutcome) => void;
  onError?: (error: unknown) => void;
}

const DEFAULT_LIMITS: AgentLimits = {
  maxSteps: 30,
  maxClicks: 15,
  maxScrolls: 15,
  maxDurationSec: 180,
};

export class AgentCore {
  private tabId: number;
  private config: AIProviderConfig;
  private limits: AgentLimits;
  private callbacks: AgentCallbacks;
  private stateManager = new StateManager();

  private status: AgentStatus = 'idle';
  private currentStep = 0;
  private clicksTaken = 0;
  private scrollsTaken = 0;
  private startTime = 0;

  private timeline: ExplorationStep[] = [];
  private detectedIssues: AuditIssue[] = [];
  private currentActionDescription = 'Initializing...';
  private currentStateTitle = 'Initial Page';

  private pausePromise: Promise<void> | null = null;
  private resumeResolve: (() => void) | null = null;
  private shouldStop = false;

  constructor(tabId: number, config: AIProviderConfig, limits: Partial<AgentLimits> = {}, callbacks: AgentCallbacks = {}) {
    this.tabId = tabId;
    this.config = config;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.callbacks = callbacks;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getTimeline(): ExplorationStep[] {
    return [...this.timeline];
  }

  getIssues(): AuditIssue[] {
    return [...this.detectedIssues];
  }

  /**
   * Pauses exploration loop safely before next action.
   */
  pause(): void {
    if (this.status !== 'exploring') return;
    this.status = 'paused';
    this.pausePromise = new Promise((resolve) => {
      this.resumeResolve = resolve;
    });
    this.emitProgress();
  }

  /**
   * Resumes paused exploration.
   */
  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'exploring';
    if (this.resumeResolve) {
      this.resumeResolve();
      this.resumeResolve = null;
      this.pausePromise = null;
    }
    this.emitProgress();
  }

  /**
   * Stops exploration immediately, preserves all evidence, and synthesizes findings.
   */
  stop(): void {
    this.shouldStop = true;
    if (this.status === 'paused' && this.resumeResolve) {
      this.resumeResolve();
    }
    this.status = 'stopped';
    this.emitProgress();
  }

  private emitProgress(): void {
    this.callbacks.onProgress?.({
      status: this.status,
      currentStep: this.currentStep,
      maxSteps: this.limits.maxSteps,
      currentActionDescription: this.currentActionDescription,
      currentStateTitle: this.currentStateTitle,
      clicksRemaining: Math.max(0, this.limits.maxClicks - this.clicksTaken),
      scrollsRemaining: Math.max(0, this.limits.maxScrolls - this.scrollsTaken),
      timeline: [...this.timeline],
      issues: [...this.detectedIssues],
      statesInspected: this.stateManager.getAllStates(),
    });
  }

  private async sendToTab<T>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 45000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error('Tab message timed out. The page may be navigating or busy.')),
        timeoutMs,
      );
      chrome.tabs.sendMessage(this.tabId, { ...payload, type }, (response: T) => {
        window.clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Could not communicate with tab.'));
          return;
        }
        resolve(response);
      });
    });
  }

  private async fetchPageObservation(): Promise<CompactPageState> {
    const res = await this.sendToTab<{ ok: boolean; observation?: CompactPageState; error?: string }>(
      MSG_GET_PAGE_OBSERVATION,
      {},
      20000,
    );
    if (!res?.ok || !res.observation) {
      throw new Error(res?.error || 'Failed to retrieve compact page observation.');
    }
    return res.observation;
  }

  private async executeActionInTab(action: BrowserAction): Promise<ActionResult> {
    const res = await this.sendToTab<{ ok: boolean; result?: ActionResult; error?: string }>(
      MSG_EXECUTE_BROWSER_ACTION,
      { action },
      30000,
    );
    if (!res?.ok || !res.result) {
      return {
        success: false,
        action: action.action,
        reason: res?.error || 'Browser action execution failed.',
      };
    }
    return res.result;
  }

  private async syncMarkers(): Promise<void> {
    try {
      const mapped = this.detectedIssues
        .filter((i) => i.selector)
        .map((i) => ({
          id: i.id,
          selector: i.selector,
          severity: i.severity,
          title: i.title,
        }));
      await this.sendToTab(MSG_SET_ISSUE_MARKERS, { issues: mapped }, 5000);
    } catch {
      /* ignore marker sync failures */
    }
  }

  /**
   * Main Autonomous Exploration & Audit Entrypoint.
   */
  async start(): Promise<AgentOutcome> {
    this.status = 'exploring';
    this.currentStep = 0;
    this.clicksTaken = 0;
    this.scrollsTaken = 0;
    this.startTime = Date.now();
    this.shouldStop = false;
    this.timeline = [];
    this.detectedIssues = [];
    this.stateManager.reset();

    const adapter = getAdapter(this.config.format);

    // Initial Observation (Section 2)
    this.currentActionDescription = 'Observing initial page state...';
    this.emitProgress();

    let currentState = await this.fetchPageObservation();
    let { record: initialStateRecord } = this.stateManager.recordState(currentState, 'Initial observation');
    this.currentStateTitle = initialStateRecord.title;

    // Record initial step
    this.timeline.push({
      stepNumber: 0,
      action: { action: 'OBSERVE' },
      description: `Observed initial page: "${currentState.title}" (${currentState.viewport.width}x${currentState.viewport.height})`,
      stateId: initialStateRecord.stateId,
      timestamp: new Date().toISOString(),
      result: { success: true, action: 'OBSERVE' },
    });
    this.emitProgress();

    let initialScreenshot: string | null = null;
    try {
      initialScreenshot = await captureScreenshot(1280);
    } catch {
      initialScreenshot = null;
    }

    // ── Controlled Exploration Loop (Section 18 & 19) ───────────────────────
    while (
      this.currentStep < this.limits.maxSteps &&
      !this.shouldStop &&
      Date.now() - this.startTime < this.limits.maxDurationSec * 1000
    ) {
      if (this.pausePromise) {
        await this.pausePromise;
      }
      if (this.shouldStop) break;

      this.currentStep += 1;

      // Build compact context for AI decision
      const decisionContext: AgentDecisionContext = {
        currentState,
        previousSteps: this.timeline,
        detectedIssues: this.detectedIssues,
        stepNumber: this.currentStep,
        maxSteps: this.limits.maxSteps,
        clicksRemaining: Math.max(0, this.limits.maxClicks - this.clicksTaken),
        scrollsRemaining: Math.max(0, this.limits.maxScrolls - this.scrollsTaken),
        visitedStates: this.stateManager.getAllStates().map((s) => s.stateId),
        screenshot: this.currentStep === 1 ? initialScreenshot : undefined,
      };

      this.currentActionDescription = 'Analyzing state and deciding next action...';
      this.emitProgress();

      // Ask AI Brain for next action (Section 4 & 5)
      let decision = await adapter.decideNextAction(this.config, decisionContext);
      const action = decision.action;

      // Update action description
      this.currentActionDescription = describeActionForUser(action);
      this.emitProgress();

      // Handle finish audit action
      if (action.action === 'FINISH_AUDIT') {
        this.timeline.push({
          stepNumber: this.currentStep,
          action,
          description: decision.thought || 'Autonomous exploration complete.',
          stateId: this.stateManager.getCurrentState()?.stateId ?? 'STATE-01',
          timestamp: new Date().toISOString(),
          result: { success: true, action: 'FINISH_AUDIT' },
        });
        break;
      }

      // Handle mark issue action
      if (action.action === 'MARK_ISSUE') {
        const rawIssue = action.issue;
        const issueId = `UI-${String(this.detectedIssues.length + 1).padStart(3, '0')}`;
        const currentRec = this.stateManager.getCurrentState();

        const newIssue: AuditIssue = {
          id: issueId,
          title: rawIssue.title || rawIssue.problem.slice(0, 60),
          category: rawIssue.category || 'layout',
          severity: rawIssue.severity || 'minor',
          problem: rawIssue.problem,
          evidence: rawIssue.evidence,
          whyItMatters: rawIssue.whyItMatters,
          rootCause: rawIssue.rootCause,
          suggestedFix: rawIssue.suggestedFix,
          recommendedFix: rawIssue.suggestedFix,
          element: rawIssue.selector || rawIssue.target?.name || rawIssue.target?.selector || 'page element',
          selector: rawIssue.selector || rawIssue.target?.selector,
          confidence: Math.max(0.5, Math.min(1.0, rawIssue.confidence ?? 0.85)),
          stateId: currentRec?.stateId,
          triggeredBy: currentRec?.triggeringAction,
          viewport: `${currentState.viewport.width}x${currentState.viewport.height}`,
        };

        this.detectedIssues.push(newIssue);
        this.callbacks.onIssueFound?.(newIssue);
        await this.syncMarkers();

        this.timeline.push({
          stepNumber: this.currentStep,
          action,
          description: `Marked issue [${newIssue.severity.toUpperCase()}]: ${newIssue.title}`,
          stateId: currentRec?.stateId ?? 'STATE-01',
          timestamp: new Date().toISOString(),
          result: { success: true, action: 'MARK_ISSUE' },
          issueMarked: newIssue,
        });

        this.emitProgress();
        continue;
      }

      // Track budget for clicks & scrolls
      if (action.action === 'CLICK') {
        if (this.clicksTaken >= this.limits.maxClicks) {
          // Budget reached for clicks, suggest scroll or finish
          this.timeline.push({
            stepNumber: this.currentStep,
            action,
            description: 'Click limit reached. Switching exploration strategy.',
            stateId: this.stateManager.getCurrentState()?.stateId ?? 'STATE-01',
            timestamp: new Date().toISOString(),
            result: { success: false, action: 'CLICK', reason: 'CLICK_LIMIT_REACHED' },
          });
          continue;
        }
        this.clicksTaken += 1;
      }

      if (action.action === 'SCROLL') {
        if (this.scrollsTaken >= this.limits.maxScrolls) {
          this.timeline.push({
            stepNumber: this.currentStep,
            action,
            description: 'Scroll limit reached. Switching exploration strategy.',
            stateId: this.stateManager.getCurrentState()?.stateId ?? 'STATE-01',
            timestamp: new Date().toISOString(),
            result: { success: false, action: 'SCROLL', reason: 'SCROLL_LIMIT_REACHED' },
          });
          continue;
        }
        this.scrollsTaken += 1;
      }

      // Execute browser action safely in tab
      const execResult = await this.executeActionInTab(action);

      // Re-observe state after execution
      currentState = await this.fetchPageObservation();

      const { record: newRec, consecutiveRepeatCount } = this.stateManager.recordState(
        currentState,
        describeActionForUser(action),
      );

      this.currentStateTitle = newRec.title;

      // Add to timeline
      this.timeline.push({
        stepNumber: this.currentStep,
        action,
        description: `${describeActionForUser(action)} → ${execResult.success ? 'Success' : `Failed (${execResult.reason ?? 'error'})`}`,
        stateId: newRec.stateId,
        timestamp: new Date().toISOString(),
        result: execResult,
      });

      this.emitProgress();

      // Check if stuck in a loop on repeated identical state (Section 17 & 18)
      if (this.stateManager.isStuckInLoop()) {
        this.timeline.push({
          stepNumber: this.currentStep + 1,
          action: { action: 'FINISH_AUDIT' },
          description: 'Repeated state loop detected. Wrapping up exploration.',
          stateId: newRec.stateId,
          timestamp: new Date().toISOString(),
          result: { success: true, action: 'FINISH_AUDIT' },
        });
        break;
      }
    }

    // ── Final Synthesis & Prompt Generation (Section 34 & 35) ────────────────
    this.status = 'synthesizing';
    this.currentActionDescription = 'Synthesizing final audit and generating implementation fix prompt...';
    this.emitProgress();

    // Run structural scan for comprehensive background evidence
    let fullAnalysis: WebsiteAnalysis | undefined;
    try {
      const scanRes = await this.sendToTab<ScanResponse>(MSG_SCAN_FRONTEND, {}, 30000);
      if (scanRes?.ok && scanRes.analysis) {
        fullAnalysis = scanRes.analysis;
      }
    } catch {
      /* continue with accumulated state if scan fails */
    }

    // If no full analysis was returned, synthesize one from currentState
    const pageContext: WebsiteAnalysis['page'] = fullAnalysis?.page ?? {
      url: currentState.url,
      title: currentState.title,
      viewportWidth: currentState.viewport.width,
      viewportHeight: currentState.viewport.height,
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollWidth: currentState.viewport.width,
      scrollHeight: currentState.scrollPosition.maxScrollY + currentState.viewport.height,
      bodyScrollWidth: currentState.viewport.width,
      hasHorizontalOverflow: currentState.responsiveSignals.hasHorizontalOverflow,
    };

    // If no issues were marked during exploration or if full scan found extra defects,
    // run analyzer to ensure no issues were missed
    let finalAudit: AuditResult;
    if (fullAnalysis && this.detectedIssues.length === 0) {
      try {
        finalAudit = await runAudit(this.config, fullAnalysis, { screenshot: initialScreenshot });
        this.detectedIssues = [...finalAudit.issues];
      } catch {
        finalAudit = this.buildFallbackAudit();
      }
    } else {
      finalAudit = {
        summary: `Autonomous frontend exploration inspected ${this.stateManager.getDistinctStateCount()} distinct UI states across ${this.currentStep} interaction steps, detecting ${this.detectedIssues.length} issues.`,
        issues: [...this.detectedIssues],
        potentialCleanup: [],
        overallAssessment: this.buildOverallAssessment(),
        statesInspectedCount: this.stateManager.getDistinctStateCount(),
        interactionsTestedCount: this.currentStep,
      };
    }

    // Synchronize markers on real DOM
    await this.syncMarkers();

    // Generate complete implementation-ready prompt (Section 35 & 36)
    const fixPrompt = adapter.buildFixPrompt(
      this.config,
      finalAudit,
      pageContext,
      this.timeline,
      this.stateManager.getAllStates(),
    );

    const outcome: AgentOutcome = {
      audit: finalAudit,
      fixPrompt,
      page: pageContext,
      providerName: this.config.name,
      model: this.config.model,
      statesVisited: this.stateManager.getAllStates(),
      timeline: this.timeline,
      hadScreenshot: Boolean(initialScreenshot),
    };

    this.status = 'completed';
    this.currentActionDescription = 'Audit complete!';
    this.emitProgress();
    this.callbacks.onComplete?.(outcome);

    return outcome;
  }

  private buildFallbackAudit(): AuditResult {
    return {
      summary: `Autonomous audit completed across ${this.timeline.length} steps.`,
      issues: [...this.detectedIssues],
      potentialCleanup: [],
      overallAssessment: `Explored ${this.stateManager.getDistinctStateCount()} distinct UI states.`,
      statesInspectedCount: this.stateManager.getDistinctStateCount(),
      interactionsTestedCount: this.currentStep,
    };
  }

  private buildOverallAssessment(): string {
    const critical = this.detectedIssues.filter((i) => i.severity === 'critical').length;
    const major = this.detectedIssues.filter((i) => i.severity === 'major' || i.severity === 'important').length;
    const minor = this.detectedIssues.filter((i) => i.severity === 'minor').length;
    const suggestions = this.detectedIssues.filter((i) => i.severity === 'suggestion' || i.severity === 'improvement').length;

    return `Autonomous audit concluded with ${this.detectedIssues.length} findings: ${critical} Critical, ${major} Major, ${minor} Minor, and ${suggestions} Suggestions. The agent navigated through ${this.stateManager.getDistinctStateCount()} distinct UI states and tested interactive components, navigation, and responsiveness.`;
  }
}
