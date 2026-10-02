import { AI_STORE_KEY, LEGACY_SETTINGS_KEY } from '../shared/constants';
import type { AIProviderConfig, AIStore } from '../shared/types';

const EMPTY: AIStore = { providers: [], activeId: null, includeScreenshot: true };

export function newProviderId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function defaultEndpointForProvider(name: string, format: AIProviderConfig['format']): string {
  if (format === 'gemini-native') return '';
  const normalized = name.toLowerCase();
  if (normalized.includes('openrouter')) return 'https://openrouter.ai/api/v1';
  if (normalized.includes('openai')) return 'https://api.openai.com/v1';
  return '';
}

function sanitizeProvider(raw: unknown): AIProviderConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const format = r.format === 'gemini-native' || r.format === 'custom' ? r.format : 'openai-compatible';
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const name = str(r.name).slice(0, 80);
  const endpoint = str(r.endpoint).trim().slice(0, 500) || defaultEndpointForProvider(name, format);
  return {
    id: str(r.id) || newProviderId(),
    name,
    format,
    endpoint,
    apiKey: str(r.apiKey),
    model: str(r.model).trim().slice(0, 200),
  };
}

function sanitizeStore(raw: unknown): AIStore {
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY, providers: [] };
  const r = raw as Record<string, unknown>;
  const providers = Array.isArray(r.providers)
    ? r.providers.map(sanitizeProvider).filter((p): p is AIProviderConfig => p !== null)
    : [];
  const activeId =
    typeof r.activeId === 'string' && providers.some((p) => p.id === r.activeId)
      ? r.activeId
      : (providers[0]?.id ?? null);
  return {
    providers,
    activeId,
    includeScreenshot: r.includeScreenshot === false ? false : true,
  };
}

interface LegacySettings {
  provider?: unknown;
  apiKey?: unknown;
  model?: unknown;
  includeScreenshot?: unknown;
}

/** One-time migration from the V1 single-provider settings. */
async function migrateLegacy(): Promise<AIStore | null> {
  try {
    const raw = await chrome.storage.local.get(LEGACY_SETTINGS_KEY);
    const legacy = (raw?.[LEGACY_SETTINGS_KEY] ?? null) as LegacySettings | null;
    if (!legacy || typeof legacy !== 'object') return null;
    const apiKey = typeof legacy.apiKey === 'string' ? legacy.apiKey : '';
    const model = typeof legacy.model === 'string' ? legacy.model : '';
    if (!apiKey && !model) return null;
    const wasOpenAI = legacy.provider === 'openai';
    // Restore the user's own previous endpoint — not a default for new
    // providers (those always start with an empty endpoint field).
    const migrated: AIProviderConfig = {
      id: newProviderId(),
      name: wasOpenAI ? 'OpenAI (migrated)' : 'Gemini (migrated)',
      format: wasOpenAI ? 'openai-compatible' : 'gemini-native',
      endpoint: wasOpenAI ? 'https://api.openai.com/v1' : '',
      apiKey,
      model,
    };
    const store: AIStore = {
      providers: [migrated],
      activeId: migrated.id,
      includeScreenshot: legacy.includeScreenshot === false ? false : true,
    };
    await chrome.storage.local.set({ [AI_STORE_KEY]: store });
    return store;
  } catch {
    return null;
  }
}

export async function loadAIStore(): Promise<AIStore> {
  try {
    const raw = await chrome.storage.local.get(AI_STORE_KEY);
    const stored = raw?.[AI_STORE_KEY];
    if (stored === undefined) {
      // First run with the new system — try migrating V1 settings.
      return (await migrateLegacy()) ?? { ...EMPTY, providers: [] };
    }
    return sanitizeStore(stored);
  } catch {
    return { ...EMPTY, providers: [] };
  }
}

async function persist(store: AIStore): Promise<AIStore> {
  const clean = sanitizeStore(store);
  await chrome.storage.local.set({ [AI_STORE_KEY]: clean });
  return clean;
}

export async function saveProvider(config: AIProviderConfig): Promise<AIStore> {
  const store = await loadAIStore();
  const clean = sanitizeProvider(config);
  if (!clean) throw new Error('Invalid provider configuration.');
  const idx = store.providers.findIndex((p) => p.id === clean.id);
  const providers = [...store.providers];
  if (idx >= 0) providers[idx] = clean;
  else providers.push(clean);
  return persist({
    ...store,
    providers,
    activeId: store.activeId ?? clean.id,
  });
}

export async function deleteProvider(id: string): Promise<AIStore> {
  const store = await loadAIStore();
  const providers = store.providers.filter((p) => p.id !== id);
  return persist({
    ...store,
    providers,
    activeId: store.activeId === id ? (providers[0]?.id ?? null) : store.activeId,
  });
}

export async function setActiveProvider(id: string | null): Promise<AIStore> {
  const store = await loadAIStore();
  if (id !== null && !store.providers.some((p) => p.id === id)) {
    throw new Error('Unknown provider.');
  }
  return persist({ ...store, activeId: id });
}

export async function setIncludeScreenshot(value: boolean): Promise<AIStore> {
  const store = await loadAIStore();
  return persist({ ...store, includeScreenshot: value });
}

export async function clearProviderKey(id: string): Promise<AIStore> {
  const store = await loadAIStore();
  const providers = store.providers.map((p) => (p.id === id ? { ...p, apiKey: '' } : p));
  return persist({ ...store, providers });
}

export function getActiveProvider(store: AIStore): AIProviderConfig | null {
  return store.providers.find((p) => p.id === store.activeId) ?? null;
}

/** Exact gaps blocking a scan — surfaced verbatim so the UI can name them. */
export function scanBlockers(config: AIProviderConfig | null): string[] {
  if (!config) return ['No AI provider is configured.'];
  const missing: string[] = [];
  if (!config.name.trim()) missing.push('Provider name is not set.');
  if (!config.model.trim()) missing.push('No AI model is configured.');
  if (config.format !== 'gemini-native' && !config.endpoint.trim()) {
    missing.push('API endpoint is not configured.');
  }
  if (requiresKey(config) && !config.apiKey) missing.push('API key is not configured.');
  return missing;
}

/** Local servers (e.g. Ollama) often accept an empty key; cloud APIs need one. */
export function requiresKey(config: AIProviderConfig): boolean {
  if (config.format === 'gemini-native') return true;
  try {
    const host = new URL(config.endpoint).hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return false;
  } catch {
    /* unparseable endpoint — validated separately */
  }
  return true;
}

export function maskKey(key: string): string {
  if (!key) return '';
  return '••••••••••••';
}
