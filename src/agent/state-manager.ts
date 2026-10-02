// State Manager: tracks distinct UI states visited during exploration (Section 16 & 17).
// Prevents infinite loops on repeated states and manages exploration history.

import type { CompactPageState, StateRecord } from '../shared/types';

export class StateManager {
  private states: StateRecord[] = [];
  private visitedFingerprints = new Map<string, number>(); // fingerprint -> visit count
  private consecutiveRepeats = 0;

  /**
   * Resets the state manager for a new exploration run.
   */
  reset(): void {
    this.states = [];
    this.visitedFingerprints.clear();
    this.consecutiveRepeats = 0;
  }

  /**
   * Derives a friendly title for a state from page observation and triggering action.
   */
  deriveStateTitle(state: CompactPageState, triggeringAction?: string): string {
    if (this.states.length === 0) {
      return state.title ? `${state.title} (Initial)` : 'Initial Page';
    }

    if (state.activeModalsOrDialogs.length > 0) {
      return `Modal / Dialog (${state.activeModalsOrDialogs[0]})`;
    }

    if (state.openMenus.length > 0) {
      return 'Expanded Menu / Dropdown';
    }

    if (triggeringAction?.toLowerCase().includes('scroll')) {
      return `Scrolled Page (Y=${state.scrollPosition.y})`;
    }

    if (triggeringAction?.toLowerCase().includes('click')) {
      return 'Interacted View';
    }

    return `State ${this.states.length + 1}`;
  }

  /**
   * Registers a new state and returns the StateRecord.
   */
  recordState(pageState: CompactPageState, triggeringAction?: string, screenshotRef?: string): {
    record: StateRecord;
    isNewState: boolean;
    consecutiveRepeatCount: number;
  } {
    const fingerprint = pageState.stateFingerprint;
    const previousVisitCount = this.visitedFingerprints.get(fingerprint) ?? 0;
    const isNewState = previousVisitCount === 0;

    // Check consecutive repeat
    const lastState = this.states[this.states.length - 1];
    if (lastState && lastState.fingerprint === fingerprint) {
      this.consecutiveRepeats += 1;
    } else {
      this.consecutiveRepeats = 0;
    }

    this.visitedFingerprints.set(fingerprint, previousVisitCount + 1);

    const stateNumber = this.states.length + 1;
    const stateId = `STATE-${String(stateNumber).padStart(2, '0')}`;
    const title = this.deriveStateTitle(pageState, triggeringAction);

    const record: StateRecord = {
      stateId,
      title,
      url: pageState.url,
      viewport: pageState.viewport,
      scrollPosition: pageState.scrollPosition.y,
      triggeringAction,
      timestamp: new Date().toISOString(),
      fingerprint,
      screenshotRef,
    };

    this.states.push(record);

    return {
      record,
      isNewState,
      consecutiveRepeatCount: this.consecutiveRepeats,
    };
  }

  /**
   * Returns whether the agent has entered an unmoving loop (e.g. 3 consecutive identical states).
   */
  isStuckInLoop(): boolean {
    return this.consecutiveRepeats >= 3;
  }

  getAllStates(): StateRecord[] {
    return [...this.states];
  }

  getCurrentState(): StateRecord | null {
    return this.states.length > 0 ? this.states[this.states.length - 1] : null;
  }

  getDistinctStateCount(): number {
    return this.visitedFingerprints.size;
  }
}
