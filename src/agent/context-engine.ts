// Context Engine: normalizes, filters, and compacts raw browser evidence
// before sending to the AI model. Reduces token bloat, latency, and hallucinations (Section 13).

import type {
  AgentDecisionContext,
  BrowserAction,
  CompactElement,
  CompactPageState,
  ExplorationStep,
} from '../shared/types';

export const AGENT_SYSTEM_PROMPT = `You are Inspectra — an autonomous AI frontend auditor and browser exploration agent.
Your mission is to explore, interact with, test, and audit a live website like a senior frontend engineer, UI/UX specialist, and accessibility reviewer.

RESPONSIBILITIES:
- You control the browser by requesting ONE tool action per step.
- Explore meaningful interactive states: navigation, dropdowns, tabs, modals, mobile menus, accordions, filters, primary CTAs.
- Prioritize meaningful UI interactions. DO NOT click every link or redundant buttons.
- NEVER perform destructive or sensitive actions (payments, account deletion, password changes, sensitive form submission).
- NEVER hallucinate: base every issue on actual observed DOM/CSS/layout evidence.
- Distinguish FACT from PROBLEM from SUGGESTION. Do not call personal preferences "bugs".
- If you observe an issue, use the "MARK_ISSUE" action with concrete evidence, confidence (0.0 to 1.0), and root cause.
- When sufficient exploration has occurred or budget is low, return "FINISH_AUDIT".

SUPPORTED TOOL ACTIONS (Strict Schema):
1. {"action": "SCROLL", "direction": "down"|"up"|"top"|"bottom", "amount": 650}
2. {"action": "CLICK", "target": {"selector": "...", "role": "button", "name": "..."}}
3. {"action": "HOVER", "target": {"selector": "..."}}
4. {"action": "FOCUS", "target": {"selector": "..."}}
5. {"action": "WAIT", "duration": 1000}
6. {"action": "GET_ELEMENT_INFO", "target": {"selector": "..."}}
7. {"action": "INSPECT_STATE", "name": "state description"}
8. {"action": "MARK_ISSUE", "issue": {
     "title": "Concise title",
     "category": "layout|spacing|responsive|visual|color|contrast|typography|ux|interaction|components|accessibility|cleanup",
     "severity": "critical|major|minor|suggestion",
     "problem": "Clear problem description",
     "evidence": "Observed DOM/CSS/layout measurements or state evidence",
     "whyItMatters": "Specific user impact",
     "rootCause": "Container overflow, missing media query, fixed width, etc.",
     "suggestedFix": "Precise frontend code/CSS fix",
     "confidence": 0.95,
     "selector": "exact selector if mapped, or target object"
   }}
9. {"action": "FINISH_AUDIT", "summary": "2-3 sentence overview", "overallAssessment": "Assessment of findings"}

OUTPUT FORMAT:
Return ONLY a valid JSON object with:
{
  "thought": "1 sentence describing your reasoning and what you are testing next",
  "action": { ...one of the supported actions above... }
}`;

/**
 * Builds the compact decision prompt sent to the AI for each exploration step.
 */
export function buildAgentDecisionPrompt(context: AgentDecisionContext): string {
  const { currentState, previousSteps, detectedIssues, stepNumber, maxSteps, clicksRemaining, scrollsRemaining } = context;

  const stepsSummary = previousSteps.length > 0
    ? previousSteps.slice(-6).map((s) => `- Step ${s.stepNumber}: ${s.description} → ${s.result?.success ? 'Success' : `Failed (${s.result?.reason ?? 'error'})`}`).join('\n')
    : '- (Initial step - start exploration)';

  const issuesSummary = detectedIssues.length > 0
    ? detectedIssues.map((i) => `- [${i.severity.toUpperCase()}] ${i.title} (${i.selector || i.element}) - conf: ${Math.round(i.confidence * 100)}%`).join('\n')
    : '- None detected yet.';

  const candidatesList = currentState.interactableCandidates.slice(0, 18).map((c, i) => {
    const nameStr = c.name ? ` "${c.name.slice(0, 45)}"` : '';
    const rectStr = `${c.rect.width}x${c.rect.height}@(${c.rect.x},${c.rect.y})`;
    return `${i + 1}. [${c.priorityCategory ?? 'other'}] <${c.tag}> ${c.selector}${nameStr} (${rectStr})`;
  }).join('\n');

  const signalsList = currentState.layoutIssuesSummary.length > 0
    ? currentState.layoutIssuesSummary.slice(0, 8).join('\n')
    : '- No obvious automated layout signals at this scroll position.';

  return `EXPLORATION STEP: ${stepNumber} / ${maxSteps} (Clicks remaining: ${clicksRemaining}, Scrolls remaining: ${scrollsRemaining})

CURRENT PAGE:
- URL: ${currentState.url}
- Title: "${currentState.title}"
- Viewport: ${currentState.viewport.width}x${currentState.viewport.height}
- Scroll Position: Y=${currentState.scrollPosition.y} / max=${currentState.scrollPosition.maxScrollY}
- Open Modals: ${currentState.activeModalsOrDialogs.length > 0 ? currentState.activeModalsOrDialogs.join(', ') : 'none'}
- Open Menus: ${currentState.openMenus.length > 0 ? currentState.openMenus.join(', ') : 'none'}
- Responsive Flags: overflowX=${currentState.responsiveSignals.hasHorizontalOverflow} (${currentState.responsiveSignals.overflowPx}px), fixedWidthElements=${currentState.responsiveSignals.fixedWidthElementsCount}

LAYOUT / RESPONSIVE SIGNALS OBSERVED:
${signalsList}

RECENT ACTIONS TAKEN:
${stepsSummary}

ISSUES MARKED SO FAR (${detectedIssues.length}):
${issuesSummary}

PRIORITY INTERACTION CANDIDATES IN CURRENT VIEW:
${candidatesList || '- No interactive candidates found in current viewport.'}

YOUR TASK:
Decide the next action to explore, test, inspect an interaction, mark an issue, or finish the audit.
Return ONLY a JSON object: {"thought": "...", "action": { ... }}.`;
}

/**
 * Normalizes action text into a concise human-readable description for UI display (Section 19 & 44).
 */
export function describeActionForUser(action: BrowserAction | { action: string; [key: string]: unknown }): string {
  const act = action as Record<string, unknown>;
  switch (action.action) {
    case 'SCROLL': {
      const dir = (act.direction as string) || 'down';
      const amount = act.amount ? `${act.amount}px` : '';
      return `Scrolling ${dir} ${amount}...`.trim();
    }
    case 'CLICK': {
      const target = (act.target as Record<string, string>) || {};
      const name = target.name || target.text || target.role || target.selector || 'element';
      return `Clicking "${name}"...`;
    }
    case 'HOVER': {
      const target = (act.target as Record<string, string>) || {};
      const name = target.name || target.selector || 'element';
      return `Hovering over "${name}"...`;
    }
    case 'FOCUS': {
      const target = (act.target as Record<string, string>) || {};
      const name = target.name || target.selector || 'element';
      return `Focusing "${name}"...`;
    }
    case 'WAIT': {
      return `Waiting for UI stability...`;
    }
    case 'GET_ELEMENT_INFO': {
      const target = (act.target as Record<string, string>) || {};
      return `Inspecting element details for ${target.selector || 'element'}...`;
    }
    case 'INSPECT_STATE': {
      const name = (act.name as string) || 'current UI state';
      return `Inspecting ${name}...`;
    }
    case 'MARK_ISSUE': {
      const issue = (act.issue as Record<string, string>) || {};
      return `Marking issue: ${issue.title || issue.problem || 'frontend issue'}...`;
    }
    case 'FINISH_AUDIT': {
      return `Audit complete. Synthesizing final findings...`;
    }
    case 'SCREENSHOT': {
      return `Capturing visual evidence...`;
    }
    default: {
      return `Observing page...`;
    }
  }
}
