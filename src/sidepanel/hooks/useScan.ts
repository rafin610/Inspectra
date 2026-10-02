import { useCallback, useRef, useState } from 'react';
import { AgentCore, type AgentProgress } from '../../agent/agent-core';
import { AuditError, ConfigError, getAdapter } from '../../ai/adapters';
import { runAudit } from '../../ai/analyzer';
import { captureScreenshot } from '../../content/screenshot-manager';
import { getActiveProvider, loadAIStore, scanBlockers, setActiveProvider } from '../../settings/storage';
import {
  MSG_CLEAR_ISSUE_MARKERS,
  MSG_FOCUS_ISSUE,
  MSG_PING,
  MSG_SCAN_FRONTEND,
  MSG_SET_ISSUE_MARKERS,
  isScannableUrl,
} from '../../shared/messages';
import type {
  AIProviderConfig,
  AuditIssue,
  AuditResult,
  ExplorationStep,
  ScanResponse,
  StateRecord,
  WebsiteAnalysis,
} from '../../shared/types';

export type ScanStage =
  | 'idle'
  | 'reading'
  | 'inspecting'
  | 'layout'
  | 'responsive'
  | 'visual'
  | 'analyzing'
  | 'exploring'
  | 'done'
  | 'error';

export const STAGE_LABELS: { stage: ScanStage; label: string }[] = [
  { stage: 'reading', label: 'Reading page structure' },
  { stage: 'inspecting', label: 'Inspecting visible elements' },
  { stage: 'layout', label: 'Analyzing layout' },
  { stage: 'responsive', label: 'Checking responsive behavior' },
  { stage: 'visual', label: 'Analyzing visual design' },
  { stage: 'analyzing', label: 'Preparing AI analysis' },
];

export interface ScanOutcome {
  audit: AuditResult;
  fixPrompt: string;
  page: WebsiteAnalysis['page'];
  providerName: string;
  model: string;
  hadScreenshot: boolean;
  statesVisited?: StateRecord[];
  timeline?: ExplorationStep[];
}

export interface AIErrorInfo {
  providerName: string;
  model: string;
  endpoint: string;
  reason: string;
  solutions: string[];
}

export type ScanError =
  | { kind: 'message'; message: string }
  | { kind: 'blockers'; blockers: string[]; hasProviders: boolean }
  | { kind: 'ai'; info: AIErrorInfo };

export type AIStatus =
  | { kind: 'ready'; active: AIProviderConfig; all: AIProviderConfig[] }
  | { kind: 'incomplete'; blockers: string[]; hasProviders: boolean; all: AIProviderConfig[] }
  | { kind: 'none'; all: AIProviderConfig[] };

function sendToTab<T>(tabId: number, type: string, timeoutMs = 45000, payload: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('Scan timed out — the page may be too heavy or still loading.')),
      timeoutMs,
    );
    chrome.tabs.sendMessage(tabId, { ...payload, type }, (response: T) => {
      window.clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Could not reach the page.'));
        return;
      }
      resolve(response);
    });
  });
}

async function ensureScanner(tabId: number): Promise<void> {
  try {
    await sendToTab<{ ok: boolean }>(tabId, MSG_PING, 4000);
    return;
  } catch {
    /* fall through to injection */
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/scanner.js'] });
  await new Promise((r) => setTimeout(r, 600));
  await sendToTab<{ ok: boolean }>(tabId, MSG_PING, 6000);
}

function toScanError(e: unknown, hasProviders: boolean): ScanError {
  if (e instanceof ConfigError) return { kind: 'blockers', blockers: e.blockers, hasProviders };
  if (e instanceof AuditError) {
    return {
      kind: 'ai',
      info: {
        providerName: e.details.providerName,
        model: e.details.model,
        endpoint: e.details.endpoint,
        reason: e.details.reason,
        solutions: e.details.solutions,
      },
    };
  }
  return { kind: 'message', message: e instanceof Error ? e.message : 'Scan failed unexpectedly.' };
}

export function useScan() {
  const [stage, setStage] = useState<ScanStage>('idle');
  const [domain, setDomain] = useState('');
  const [scannable, setScannable] = useState(true);
  const [aiStatus, setAiStatus] = useState<AIStatus>({ kind: 'none', all: [] });
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [error, setError] = useState<ScanError | null>(null);

  // Autonomous Agent State
  const [agentProgress, setAgentProgress] = useState<AgentProgress | null>(null);
  const agentRef = useRef<AgentCore | null>(null);
  const timerRef = useRef<number | null>(null);

  const sendMarkerMessage = useCallback(async (type: string, payload: Record<string, unknown> = {}) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id !== undefined) await sendToTab(tab.id, type, 3000, payload);
    } catch {
      /* The page may have navigated or overlay closed */
    }
  }, []);

  const setIssueMarkers = useCallback(
    (issues: AuditIssue[]) => {
      const mapped = issues
        .filter((issue) => issue.selector)
        .map((issue) => ({
          id: issue.id,
          selector: issue.selector,
          severity: issue.severity,
          title: issue.title || issue.problem,
        }));
      return sendMarkerMessage(MSG_SET_ISSUE_MARKERS, { issues: mapped });
    },
    [sendMarkerMessage],
  );

  const clearIssueMarkers = useCallback(() => sendMarkerMessage(MSG_CLEAR_ISSUE_MARKERS), [sendMarkerMessage]);

  const focusIssue = useCallback(
    (issue: AuditIssue) => {
      if (issue.selector) return sendMarkerMessage(MSG_FOCUS_ISSUE, { selector: issue.selector });
      return Promise.resolve();
    },
    [sendMarkerMessage],
  );

  const refreshTab = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const url = tab?.url ?? '';
      setScannable(isScannableUrl(url));
      try {
        setDomain(url ? new URL(url).hostname : '');
      } catch {
        setDomain(url);
      }
      const store = await loadAIStore();
      const active = getActiveProvider(store);
      if (!active) {
        setAiStatus({ kind: 'none', all: store.providers });
      } else {
        const blockers = scanBlockers(active);
        const adapterGaps = getAdapter(active.format).validate(active);
        const all = blockers.length > 0 ? blockers : adapterGaps.filter((g) => !g.startsWith('Provider name'));
        if (all.length > 0) {
          setAiStatus({ kind: 'incomplete', blockers: all, hasProviders: true, all: store.providers });
        } else {
          setAiStatus({ kind: 'ready', active, all: store.providers });
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const switchActive = useCallback(
    async (id: string) => {
      await setActiveProvider(id);
      await refreshTab();
    },
    [refreshTab],
  );

  const advanceStages = useCallback(() => {
    const order: ScanStage[] = ['reading', 'inspecting', 'layout', 'responsive', 'visual'];
    let i = 0;
    setStage(order[0]);
    timerRef.current = window.setInterval(() => {
      i += 1;
      if (i < order.length) setStage(order[i]);
    }, 1400);
  }, []);

  const stopStages = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Primary: Autonomous AI Agent Exploration and Frontend Audit (Section 2, 18, 19).
   */
  const startAgentAudit = useCallback(async () => {
    setError(null);
    setOutcome(null);
    setAgentProgress(null);
    await clearIssueMarkers();

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined) {
      setStage('error');
      setError({ kind: 'message', message: 'No active tab found. Open a website and try again.' });
      return;
    }
    if (!isScannableUrl(tab.url)) {
      setStage('error');
      setScannable(false);
      setError({ kind: 'message', message: 'This page cannot be scanned by Chrome extensions.' });
      return;
    }

    const store = await loadAIStore();
    const active = getActiveProvider(store);
    const blockers = scanBlockers(active);
    if (blockers.length > 0) {
      setStage('error');
      await refreshTab();
      setError({ kind: 'blockers', blockers, hasProviders: store.providers.length > 0 });
      return;
    }
    const config = active as AIProviderConfig;

    setStage('exploring');

    try {
      await ensureScanner(tab.id);

      const agent = new AgentCore(
        tab.id,
        config,
        { maxSteps: 30, maxClicks: 15, maxScrolls: 15, maxDurationSec: 180 },
        {
          onProgress: (p) => setAgentProgress(p),
          onIssueFound: () => {},
        },
      );
      agentRef.current = agent;

      const res = await agent.start();

      setOutcome({
        audit: res.audit,
        fixPrompt: res.fixPrompt,
        page: res.page,
        providerName: res.providerName,
        model: res.model,
        hadScreenshot: res.hadScreenshot,
        statesVisited: res.statesVisited,
        timeline: res.timeline,
      });

      setStage('done');
    } catch (e) {
      setStage('error');
      setError(toScanError(e, store.providers.length > 0));
    } finally {
      agentRef.current = null;
    }
  }, [clearIssueMarkers, refreshTab]);

  const pauseAgent = useCallback(() => {
    agentRef.current?.pause();
  }, []);

  const resumeAgent = useCallback(() => {
    agentRef.current?.resume();
  }, []);

  const stopAgent = useCallback(() => {
    agentRef.current?.stop();
  }, []);

  /**
   * Fast Single-Viewport Snapshot Scan (Preserved original feature).
   */
  const runQuickScan = useCallback(async () => {
    setError(null);
    setOutcome(null);
    setAgentProgress(null);
    await clearIssueMarkers();

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined) {
      setStage('error');
      setError({ kind: 'message', message: 'No active tab found. Open a website and try again.' });
      return;
    }
    if (!isScannableUrl(tab.url)) {
      setStage('error');
      setScannable(false);
      setError({ kind: 'message', message: 'This page cannot be scanned by Chrome extensions.' });
      return;
    }

    const store = await loadAIStore();
    const active = getActiveProvider(store);
    const blockers = scanBlockers(active);
    if (blockers.length > 0) {
      setStage('error');
      await refreshTab();
      setError({ kind: 'blockers', blockers, hasProviders: store.providers.length > 0 });
      return;
    }
    const config = active as AIProviderConfig;

    advanceStages();
    try {
      await ensureScanner(tab.id);
      const res = await sendToTab<ScanResponse>(tab.id, MSG_SCAN_FRONTEND, 60000);
      if (!res?.ok || !res.analysis) {
        throw new Error(res?.error || 'The page did not return scan data. Reload the page and retry.');
      }
      const analysis = res.analysis;
      setStage('analyzing');

      let screenshot: string | null = null;
      if (store.includeScreenshot) {
        try {
          screenshot = await captureScreenshot();
        } catch {
          screenshot = null;
        }
      }

      const audit = await runAudit(config, analysis, { screenshot });
      const adapter = getAdapter(config.format);

      setOutcome({
        audit,
        fixPrompt: adapter.buildFixPrompt(config, audit, analysis.page),
        page: analysis.page,
        providerName: config.name,
        model: config.model,
        hadScreenshot: !!screenshot,
      });
      setStage('done');
    } catch (e) {
      setStage('error');
      setError(toScanError(e, store.providers.length > 0));
    } finally {
      stopStages();
    }
  }, [advanceStages, stopStages, refreshTab, clearIssueMarkers]);

  const reset = useCallback(() => {
    stopStages();
    agentRef.current?.stop();
    agentRef.current = null;
    setStage('idle');
    setAgentProgress(null);
    setError(null);
    setOutcome(null);
  }, [stopStages]);

  return {
    stage,
    domain,
    scannable,
    aiStatus,
    outcome,
    error,
    agentProgress,
    startAgentAudit,
    pauseAgent,
    resumeAgent,
    stopAgent,
    runQuickScan,
    reset,
    refreshTab,
    switchActive,
    setIssueMarkers,
    clearIssueMarkers,
    focusIssue,
  };
}
