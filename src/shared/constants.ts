import type { AIAdapterFormat } from './types';

export const AI_STORE_KEY = 'inspectra.ai.v2';
/** Previous single-provider settings, read once for migration. */
export const LEGACY_SETTINGS_KEY = 'inspectra.settings.v1';

export const MAX_ELEMENTS = 220;
export const MAX_TEXT_LEN = 160;

export const FORMAT_LABELS: Record<AIAdapterFormat, string> = {
  'openai-compatible': 'OpenAI Compatible',
  'gemini-native': 'Gemini Native',
  custom: 'Custom',
};

export const FORMAT_HINTS: Record<AIAdapterFormat, string> = {
  'openai-compatible':
    'Works with OpenAI-style providers and compatible APIs.',
  'gemini-native':
    'Uses Google Gemini’s native API format.',
  custom:
    'Use a custom endpoint only when your provider is not one of the built-in options.',
};

/** Placeholder examples only — never prefilled, never sent. */
export const ENDPOINT_PLACEHOLDERS: Record<AIAdapterFormat, string> = {
  'openai-compatible': 'https://…/v1  (your provider base URL)',
  'gemini-native': '(optional — leave empty for the standard API base)',
  custom: 'https://…  (your custom API base URL)',
};
