import { useEffect, useMemo, useState } from 'react';
import Settings from '../settings/Settings';
import type { AuditIssue, ExplorationStep, IssueCategory, IssueSeverity, StateRecord } from '../shared/types';
import AgentExploringView from './components/AgentExploringView';
import IssueCard from './components/IssueCard';
import ProgressSteps from './components/ProgressSteps';
import PromptView from './components/PromptView';
import { SEVERITY_DOT, severityLabel } from './components/severity';
import { useScan, type AIStatus, type ScanError } from './hooks/useScan';

type View = 'main' | 'settings';

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

  const busy = ['reading', 'inspecting', 'layout', 'responsive', 'visual', 'analyzing'].includes(stage);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
              In
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight">Inspectra</h1>
              <p className="text-[11px] leading-tight text-slate-500">Autonomous Frontend Audit Agent</p>
            </div>
          </div>
          <button
            onClick={() => setView((v) => (v === 'settings' ? 'main' : 'settings'))}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
            aria-label="Settings"
          >
            {view === 'settings' ? '← Back' : '⚙ Settings'}
          </button>
        </div>
        {domain && (
          <p className="mt-1.5 truncate text-xs text-slate-500">
            Target: <span className="font-medium text-slate-700">{domain}</span>
          </p>
        )}
      </header>

      <main className="flex flex-1 flex-col gap-3 p-4">
        {view === 'settings' ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
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

      <footer className="border-t border-slate-200 px-4 py-2">
        <p className="text-center text-[11px] text-slate-400">
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
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Frontend AI Auditor</h2>
        <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-slate-500">
          Autonomous browser agent that explores, tests, and audits your live frontend, then generates a complete fix prompt.
        </p>
        {domain && (
          <p className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-slate-600">
            {domain}
          </p>
        )}

        {/* Active AI selector */}
        {aiStatus.kind === 'ready' && (
          <div className="mx-auto mt-3 max-w-xs text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Active AI Model</p>
            {aiStatus.all.length > 1 ? (
              <select
                value={aiStatus.active.id}
                onChange={(e) => onSwitch(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
                aria-label="Active AI provider"
              >
                {aiStatus.all.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.model})
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 truncate text-xs font-medium text-slate-700">
                {aiStatus.active.name} — <span className="font-mono">{aiStatus.active.model}</span>
              </p>
            )}
          </div>
        )}

        {/* Primary Agent Action */}
        <button
          onClick={onStartAgent}
          disabled={!scannable || aiStatus.kind !== 'ready'}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <span>🤖</span>
          <span>Start Autonomous Agent Audit</span>
        </button>

        {/* Secondary Quick Scan Action */}
        <button
          onClick={onQuickScan}
          disabled={!scannable || aiStatus.kind !== 'ready'}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          Run Quick Single-Viewport Scan
        </button>

        {!scannable && (
          <p className="mt-2 text-xs leading-relaxed text-amber-600">
            This page cannot be scanned by Chrome extensions.
          </p>
        )}
      </div>

      {scannable && aiStatus.kind === 'none' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm font-medium text-amber-800">No AI provider configured.</p>
          <button
            onClick={onSettings}
            className="mt-2 rounded-lg border border-amber-300 bg-white px-4 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            Configure AI Provider
          </button>
        </div>
      )}

      {scannable && aiStatus.kind === 'incomplete' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          {aiStatus.blockers.map((b) => (
            <p key={b} className="text-sm font-medium text-amber-800">
              {b}
            </p>
          ))}
          <p className="mt-1 text-xs text-amber-700">Please open Settings and complete the configuration.</p>
          <button
            onClick={onSettings}
            className="mt-2 rounded-lg border border-amber-300 bg-white px-4 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
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
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Audit Summary</p>
          <p
            className="max-w-[60%] truncate text-[11px] text-slate-400"
            title={`${props.providerName} · ${props.model}`}
          >
            {props.providerName} · <span className="font-mono">{props.model}</span>
          </p>
        </div>

        <p className="mt-1 text-sm leading-relaxed text-slate-800">{props.summary}</p>

        {props.overall && props.overall !== props.summary && (
          <p className="mt-2 border-t border-slate-100 pt-2 text-[13px] leading-relaxed text-slate-600">
            {props.overall}
          </p>
        )}

        {/* Severity badges */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {(['critical', 'major', 'minor', 'suggestion'] as IssueSeverity[]).map((s) =>
            props.counts[s] ? (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[s]}`} />
                {severityLabel(s)}: {props.counts[s]}
              </span>
            ) : null,
          )}

          {props.totalIssues === 0 && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              ✓ Clean frontend: no meaningful defects found
            </span>
          )}
        </div>

        {/* Stats Row */}
        {props.statesVisited && props.statesVisited.length > 0 && (
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
            <span>
              States explored: <strong>{props.statesVisited.length}</strong>
            </span>
            <span>
              Interactions tested: <strong>{props.timeline?.length ?? 0}</strong>
            </span>
            <button
              onClick={() => setShowTimeline((t) => !t)}
              className="font-medium text-indigo-600 hover:text-indigo-800"
            >
              {showTimeline ? 'Hide Timeline' : 'View Exploration'}
            </button>
          </div>
        )}
      </div>

      {/* Exploration Timeline Drawer */}
      {showTimeline && props.timeline && (
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Exploration Timeline</h3>
            <span className="text-[11px] text-slate-400">{props.timeline.length} actions</span>
          </div>
          <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
            {props.timeline.map((step, idx) => (
              <div key={idx} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-xs">
                <span className="mt-0.5 shrink-0 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[9px] font-bold">
                  {step.action.action}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-800">{step.description}</p>
                  <p className="font-mono text-[10px] text-slate-400">{step.stateId}</p>
                </div>
                <span>{step.result?.success ? '✓' : '•'}</span>
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
                props.filter === f
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-900'
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
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              {markersVisible
                ? `${filteredIssues.filter((i) => i.selector).length} mapped markers`
                : 'Markers hidden'}
            </span>
            <button
              onClick={() => setMarkersVisible((v) => !v)}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-300"
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
                  categoryFilter === category
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {category === 'all' ? 'All categories' : category}
              </button>
            ))}
          </div>

          {/* Focused Issue Highlight */}
          {selectedIssue && (
            <div className="border-t border-slate-100 pt-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">
                  Issue {selectedIndex + 1} of {filteredIssues.length}
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => navigateIssue(-1)}
                    className="rounded border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-50"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => navigateIssue(1)}
                    className="rounded border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-50"
                  >
                    Next →
                  </button>
                </div>
              </div>

              <div id="inspectra-selected-issue" className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                    {severityLabel(selectedIssue.severity)}
                  </span>
                  <span className="text-[10px] font-semibold uppercase text-slate-500">
                    {selectedIssue.category}
                  </span>
                  <span className="ml-auto text-[10px] font-semibold text-slate-500">
                    {Math.round(selectedIssue.confidence * 100)}% conf
                  </span>
                </div>

                <h3 className="mt-2 text-sm font-bold text-slate-900">
                  {selectedIssue.title || selectedIssue.problem}
                </h3>

                {selectedIssue.selector ? (
                  <p className="mt-1 break-all font-mono text-[10px] text-slate-500">{selectedIssue.selector}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500">Visual observation (mapping unavailable)</p>
                )}

                <DetailField label="Evidence" value={selectedIssue.evidence} />
                {selectedIssue.rootCause && <DetailField label="Root Cause" value={selectedIssue.rootCause} />}
                {selectedIssue.whyItMatters && <DetailField label="User Impact" value={selectedIssue.whyItMatters} />}
                <DetailField label="Suggested Fix" value={selectedIssue.suggestedFix || selectedIssue.recommendedFix} />

                {selectedIssue.selector && (
                  <button
                    onClick={() => props.onFocusIssue(selectedIssue)}
                    className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
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
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
            No issues match these filters.
          </p>
        )}
      </div>

      {/* Cleanup Suggestions */}
      {props.cleanup.length > 0 && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
          <p className="text-sm font-bold text-purple-900">Potential Cleanup Candidates</p>
          <p className="text-xs text-purple-700/80">Verify business purpose before removing.</p>
          <div className="mt-2 flex flex-col gap-2">
            {props.cleanup.map((c) => (
              <div key={c.id} className="rounded-lg bg-white p-3 ring-1 ring-purple-100">
                <p className="font-mono text-[11px] text-purple-800">{c.element}</p>
                <p className="mt-1 text-[13px] text-slate-700">{c.reason}</p>
                <p className="mt-1 text-[13px] text-slate-500">{c.recommendation}</p>
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
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{value}</p>
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
    <div className="rounded-2xl border border-red-200 bg-white p-5 text-center shadow-sm">
      <p className="text-2xl">⚠️</p>
      <h2 className="mt-1 text-sm font-bold text-slate-900">Audit Didn't Complete</h2>

      {error.kind === 'message' && (
        <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-slate-600">{error.message}</p>
      )}

      {error.kind === 'blockers' && (
        <div className="mx-auto mt-1.5 max-w-xs">
          {error.blockers.map((b) => (
            <p key={b} className="text-[13px] font-medium leading-relaxed text-slate-700">
              {b}
            </p>
          ))}
          <p className="mt-1 text-xs text-slate-500">
            {error.hasProviders
              ? 'Please open Settings and complete the configuration.'
              : 'Please configure an AI provider and model before starting an audit.'}
          </p>
        </div>
      )}

      {error.kind === 'ai' && (
        <div className="mx-auto mt-2 max-w-xs rounded-xl bg-slate-50 p-3 text-left">
          <p className="text-xs text-slate-500">
            Provider: <span className="font-semibold text-slate-800">{error.info.providerName}</span>
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">
            Model: <span className="font-semibold text-slate-800">{error.info.model || '(none)'}</span>
          </p>
          <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-800">Error: {error.info.reason}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Possible solutions</p>
          <ul className="mt-1 list-disc pl-4 text-left text-xs leading-relaxed text-slate-600">
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
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Open Settings
            </button>
            {error.kind === 'ai' && (
              <button
                onClick={onRetry}
                disabled={!scannable}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:border-slate-300 disabled:bg-slate-100"
              >
                Retry
              </button>
            )}
          </>
        ) : (
          <button
            onClick={onRetry}
            disabled={!scannable}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            Try Again
          </button>
        )}
      </div>

      {!scannable && (
        <p className="mt-2 text-xs text-amber-600">This page cannot be scanned by Chrome extensions.</p>
      )}
    </div>
  );
}
