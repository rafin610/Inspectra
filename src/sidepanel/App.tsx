import { useEffect, useMemo, useState } from 'react';
import Settings from '../settings/Settings';
import type { AuditIssue, ExplorationStep, IssueCategory, IssueSeverity, StateRecord } from '../shared/types';
import AgentExploringView from './components/AgentExploringView';
import IssueCard from './components/IssueCard';
import ProgressSteps from './components/ProgressSteps';
import PromptView from './components/PromptView';
import { SEVERITY_DOT, SEVERITY_STYLE, severityLabel } from './components/severity';
import { useScan, type AIStatus, type ScanError } from './hooks/useScan';
import { MSG_CLOSE_OVERLAY, MSG_MINIMIZE_OVERLAY } from '../shared/messages';

type View = 'main' | 'settings';

/**
 * Close asks the page's content script to remove the overlay host.
 *
 * The Inspectra UI runs inside a cross-origin iframe, so it cannot remove
 * its own overlay DOM directly. The content script owns the overlay and
 * is the only context that can detach it cleanly. We send it a message and
 * it removes #inspectra-floating-overlay-host.
 */
function sendOverlayMessage(type: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type }, (response?: { ok?: boolean; removed?: boolean }) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(response?.ok ?? false);
      });
    } catch {
      resolve(false);
    }
  });
}

function closeOverlay(): Promise<boolean> {
  return sendOverlayMessage(MSG_CLOSE_OVERLAY);
}

function minimizeOverlay(): Promise<boolean> {
  return sendOverlayMessage(MSG_MINIMIZE_OVERLAY);
}

const FILTERS: ('all' | IssueSeverity)[] = [
  'all',
  'critical',
  'major',
  'minor',
  'suggestion',
];

const CATEGORY_FILTERS: ('all' | IssueCategory)[] = [
  'all',
  'layout',
  'spacing',
  'typography',
  'color',
  'contrast',
  'responsive',
  'accessibility',
  'interaction',
  'components',
  'visual',
  'ux',
  'content',
  'cleanup',
];

export default function App() {
  const [view, setView] = useState<View>('main');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);


  const {
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
    focusIssue,
  } = useScan();

  useEffect(() => {
    refreshTab();
  }, [refreshTab]);

  useEffect(() => {
    const onMarkerClick = (message: { type?: string; issueId?: string }) => {
      if (message.type === 'INSPECTRA_ISSUE_MARKER_CLICK' && message.issueId) {
        setSelectedIssueId(message.issueId);
        setView('main');
      }
    };
    chrome.runtime.onMessage.addListener(onMarkerClick);
    return () => chrome.runtime.onMessage.removeListener(onMarkerClick);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: outcome?.audit.issues.length ?? 0 };
    for (const i of outcome?.audit.issues ?? []) {
      const normalizedSev =
        i.severity === 'important' ? 'major' : i.severity === 'improvement' ? 'suggestion' : i.severity;
      c[normalizedSev] = (c[normalizedSev] ?? 0) + 1;
    }
    return c;
  }, [outcome]);

  const visibleIssues = useMemo(() => {
    if (!outcome) return [];
    if (filter === 'all') return outcome.audit.issues;
    return outcome.audit.issues.filter((i) => {
      const normalizedSev =
        i.severity === 'important' ? 'major' : i.severity === 'improvement' ? 'suggestion' : i.severity;
      return normalizedSev === filter;
    });
  }, [outcome, filter]);

  const busy = ['reading', 'inspecting', 'layout', 'responsive', 'visual', 'analyzing', 'exploring'].includes(stage);

  return (
    <div className="in-app flex min-h-screen flex-col">
      {/* Header */}
      <header className="in-header sticky top-0 z-10 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="in-btn-primary flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold">
              In
            </div>
            <div>
              <h1 className="in-title text-sm font-bold leading-tight">Inspectra</h1>
              <p className="in-caption text-[11px] leading-tight">Autonomous Frontend Audit Agent</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setView((v) => (v === 'settings' ? 'main' : 'settings'))}
              className="in-btn-ghost px-2.5 py-1.5 text-xs font-medium"
              aria-label="Settings"
            >
              {view === 'settings' ? '← Back' : '⚙ Settings'}
            </button>
            <button
              onClick={() => { void minimizeOverlay(); }}
              className="in-winbtn"
              aria-label="Minimize Inspectra"
              title="Minimize (keeps session state)"
            >
              —
            </button>
            <button
              onClick={() => { void closeOverlay(); }}
              className="in-winbtn in-winbtn-close"
              aria-label="Close Inspectra"
              title="Close panel"
            >
              ×
            </button>
          </div>
        </div>
        {domain && (
          <p className="in-caption mt-1.5 truncate text-xs">
            Target: <span className="in-body font-medium">{domain}</span>
          </p>
        )}
      </header>

      <main className="flex flex-1 flex-col gap-3 p-4">
        {view === 'settings' ? (
          <div className="in-card rounded-2xl p-4">
            <Settings onChanged={() => refreshTab()} />
          </div>
        ) : stage === 'idle' ? (
          <IdleView
            domain={domain}
            scannable={scannable}
            aiStatus={aiStatus}
            onStartAgent={startAgentAudit}
            onQuickScan={runQuickScan}
            onSettings={() => setView('settings')}
            onSwitch={switchActive}
          />
        ) : stage === 'exploring' ? (
          <AgentExploringView
            progress={agentProgress}
            onPause={pauseAgent}
            onResume={resumeAgent}
            onStop={stopAgent}
          />
        ) : busy ? (
          <ProgressSteps stage={stage} />
        ) : stage === 'done' && outcome ? (
          <ResultsView
            summary={outcome.audit.summary}
            overall={outcome.audit.overallAssessment}
            providerName={outcome.providerName}
            model={outcome.model}
            counts={counts}
            filter={filter}
            setFilter={setFilter}
            issues={visibleIssues}
            totalIssues={outcome.audit.issues.length}
            cleanup={outcome.audit.potentialCleanup}
            prompt={outcome.fixPrompt}
            selectedIssueId={selectedIssueId}
            statesVisited={outcome.statesVisited}
            timeline={outcome.timeline}
            onFocusIssue={(issue) => {
              setSelectedIssueId(issue.id);
              void focusIssue(issue);
            }}
            onMarkerIssues={setIssueMarkers}
            onScanAgain={() => {
              reset();
              setFilter('all');
              setSelectedIssueId(null);
            }}
          />
        ) : (
          <ErrorView
            error={error ?? { kind: 'message', message: 'Something went wrong.' }}
            scannable={scannable}
            onRetry={() => {
              reset();
              startAgentAudit();
            }}
            onSettings={() => setView('settings')}
          />
        )}
      </main>

      <footer className="in-footer px-4 py-2">
        <p className="text-center text-[11px]">
          Inspectra executes safely in-browser. Keys remain local in Chrome storage.
        </p>
      </footer>
    </div>
  );
}



/* ── Idle View ───────────────────────────────────────────────────────────── */

function IdleView({
  domain,
  scannable,
  aiStatus,
  onStartAgent,
  onQuickScan,
  onSettings,
  onSwitch,
}: {
  domain: string;
  scannable: boolean;
  aiStatus: AIStatus;
  onStartAgent: () => void;
  onQuickScan: () => void;
  onSettings: () => void;
  onSwitch: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="in-card rounded-2xl p-5 text-center">
        <h2 className="in-title text-base font-bold">Frontend AI Auditor</h2>
        <p className="in-body mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed">
          Autonomous browser agent that explores, tests, and audits your live frontend, then generates a complete fix prompt.
        </p>
        {domain && (
          <p className="in-chip mt-2 inline-block rounded-full px-3 py-1 font-mono text-xs">
            {domain}
          </p>
        )}

        {/* Active AI selector */}
        {aiStatus.kind === 'ready' && (
          <div className="mx-auto mt-3 max-w-xs text-left">
            <p className="in-label">Active AI Model</p>
            {aiStatus.all.length > 1 ? (
              <select
                value={aiStatus.active.id}
                onChange={(e) => onSwitch(e.target.value)}
                className="in-input mt-1 text-xs font-medium"
                aria-label="Active AI provider"
              >
                {aiStatus.all.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.model})
                  </option>
                ))}
              </select>
            ) : (
              <p className="in-body mt-1 truncate text-xs font-medium">
                {aiStatus.active.name} — <span className="font-mono">{aiStatus.active.model}</span>
              </p>
            )}
          </div>
        )}

        {/* Primary Agent Action */}
        <button
          onClick={onStartAgent}
          disabled={!scannable || aiStatus.kind !== 'ready'}
          className="in-btn-primary mt-4 flex w-full items-center justify-center gap-2 px-4 py-3 text-sm"
        >
          <span>🤖</span>
          <span>Start Autonomous Agent Audit</span>
        </button>

        {/* Secondary Quick Scan Action */}
        <button
          onClick={onQuickScan}
          disabled={!scannable || aiStatus.kind !== 'ready'}
          className="in-btn-ghost mt-2 w-full px-4 py-2 text-xs font-medium"
        >
          Run Quick Single-Viewport Scan
        </button>

        {!scannable && (
          <p className="mt-2 text-xs leading-relaxed text-[var(--in-warn)]">
            This page cannot be scanned by Chrome extensions.
          </p>
        )}
      </div>

      {scannable && aiStatus.kind === 'none' && (
        <div className="in-notice-warn rounded-xl p-4 text-center">
          <p className="in-title text-sm font-medium">No AI provider configured.</p>
          <button
            onClick={onSettings}
            className="in-btn-ghost mt-2 px-4 py-1.5 text-xs font-semibold"
          >
            Configure AI Provider
          </button>
        </div>
      )}

      {scannable && aiStatus.kind === 'incomplete' && (
        <div className="in-notice-warn rounded-xl p-4 text-center">
          {aiStatus.blockers.map((b) => (
            <p key={b} className="in-title text-sm font-medium">
              {b}
            </p>
          ))}
          <p className="in-body mt-1 text-xs">Please open Settings and complete the configuration.</p>
          <button
            onClick={onSettings}
            className="in-btn-ghost mt-2 px-4 py-1.5 text-xs font-semibold"
          >
            Open Settings
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Results View ────────────────────────────────────────────────────────── */

function ResultsView(props: {
  summary: string;
  overall: string;
  providerName: string;
  model: string;
  counts: Record<string, number>;
  filter: (typeof FILTERS)[number];
  setFilter: (f: (typeof FILTERS)[number]) => void;
  issues: AuditIssue[];
  totalIssues: number;
  cleanup: import('../shared/types').CleanupSuggestion[];
  prompt: string;
  selectedIssueId: string | null;
  statesVisited?: StateRecord[];
  timeline?: ExplorationStep[];
  onFocusIssue: (issue: AuditIssue) => void;
  onMarkerIssues: (issues: AuditIssue[]) => void;
  onScanAgain: () => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<(typeof CATEGORY_FILTERS)[number]>('all');
  const [markersVisible, setMarkersVisible] = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);

  const filteredIssues = useMemo(() => {
    if (categoryFilter === 'all') return props.issues;
    return props.issues.filter((issue) => issue.category === categoryFilter);
  }, [categoryFilter, props.issues]);

  const selectedIssue =
    filteredIssues.find((issue) => issue.id === props.selectedIssueId) ?? filteredIssues[0];
  const selectedIndex = selectedIssue ? filteredIssues.findIndex((i) => i.id === selectedIssue.id) : -1;

  useEffect(() => {
    props.onMarkerIssues(markersVisible ? filteredIssues : []);
  }, [filteredIssues, markersVisible, props.onMarkerIssues]);

  useEffect(() => {
    if (props.selectedIssueId) {
      document.getElementById('inspectra-selected-issue')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [props.selectedIssueId]);

  function navigateIssue(offset: number) {
    if (filteredIssues.length === 0) return;
    const nextIndex = (Math.max(selectedIndex, 0) + offset + filteredIssues.length) % filteredIssues.length;
    props.onFocusIssue(filteredIssues[nextIndex]);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary card */}
      <div className="in-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <p className="in-label">Audit Summary</p>
          <p
            className="in-caption max-w-[60%] truncate text-[11px]"
            title={`${props.providerName} · ${props.model}`}
          >
            {props.providerName} · <span className="font-mono">{props.model}</span>
          </p>
        </div>

        <p className="in-title mt-1 text-sm leading-relaxed">{props.summary}</p>

        {props.overall && props.overall !== props.summary && (
          <p className="in-body mt-2 border-t in-divider pt-2 text-[13px] leading-relaxed">
            {props.overall}
          </p>
        )}

        {/* Severity badges */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {(['critical', 'major', 'minor', 'suggestion'] as IssueSeverity[]).map((s) =>
            props.counts[s] ? (
              <span
                key={s}
                className="in-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[s]}`} />
                {severityLabel(s)}: {props.counts[s]}
              </span>
            ) : null,
          )}

          {props.totalIssues === 0 && (
            <span className="in-notice-ok rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-[var(--in-ok)]">
              ✓ Clean frontend: no meaningful defects found
            </span>
          )}
        </div>

        {/* Stats Row */}
        {props.statesVisited && props.statesVisited.length > 0 && (
          <div className="in-body mt-3 flex items-center justify-between border-t in-divider pt-2 text-[11px]">
            <span>
              States explored: <strong className="in-title">{props.statesVisited.length}</strong>
            </span>
            <span>
              Interactions tested: <strong className="in-title">{props.timeline?.length ?? 0}</strong>
            </span>
            <button
              onClick={() => setShowTimeline((t) => !t)}
              className="in-link text-[11px]"
            >
              {showTimeline ? 'Hide Timeline' : 'View Exploration'}
            </button>
          </div>
        )}
      </div>

      {/* Exploration Timeline Drawer */}
      {showTimeline && props.timeline && (
        <div className="in-card flex flex-col gap-2 rounded-2xl p-3.5">
          <div className="flex items-center justify-between">
            <h3 className="in-body text-xs font-bold uppercase tracking-wider">Exploration Timeline</h3>
            <span className="in-caption text-[11px]">{props.timeline.length} actions</span>
          </div>
          <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
            {props.timeline.map((step, idx) => (
              <div key={idx} className="in-muted-box flex items-start gap-2 rounded-lg p-2 text-xs">
                <span className="in-code mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase">
                  {step.action.action}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="in-title truncate">{step.description}</p>
                  <p className="in-caption font-mono text-[10px]">{step.stateId}</p>
                </div>
                <span className="in-caption">{step.result?.success ? '✓' : '•'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Severity Filter Tabs */}
      {props.totalIssues > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => props.setFilter(f)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                props.filter === f ? 'in-filter-active' : 'in-filter-idle'
              }`}
            >
              {f === 'all'
                ? `All (${props.totalIssues})`
                : `${severityLabel(f)}${props.counts[f] ? ` (${props.counts[f]})` : ''}`}
            </button>
          ))}
        </div>
      )}

      {/* Markers & Category Bar */}
      {props.totalIssues > 0 && (
        <div className="in-card flex flex-col gap-2 rounded-2xl p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="in-body text-xs font-semibold">
              {markersVisible
                ? `${filteredIssues.filter((i) => i.selector).length} mapped markers`
                : 'Markers hidden'}
            </span>
            <button
              onClick={() => setMarkersVisible((v) => !v)}
              className="in-btn-ghost px-2.5 py-1 text-[11px] font-semibold"
            >
              {markersVisible ? 'Hide Markers' : 'Show Markers'}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_FILTERS.map((category) => (
              <button
                key={category}
                onClick={() => setCategoryFilter(category)}
                className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${
                  categoryFilter === category ? 'in-filter-active' : 'in-chip-btn'
                }`}
              >
                {category === 'all' ? 'All categories' : category}
              </button>
            ))}
          </div>

          {/* Focused Issue Highlight */}
          {selectedIssue && (
            <div className="border-t in-divider pt-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="in-caption text-[11px] font-semibold">
                  Issue {selectedIndex + 1} of {filteredIssues.length}
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => navigateIssue(-1)}
                    className="in-btn-ghost px-2 py-0.5 text-xs"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => navigateIssue(1)}
                    className="in-btn-ghost px-2 py-0.5 text-xs"
                  >
                    Next →
                  </button>
                </div>
              </div>

              <div id="inspectra-selected-issue" className="in-notice-info rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <span className={`${SEVERITY_STYLE[selectedIssue.severity]}`}>
                    {severityLabel(selectedIssue.severity)}
                  </span>
                  <span className="in-caption text-[10px] font-semibold uppercase">
                    {selectedIssue.category}
                  </span>
                  <span className="in-caption ml-auto text-[10px] font-semibold">
                    {Math.round(selectedIssue.confidence * 100)}% conf
                  </span>
                </div>

                <h3 className="in-title mt-2 text-sm font-bold">
                  {selectedIssue.title || selectedIssue.problem}
                </h3>

                {selectedIssue.selector ? (
                  <p className="in-caption mt-1 break-all font-mono text-[10px]">{selectedIssue.selector}</p>
                ) : (
                  <p className="in-caption mt-1 text-[11px]">Visual observation (mapping unavailable)</p>
                )}

                <DetailField label="Evidence" value={selectedIssue.evidence} />
                {selectedIssue.rootCause && <DetailField label="Root Cause" value={selectedIssue.rootCause} />}
                {selectedIssue.whyItMatters && <DetailField label="User Impact" value={selectedIssue.whyItMatters} />}
                <DetailField label="Suggested Fix" value={selectedIssue.suggestedFix || selectedIssue.recommendedFix} />

                {selectedIssue.selector && (
                  <button
                    onClick={() => props.onFocusIssue(selectedIssue)}
                    className="in-btn-primary mt-3 px-3 py-1.5 text-xs"
                  >
                    Focus on Page
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Issues List */}
      <div className="flex flex-col gap-2">
        {filteredIssues.map((issue, i) => (
          <IssueCard key={issue.id || i} issue={issue} index={i} onSelect={() => props.onFocusIssue(issue)} />
        ))}

        {props.totalIssues > 0 && filteredIssues.length === 0 && (
          <p className="in-caption rounded-xl border border-dashed in-divider p-4 text-center text-xs">
            No issues match these filters.
          </p>
        )}
      </div>

      {/* Cleanup Suggestions */}
      {props.cleanup.length > 0 && (
        <div className="rounded-xl p-4" style={{ border: '1px solid rgba(167,139,250,0.35)', background: 'rgba(167,139,250,0.06)' }}>
          <p className="text-sm font-bold text-[#c4b0f7]">Potential Cleanup Candidates</p>
          <p className="text-xs text-[#9d8bd4]">Verify business purpose before removing.</p>
          <div className="mt-2 flex flex-col gap-2">
            {props.cleanup.map((c) => (
              <div key={c.id} className="in-card rounded-lg p-3">
                <p className="font-mono text-[11px] text-[#c4b0f7]">{c.element}</p>
                <p className="in-body mt-1 text-[13px]">{c.reason}</p>
                <p className="in-caption mt-1 text-[13px]">{c.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Copy-Ready AI Fix Prompt */}
      <PromptView prompt={props.prompt} onScanAgain={props.onScanAgain} />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2">
      <p className="in-caption text-[10px] font-bold uppercase tracking-wide">{label}</p>
      <p className="in-body mt-0.5 text-xs leading-relaxed">{value}</p>
    </div>
  );
}

/* ── Error View ──────────────────────────────────────────────────────────── */

function ErrorView({
  error,
  scannable,
  onRetry,
  onSettings,
}: {
  error: ScanError;
  scannable: boolean;
  onRetry: () => void;
  onSettings: () => void;
}) {
  const isBlocker = error.kind === 'blockers';
  return (
    <div className="in-card rounded-2xl p-5 text-center">
      <p className="text-2xl">⚠️</p>
      <h2 className="in-title mt-1 text-sm font-bold">Audit Didn't Complete</h2>

      {error.kind === 'message' && (
        <p className="in-body mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed">{error.message}</p>
      )}

      {error.kind === 'blockers' && (
        <div className="mx-auto mt-1.5 max-w-xs">
          {error.blockers.map((b) => (
            <p key={b} className="in-title text-[13px] font-medium leading-relaxed">
              {b}
            </p>
          ))}
          <p className="in-caption mt-1 text-xs">
            {error.hasProviders
              ? 'Please open Settings and complete the configuration.'
              : 'Please configure an AI provider and model before starting an audit.'}
          </p>
        </div>
      )}

      {error.kind === 'ai' && (
        <div className="in-well mx-auto mt-2 max-w-xs rounded-xl p-3 text-left">
          <p className="in-caption text-xs">
            Provider: <span className="in-title font-semibold">{error.info.providerName}</span>
          </p>
          <p className="in-caption mt-0.5 font-mono text-xs">
            Model: <span className="in-title font-semibold">{error.info.model || '(none)'}</span>
          </p>
          <p className="in-title mt-2 text-[13px] font-medium leading-relaxed">Error: {error.info.reason}</p>
          <p className="in-caption mt-2 text-xs font-semibold uppercase tracking-wide">Possible solutions</p>
          <ul className="in-body mt-1 list-disc pl-4 text-left text-xs leading-relaxed">
            {error.info.solutions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {isBlocker || error.kind === 'ai' ? (
          <>
            <button
              onClick={onSettings}
              className="in-btn-primary flex-1 px-4 py-2.5 text-sm"
            >
              Open Settings
            </button>
            {error.kind === 'ai' && (
              <button
                onClick={onRetry}
                disabled={!scannable}
                className="in-btn-ghost px-4 py-2.5 text-sm font-medium"
              >
                Retry
              </button>
            )}
          </>
        ) : (
          <button
            onClick={onRetry}
            disabled={!scannable}
            className="in-btn-primary flex-1 px-4 py-2.5 text-sm"
          >
            Try Again
          </button>
        )}
      </div>

      {!scannable && (
        <p className="mt-2 text-xs text-[var(--in-warn)]">This page cannot be scanned by Chrome extensions.</p>
      )}
    </div>
  );
}
