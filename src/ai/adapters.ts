import { generateFixPrompt } from './prompt-generator';
import { AUDIT_SYSTEM_PROMPT, buildAuditUserPrompt } from './analyzer';
import { AGENT_SYSTEM_PROMPT, buildAgentDecisionPrompt } from '../agent/context-engine';
import { extractJson, validateAuditResult } from './schemas';
import type {
  AIAdapterFormat,
  AIProviderConfig,
  AgentDecision,
  AgentDecisionContext,
  AuditResult,
  BrowserAction,
  ExplorationStep,
  StateRecord,
  WebsiteAnalysis,
} from '../shared/types';

// ── Errors ──────────────────────────────────────────────────────────────────
// AuditError carries structured context so the UI can explain failures
// without ever exposing the API key.

export interface AuditErrorDetails {
  providerName: string;
  model: string;
  endpoint: string;
  reason: string;
  solutions: string[];
  status?: number;
  retryable: boolean;
}

export class AuditError extends Error {
  readonly details: AuditErrorDetails;
  constructor(details: AuditErrorDetails) {
    super(details.reason);
    this.name = 'AuditError';
    this.details = details;
  }
}

export class ConfigError extends Error {
  readonly blockers: string[];
  constructor(blockers: string[]) {
    super(blockers[0] ?? 'Provider configuration is incomplete.');
    this.name = 'ConfigError';
    this.blockers = blockers;
  }
}

/** Strips anything that could leak the key from provider-supplied text. */
export function sanitize(text: string, config: AIProviderConfig): string {
  let out = text;
  if (config.apiKey) out = out.split(config.apiKey).join('••••');
  // Redact key=… query fragments some proxies echo back.
  out = out.replace(/([?&]key=)[^&\s"']+/gi, '$1••••');
  out = out.replace(/(Bearer\s+)[^\s"']+/gi, '$1••••');
  return out.slice(0, 600);
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

async function fetchWithRetry(
  config: AIProviderConfig,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const t = withTimeout(timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: t.signal });
      if (res.ok) return res;
      if (!shouldRetryStatus(res.status)) {
        const text = await res.text().catch(() => '');
        throw classifyHttpError(config, res.status, text);
      }
      lastError = classifyHttpError(config, res.status, await res.text().catch(() => ''));
      if (attempt < 2) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw lastError;
    } catch (error) {
      if (error instanceof AuditError && !error.details.retryable) throw error;
      if (error instanceof AuditError && attempt === 2) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        const network = connectionError(config, error);
        if (attempt === 2) throw network;
        lastError = network;
      } else {
        lastError = error;
      }
      if (attempt < 2) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (lastError instanceof AuditError) throw lastError;
      if (lastError instanceof Error) throw connectionError(config, lastError);
      throw new AuditError({
        providerName: config.name,
        model: config.model,
        endpoint: endpointHost(config),
        reason: 'Insufficient provider response. Try again shortly.',
        solutions: ['Check your connection and provider status.', 'Try again in a moment.'],
        retryable: true,
      });
    } finally {
      t.done();
    }
  }
  throw lastError instanceof Error ? connectionError(config, lastError) : new AuditError({
    providerName: config.name,
    model: config.model,
    endpoint: endpointHost(config),
    reason: 'Inspectra could not reach the AI provider.',
    solutions: ['Check your internet connection.', 'Verify the provider endpoint and API key.'],
    retryable: true,
  });
}

function endpointHost(config: AIProviderConfig): string {
  try {
    return new URL(config.endpoint).host || config.endpoint;
  } catch {
    return config.endpoint || '(no endpoint configured)';
  }
}

function connectionError(config: AIProviderConfig, cause: unknown): AuditError {
  void cause;
  const host = endpointHost(config);
  const local = /localhost|127\.0\.0\.1|\[::1\]/.test(host);
  return new AuditError({
    providerName: config.name,
    model: config.model,
    endpoint: host,
    reason: "Inspectra couldn't reach the AI provider. Check your internet connection or provider endpoint.",
    solutions: local
      ? [
          'Make sure the local server is running.',
          'Check that the endpoint URL and port are correct.',
          'Allow local requests through the browser and server configuration.',
        ]
      : [
          'Check that the endpoint URL is correct.',
          'Verify your network connection.',
          'Try again in a moment. The provider may be temporarily unavailable.',
        ],
    retryable: true,
  });
}

function classifyHttpError(
  config: AIProviderConfig,
  status: number,
  rawBody: string,
): AuditError {
  const body = sanitize(rawBody, config);
  const base = {
    providerName: config.name,
    model: config.model,
    endpoint: endpointHost(config),
    status,
  };
  const lower = rawBody.toLowerCase();
  const mentionsModel = /model[^]{0,40}(not found|not_found|does not exist|unavailable|invalid|unknown)|model_not_found/.test(
    lower,
  );

  if (status === 401 || status === 403) {
    return new AuditError({
      ...base,
      reason: 'Your API key was rejected. Check your API key and try again.',
      solutions: [
        'Verify the API key in Settings.',
        'Check that the key matches the selected provider.',
        'Remove extra spaces before or after the key.',
      ],
      retryable: false,
    });
  }
  if (status === 404 || (status === 400 && mentionsModel)) {
    return new AuditError({
      ...base,
      reason: "The selected model isn't available for this provider. Check the model name or choose another model.",
      solutions: [
        'Check the model name for typos.',
        'Verify the model is available for this provider.',
        'Use Refresh Models to pick a supported option.',
      ],
      retryable: false,
    });
  }
  if (status === 429) {
    return new AuditError({
      ...base,
      reason: 'The provider is temporarily rate-limiting requests. Inspectra will retry automatically.',
      solutions: ['Wait a moment and try again.', 'Check your provider plan or quota.'],
      retryable: true,
    });
  }
  if (status >= 500) {
    return new AuditError({
      ...base,
      reason: 'The AI provider is temporarily unavailable.',
      solutions: ['Try again shortly.', 'Check the provider status page.'],
      retryable: true,
    });
  }
  return new AuditError({
    ...base,
    reason: 'The provider rejected the request. Check the selected model, API format, or provider configuration.',
    solutions: [
      'Use Test Connection to verify the provider setup.',
      'Check whether the model and endpoint are valid for this provider.',
    ],
    retryable: false,
  });
}

// ── Adapter interface ───────────────────────────────────────────────────────
// New wire formats plug in here: implement AIAdapter and register it in
// ADAPTERS. Nothing else in the app keys off provider names or models.

export interface AnalyzeOpts {
  screenshot?: string | null;
}

export interface ValidationResult {
  ok: boolean;
  message: string;
  modelAvailable?: boolean;
}

export function parseAgentDecision(rawJson: unknown): AgentDecision {
  if (!rawJson || typeof rawJson !== 'object') {
    return {
      thought: 'Observing initial page state.',
      action: { action: 'OBSERVE' },
    };
  }
  const obj = rawJson as Record<string, unknown>;
  const thought = typeof obj.thought === 'string' ? obj.thought : undefined;
  const actionObj = (obj.action && typeof obj.action === 'object' ? obj.action : obj) as Record<string, unknown>;
  const actionType = typeof actionObj.action === 'string' ? actionObj.action.toUpperCase() : 'OBSERVE';

  const validActions = [
    'OBSERVE',
    'SCREENSHOT',
    'SCROLL',
    'CLICK',
    'HOVER',
    'FOCUS',
    'WAIT',
    'GET_ELEMENT_INFO',
    'INSPECT_STATE',
    'MARK_ISSUE',
    'FINISH_AUDIT',
  ];
  if (!validActions.includes(actionType)) {
    return {
      thought: thought ?? 'Observing current page state.',
      action: { action: 'OBSERVE' },
    };
  }

  return {
    thought,
    action: { ...actionObj, action: actionType } as unknown as BrowserAction,
  };
}

export interface AIAdapter {
  readonly format: AIAdapterFormat;
  /** Human list of configuration gaps; empty means scannable. */
  validate(config: AIProviderConfig): string[];
  analyze(config: AIProviderConfig, input: WebsiteAnalysis, opts?: AnalyzeOpts): Promise<AuditResult>;
  decideNextAction(config: AIProviderConfig, context: AgentDecisionContext): Promise<AgentDecision>;
  listModels(config: AIProviderConfig): Promise<string[]>;
  testConnection(config: AIProviderConfig): Promise<ValidationResult>;
  buildFixPrompt(
    config: AIProviderConfig,
    audit: AuditResult,
    page: WebsiteAnalysis['page'],
    explorationHistory?: ExplorationStep[],
    statesVisited?: StateRecord[],
  ): string;
}

function requireModel(config: AIProviderConfig): void {
  // No silent fallback: the exact user-configured model is used, always.
  if (!config.model.trim()) {
    throw new ConfigError(['No AI model is configured.']);
  }
}

// ── OpenAI-compatible adapter ───────────────────────────────────────────────
// POST {endpoint}/chat/completions — serves OpenAI, OpenRouter, Groq,
// Together, DeepSeek, Ollama, and any compatible server or proxy.

function normalizeChatUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (!trimmed) throw new ConfigError(['API endpoint is not configured.']);
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ConfigError(['API endpoint is not a valid URL.']);
  }
  if (!/^https?:$/.test(url.protocol)) throw new ConfigError(['API endpoint must start with http:// or https://.']);
  if (/\/chat\/completions\/?$/.test(url.pathname)) return url.toString().replace(/\/+$/, '');
  return `${url.toString().replace(/\/+$/, '')}/chat/completions`;
}

function normalizeModelsUrl(endpoint: string): string {
  const chat = normalizeChatUrl(endpoint);
  return chat.replace(/\/chat\/completions$/, '/models');
}

function buildOpenAIUserContent(prompt: string, screenshot?: string | null) {
  const content: ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] = [
    { type: 'text', text: prompt },
  ];
  if (screenshot && screenshot.startsWith('data:image/')) {
    content.push({ type: 'image_url', image_url: { url: screenshot } });
  }
  return content;
}

export class OpenAICompatibleAdapter implements AIAdapter {
  readonly format: AIAdapterFormat = 'openai-compatible';

  validate(config: AIProviderConfig): string[] {
    const gaps: string[] = [];
    if (!config.name.trim()) gaps.push('Provider name is not set.');
    if (!config.endpoint.trim()) gaps.push('API endpoint is not configured.');
    else {
      try {
        const url = new URL(config.endpoint.trim());
        if (!/^https?:$/.test(url.protocol)) gaps.push('API endpoint must start with http:// or https://.');
      } catch {
        gaps.push('API endpoint is not a valid URL.');
      }
    }
    if (!config.model.trim()) gaps.push('No AI model is configured.');
    // API key is optional: local servers (Ollama etc.) often need none.
    return gaps;
  }

  async analyze(config: AIProviderConfig, input: WebsiteAnalysis, opts?: AnalyzeOpts): Promise<AuditResult> {
    requireModel(config);
    const url = normalizeChatUrl(config.endpoint);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    const body = {
      model: config.model.trim(),
      temperature: 0.3,
      max_tokens: 6000,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system' as const, content: AUDIT_SYSTEM_PROMPT },
        { role: 'user' as const, content: buildOpenAIUserContent(buildAuditUserPrompt(input), opts?.screenshot) },
      ],
    };
    const res = await fetchWithRetry(config, url, { method: 'POST', headers, body: JSON.stringify(body) }, 90000);
    const text = await res.text();
    if (!res.ok) throw classifyHttpError(config, res.status, text);
    let data: { choices?: { message?: { content?: string } }[] };
    try {
      data = JSON.parse(text);
    } catch {
      throw new AuditError({
        providerName: config.name,
        model: config.model,
        endpoint: endpointHost(config),
        reason: 'The provider returned an unreadable response.',
        solutions: ['Use Test Connection in Settings.', 'Verify the endpoint speaks the OpenAI chat-completions format.'],
        retryable: false,
      });
    }
    const reply = data.choices?.[0]?.message?.content ?? '';
    if (!reply.trim()) {
      throw new AuditError({
        providerName: config.name,
        model: config.model,
        endpoint: endpointHost(config),
        reason: 'The provider returned an empty response.',
        solutions: ['Try scanning again.', 'Verify the configured model supports chat completions.'],
        retryable: true,
      });
    }
    return validateAuditResult(extractJson(reply));
  }

  async listModels(config: AIProviderConfig): Promise<string[]> {
    const url = normalizeModelsUrl(config.endpoint);
    const headers: Record<string, string> = {};
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    const res = await fetchWithRetry(config, url, { headers }, 20000);
    const text = await res.text();
    if (!res.ok) throw classifyHttpError(config, res.status, text);
    let data: { data?: { id?: string }[] };
    try {
      data = JSON.parse(text);
    } catch {
      throw new AuditError({
        providerName: config.name,
        model: config.model,
        endpoint: endpointHost(config),
        reason: 'Model list unavailable — the endpoint did not return a model list.',
        solutions: ['Enter the model name manually.'],
        retryable: false,
      });
    }
    const ids = (data.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
    if (ids.length === 0) {
      throw new AuditError({
        providerName: config.name,
        model: config.model,
        endpoint: endpointHost(config),
        reason: 'Model list unavailable — the endpoint returned no models.',
        solutions: ['Enter the model name manually.'],
        retryable: false,
      });
    }
    return ids.slice(0, 200);
  }

  async testConnection(config: AIProviderConfig): Promise<ValidationResult> {
    const gaps = this.validate(config).filter((g) => !g.startsWith('Provider name'));
    if (gaps.length > 0) return { ok: false, message: gaps[0] };
    requireModel(config);
    const url = normalizeChatUrl(config.endpoint);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    const body = {
      model: config.model.trim(),
      max_tokens: 16,
      messages: [{ role: 'user' as const, content: 'Reply with the single word: ok' }],
    };
    try {
      const res = await fetchWithRetry(config, url, { method: 'POST', headers, body: JSON.stringify(body) }, 30000);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = classifyHttpError(config, res.status, text);
        return { ok: false, message: err.details.reason };
      }
      return { ok: true, message: 'Connection successful. Model available.', modelAvailable: true };
    } catch (e) {
      if (e instanceof AuditError) return { ok: false, message: e.details.reason };
      const err = connectionError(config, e);
      return { ok: false, message: err.details.reason };
    }
    return { ok: true, message: 'Connection successful. Model available.', modelAvailable: true };
  }

  async decideNextAction(config: AIProviderConfig, context: AgentDecisionContext): Promise<AgentDecision> {
    requireModel(config);
    const url = normalizeChatUrl(config.endpoint);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    const userPrompt = buildAgentDecisionPrompt(context);
    const body = {
      model: config.model.trim(),
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system' as const, content: AGENT_SYSTEM_PROMPT },
        { role: 'user' as const, content: buildOpenAIUserContent(userPrompt, context.screenshot) },
      ],
    };
    const res = await fetchWithRetry(config, url, { method: 'POST', headers, body: JSON.stringify(body) }, 45000);
    const text = await res.text();
    if (!res.ok) throw classifyHttpError(config, res.status, text);
    let data: { choices?: { message?: { content?: string } }[] };
    try {
      data = JSON.parse(text);
    } catch {
      throw new AuditError({
        providerName: config.name,
        model: config.model,
        endpoint: endpointHost(config),
        reason: 'The provider returned an unreadable response during exploration.',
        solutions: ['Verify your API endpoint and model parameters.'],
        retryable: false,
      });
    }
    const reply = data.choices?.[0]?.message?.content ?? '';
    return parseAgentDecision(extractJson(reply));
  }

  buildFixPrompt(
    _config: AIProviderConfig,
    audit: AuditResult,
    page: WebsiteAnalysis['page'],
    explorationHistory?: ExplorationStep[],
    statesVisited?: StateRecord[],
  ): string {
    return generateFixPrompt(audit, page, explorationHistory, statesVisited);
  }
}

// ── Gemini-native adapter ───────────────────────────────────────────────────
// Speaks the Generative Language API: POST {base}/models/{model}:generateContent.
// The base is user-overridable (proxies); the official base is protocol
// knowledge of this adapter, not a provider assumption.

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function resolveGeminiBase(config: AIProviderConfig): string {
  const custom = config.endpoint.trim().replace(/\/+$/, '');
  if (!custom) return GEMINI_API_BASE;
  let url: URL;
  try {
    url = new URL(custom);
  } catch {
    throw new ConfigError(['API endpoint is not a valid URL.']);
  }
  if (!/^https?:$/.test(url.protocol)) throw new ConfigError(['API endpoint must start with http:// or https://.']);
  return url.toString().replace(/\/+$/, '');
}

function toInlineImage(dataUrl: string | null | undefined) {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { inlineData: { mimeType: m[1] === 'png' ? 'image/png' : 'image/jpeg', data: m[2] } };
}

export class GeminiNativeAdapter implements AIAdapter {
  readonly format: AIAdapterFormat = 'gemini-native';

  validate(config: AIProviderConfig): string[] {
    const gaps: string[] = [];
    if (!config.name.trim()) gaps.push('Provider name is not set.');
    if (config.endpoint.trim()) {
      try {
        const url = new URL(config.endpoint.trim());
        if (!/^https?:$/.test(url.protocol)) gaps.push('API endpoint must start with http:// or https://.');
      } catch {
        gaps.push('API endpoint is not a valid URL.');
      }
    }
    if (!config.apiKey) gaps.push('API key is not configured.');
    if (!config.model.trim()) gaps.push('No AI model is configured.');
    return gaps;
  }

  async analyze(config: AIProviderConfig, input: WebsiteAnalysis, opts?: AnalyzeOpts): Promise<AuditResult> {
    requireModel(config);
    if (!config.apiKey) throw new ConfigError(['API key is not configured.']);
    const base = resolveGeminiBase(config);
    const model = config.model.trim();
    const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const image = toInlineImage(opts?.screenshot);
    const parts: unknown[] = [{ text: buildAuditUserPrompt(input) }];
    if (image) parts.push(image);
    const body = {
      system_instruction: { parts: [{ text: AUDIT_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 6000, responseMimeType: 'application/json' },
    };
    const res = await fetchWithRetry(
      config,
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      90000,
    );
    const text = await res.text();
    if (!res.ok) throw classifyHttpError(config, res.status, text);
    let data: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    try {
      data = JSON.parse(text);
    } catch {
      throw new AuditError({
        providerName: config.name,
        model: config.model,
        endpoint: endpointHost(config) || base,
        reason: 'The provider returned an unreadable response.',
        solutions: ['Use Test Connection in Settings.', 'Try scanning again.'],
        retryable: false,
      });
    }
    const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!reply.trim()) {
      throw new AuditError({
        providerName: config.name,
        model: config.model,
        endpoint: endpointHost(config) || base,
        reason: 'The provider returned an empty response.',
        solutions: ['Try scanning again.', 'Verify the configured model supports content generation.'],
        retryable: true,
      });
    }
    return validateAuditResult(extractJson(reply));
  }

  async listModels(config: AIProviderConfig): Promise<string[]> {
    if (!config.apiKey) throw new ConfigError(['API key is not configured.']);
    const base = resolveGeminiBase(config);
    const url = `${base}/models?key=${encodeURIComponent(config.apiKey)}`;
    const res = await fetchWithRetry(config, url, { method: 'GET' }, 20000);
    const text = await res.text();
    if (!res.ok) throw classifyHttpError(config, res.status, text);
    let data: { models?: { name?: string }[] };
    try {
      data = JSON.parse(text);
    } catch {
      throw new AuditError({
        providerName: config.name,
        model: config.model,
        endpoint: endpointHost(config) || base,
        reason: 'Model list unavailable — the endpoint did not return a model list.',
        solutions: ['Enter the model name manually.'],
        retryable: false,
      });
    }
    const ids = (data.models ?? [])
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
      .slice(0, 200);
    if (ids.length === 0) {
      throw new AuditError({
        providerName: config.name,
        model: config.model,
        endpoint: endpointHost(config) || base,
        reason: 'Model list unavailable — the endpoint returned no models.',
        solutions: ['Enter the model name manually.'],
        retryable: false,
      });
    }
    return ids;
  }

  async testConnection(config: AIProviderConfig): Promise<ValidationResult> {
    const gaps = this.validate(config).filter((g) => !g.startsWith('Provider name'));
    if (gaps.length > 0) return { ok: false, message: gaps[0] };
    requireModel(config);
    const base = resolveGeminiBase(config);
    const url = `${base}/models/${encodeURIComponent(config.model.trim())}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 16 },
    };
    try {
      const res = await fetchWithRetry(
        config,
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        30000,
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = classifyHttpError(config, res.status, text);
        return { ok: false, message: err.details.reason };
      }
      return { ok: true, message: 'Connection successful. Model available.', modelAvailable: true };
    } catch (e) {
      if (e instanceof AuditError) return { ok: false, message: e.details.reason };
      const err = connectionError(config, e);
      return { ok: false, message: err.details.reason };
    }
  }

  async decideNextAction(config: AIProviderConfig, context: AgentDecisionContext): Promise<AgentDecision> {
    requireModel(config);
    if (!config.apiKey) throw new ConfigError(['API key is not configured.']);
    const base = resolveGeminiBase(config);
    const model = config.model.trim();
    const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const image = toInlineImage(context.screenshot);
    const parts: unknown[] = [{ text: buildAgentDecisionPrompt(context) }];
    if (image) parts.push(image);
    const body = {
      system_instruction: { parts: [{ text: AGENT_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1500, responseMimeType: 'application/json' },
    };
    const res = await fetchWithRetry(
      config,
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      45000,
    );
    const text = await res.text();
    if (!res.ok) throw classifyHttpError(config, res.status, text);
    let data: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    try {
      data = JSON.parse(text);
    } catch {
      throw new AuditError({
        providerName: config.name,
        model: config.model,
        endpoint: endpointHost(config) || base,
        reason: 'The provider returned an unreadable response during exploration.',
        solutions: ['Check your API key and model.'],
        retryable: false,
      });
    }
    const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return parseAgentDecision(extractJson(reply));
  }

  buildFixPrompt(
    _config: AIProviderConfig,
    audit: AuditResult,
    page: WebsiteAnalysis['page'],
    explorationHistory?: ExplorationStep[],
    statesVisited?: StateRecord[],
  ): string {
    return generateFixPrompt(audit, page, explorationHistory, statesVisited);
  }
}

// ── Registry ────────────────────────────────────────────────────────────────
// 'custom' currently uses the OpenAI-compatible wire shape; a future adapter
// (Anthropic messages, Cohere, …) registers here without touching callers.

const ADAPTERS: Record<AIAdapterFormat, AIAdapter> = {
  'openai-compatible': new OpenAICompatibleAdapter(),
  'gemini-native': new GeminiNativeAdapter(),
  custom: new OpenAICompatibleAdapter(),
};

export function getAdapter(format: AIAdapterFormat): AIAdapter {
  return ADAPTERS[format] ?? ADAPTERS['openai-compatible'];
}
