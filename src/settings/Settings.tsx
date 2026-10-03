import { useEffect, useMemo, useState } from 'react';
import { getAdapter } from '../ai/adapters';
import type { AIAdapterFormat, AIProviderConfig, AIStore } from '../shared/types';
import {
  deleteProvider,
  getActiveProvider,
  loadAIStore,
  maskKey,
  newProviderId,
  saveProvider,
  setActiveProvider,
  setIncludeScreenshot,
} from './storage';

const inputCls = 'in-input';
const labelCls = 'in-label mb-1.5 block';

type ProviderChoice = 'gemini' | 'openai' | 'openrouter' | 'custom';

const PROVIDER_CHOICES: Array<{ key: ProviderChoice; name: string; kind: string; summary: string }> = [
  { key: 'gemini', name: 'Google Gemini', kind: 'Gemini Native', summary: 'Works with Google’s standard API.' },
  { key: 'openai', name: 'OpenAI', kind: 'OpenAI Compatible', summary: 'Built for OpenAI-style models and proxies.' },
  { key: 'openrouter', name: 'OpenRouter', kind: 'OpenAI Compatible', summary: 'Great for multi-model routing.' },
  { key: 'custom', name: 'Custom Provider', kind: 'Advanced', summary: 'Configure your own API endpoint.' },
];

export default function Settings({ onChanged }: { onChanged?: () => void }) {
  const [store, setStore] = useState<AIStore | null>(null);
  const [mode, setMode] = useState<'list' | 'choose' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [choice, setChoice] = useState<ProviderChoice | null>(null);

  useEffect(() => {
    void loadAIStore().then(setStore);
  }, []);

  async function refresh() {
    const s = await loadAIStore();
    setStore(s);
    onChanged?.();
    return s;
  }

  if (!store) {
    return <p className="in-caption py-6 text-center text-sm">Loading providers…</p>;
  }

  if (mode === 'list') {
    return (
      <ProviderList
        store={store}
        onAdd={() => {
          setChoice(null);
          setEditingId(null);
          setMode('choose');
        }}
        onEdit={(id) => {
          setEditingId(id);
          setChoice(null);
          setMode('form');
        }}
        onChanged={refresh}
      />
    );
  }

  if (mode === 'choose') {
    return (
      <ProviderChoiceView
        onSelect={(provider) => {
          setChoice(provider);
          setMode('form');
        }}
        onCancel={() => setMode('list')}
      />
    );
  }

  const editing = editingId ? (store.providers.find((p) => p.id === editingId) ?? null) : null;
  return (
    <ProviderForm
      initial={editing}
      choice={choice ?? inferChoice(editing)}
      onCancel={() => {
        setChoice(null);
        setEditingId(null);
        setMode('list');
      }}
      onSaved={async () => {
        setChoice(null);
        setEditingId(null);
        setMode('list');
        await refresh();
      }}
    />
  );
}

function inferChoice(config: AIProviderConfig | null): ProviderChoice {
  if (!config) return 'gemini';
  if (config.format === 'gemini-native') return 'gemini';
  if (config.name.toLowerCase().includes('openrouter')) return 'openrouter';
  if (config.name.toLowerCase().includes('openai')) return 'openai';
  if (config.format === 'custom') return 'custom';
  return 'openai';
}

function ProviderChoiceView({
  onSelect,
  onCancel,
}: {
  onSelect: (value: ProviderChoice) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="in-title text-sm font-bold">Add AI Provider</h2>
        <button onClick={onCancel} className="in-body text-xs font-medium hover:text-[var(--in-text)]">
          ← Back
        </button>
      </div>
      <p className="in-body text-sm">Choose your AI provider</p>
      <div className="grid gap-2">
        {PROVIDER_CHOICES.map((provider) => (
          <button
            key={provider.key}
            type="button"
            onClick={() => onSelect(provider.key)}
            className="in-card flex w-full items-center justify-between rounded-xl p-3 text-left transition-colors hover:border-[var(--in-accent)]"
            style={{ transition: 'border-color 120ms' }}
          >
            <div>
              <div className="in-title text-sm font-semibold">{provider.name}</div>
              <div className="in-body text-xs">{provider.kind}</div>
            </div>
            <div className="in-chip rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
              {provider.summary}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProviderList({
  store,
  onAdd,
  onEdit,
  onChanged,
}: {
  store: AIStore;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onChanged: () => Promise<AIStore>;
}) {
  const active = getActiveProvider(store);

  async function handleUse(id: string) {
    await setActiveProvider(id);
    await onChanged();
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete provider “${name}”? This removes it from this browser.`)) return;
    await deleteProvider(id);
    await onChanged();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="in-title text-sm font-bold">AI Providers</h2>
        <span className="in-caption text-xs">{store.providers.length} saved</span>
      </div>

      <button
        onClick={onAdd}
        className="in-btn-ghost w-full border-dashed px-4 py-3 text-sm font-semibold"
        style={{ borderStyle: 'dashed' }}
      >
        + Add AI Provider
      </button>

      {store.providers.length === 0 && (
        <div className="in-notice-warn rounded-xl p-4 text-center">
          <p className="in-title text-sm font-medium">No AI provider configured.</p>
          <p className="in-body mt-1 text-xs">Choose a provider and add your API key to get started.</p>
        </div>
      )}

      {store.providers.map((provider) => {
        const isActive = provider.id === store.activeId;
        const label = provider.format === 'gemini-native' ? 'Gemini Native' : provider.format === 'custom' ? 'Custom' : 'OpenAI Compatible';

        return (
          <div
            key={provider.id}
            className={`in-card rounded-xl p-3.5 ${isActive ? 'in-card-active' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="in-title truncate text-sm font-bold">{provider.name || 'Untitled provider'}</p>
                <p className="in-body mt-0.5 text-xs">
                  {label} · Model: <span className="font-mono">{provider.model || 'not set'}</span>
                </p>
                <p className="in-caption mt-0.5 text-xs">Key: {provider.apiKey ? maskKey(provider.apiKey) : 'not set'}</p>
              </div>
              {isActive ? (
                <span className="in-notice-ok shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-[var(--in-ok)]">
                  ✓ Active
                </span>
              ) : (
                <span className="in-chip shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  ● Not active
                </span>
              )}
            </div>
            <div className="mt-2.5 flex gap-1.5">
              {!isActive && (
                <button
                  onClick={() => handleUse(provider.id)}
                  className="in-btn-primary px-3 py-1.5 text-xs"
                >
                  Use
                </button>
              )}
              <button
                onClick={() => onEdit(provider.id)}
                className="in-btn-ghost px-3 py-1.5 text-xs font-medium"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(provider.id, provider.name || 'Untitled provider')}
                className="in-btn-danger-ghost px-3 py-1.5 text-xs font-medium"
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}

      <label className="in-card flex cursor-pointer items-center justify-between rounded-xl px-3.5 py-2.5">
        <span className="in-body text-sm">
          Include screenshot
          <span className="in-caption block text-xs">Attach a downscaled page image with the audit.</span>
        </span>
        <input
          type="checkbox"
          checked={store.includeScreenshot}
          onChange={async (e) => {
            await setIncludeScreenshot(e.target.checked);
            await onChanged();
          }}
          className="in-check h-4 w-4"
        />
      </label>

      {active && (
        <p className="in-muted-box rounded-lg px-3 py-2 text-xs">
          Using <span className="font-semibold">{active.name}</span> · <span className="font-mono">{active.model || '(no model set)'}</span>
        </p>
      )}
    </div>
  );
}

function ProviderForm({
  initial,
  choice,
  onCancel,
  onSaved,
}: {
  initial: AIProviderConfig | null;
  choice: ProviderChoice;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? defaultName(choice));
  const [format, setFormat] = useState<AIAdapterFormat>(initial?.format ?? defaultFormat(choice));
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? '');
  const [keyInput, setKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(Boolean(initial?.apiKey));
  const [replacingKey, setReplacingKey] = useState(!initial?.apiKey);
  const [model, setModel] = useState(initial?.model ?? '');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);
  const [testState, setTestState] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const showAdvancedEndpoint = choice === 'custom';
  const showProviderName = choice !== 'custom' || !initial;

  const draft = useMemo<AIProviderConfig>(() => ({
    id: initial?.id ?? newProviderId(),
    name: name.trim() || defaultName(choice),
    format,
    endpoint: endpoint.trim() || defaultEndpointForChoice(choice),
    apiKey: keyInput ? keyInput : hasStoredKey ? (initial?.apiKey ?? '') : '',
    model: model.trim(),
  }), [choice, endpoint, format, hasStoredKey, initial, keyInput, model, name]);

  async function handleFetchModels() {
    setFetchState('loading');
    setFetchMsg(null);
    try {
      const models = await getAdapter(format).listModels(draft);
      setFetchedModels(models);
      setFetchState('idle');
      if (models.length > 0 && !model) setModel(models[0]);
    } catch (e) {
      setFetchState('error');
      setFetchMsg(
        e instanceof Error ? `${e.message} Couldn't load models. You can enter the model name manually.` : "Couldn't load models. You can enter the model name manually.",
      );
    }
  }

  async function handleTest() {
    setTestState('loading');
    setTestMsg(null);
    try {
      const result = await getAdapter(format).testConnection(draft);
      setTestState(result.ok ? 'ok' : 'fail');
      setTestMsg(result.ok ? '✓ Connection successful.' : result.message);
    } catch (e) {
      setTestState('fail');
      setTestMsg(e instanceof Error ? e.message : 'Connection failed.');
    }
  }

  async function handleSave() {
    setFormError(null);
    setSaving(true);
    try {
      const gaps = getAdapter(format).validate(draft);
      if (gaps.length > 0) {
        setFormError(gaps[0]);
        return;
      }
      await saveProvider(draft);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="in-title text-sm font-bold">{initial ? 'Edit AI Provider' : defaultName(choice)}</h2>
        <button onClick={onCancel} className="in-body text-xs font-medium hover:text-[var(--in-text)]">
          ← Back to list
        </button>
      </div>

      {showProviderName && (
        <div>
          <label className={labelCls}>Provider Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={defaultName(choice)}
            autoComplete="off"
            spellCheck={false}
            className={inputCls}
          />
        </div>
      )}

      {showAdvancedEndpoint && (
        <div>
          <label className={labelCls}>API Format</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as AIAdapterFormat)}
            className={inputCls}
          >
            <option value="openai-compatible">OpenAI Compatible</option>
            <option value="gemini-native">Gemini Native</option>
          </select>
        </div>
      )}

      {showAdvancedEndpoint && (
        <div>
          <label className={labelCls}>API Endpoint</label>
          <input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://..."
            autoComplete="off"
            spellCheck={false}
            className="in-input in-input-mono"
          />
        </div>
      )}

      <div>
        <label className={labelCls}>API Key</label>
        {hasStoredKey && !replacingKey ? (
          <div className="flex items-center gap-2">
            <input value={maskKey('x')} disabled className="in-input in-input-mono" aria-label="Saved API key (hidden)" />
            <button
              onClick={() => setReplacingKey(true)}
              className="in-btn-ghost shrink-0 px-3 py-2 text-xs font-medium"
            >
              Replace Key
            </button>
            <button
              onClick={() => {
                setHasStoredKey(false);
                setKeyInput('');
              }}
              className="in-btn-danger-ghost shrink-0 px-3 py-2 text-xs font-medium"
            >
              Remove Key
            </button>
          </div>
        ) : (
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Paste your API key"
            autoComplete="off"
            spellCheck={false}
            className={inputCls}
          />
        )}
      </div>

      <div>
        <label className={labelCls}>Model</label>
        <div className="flex gap-2">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Select or type a model"
            autoComplete="off"
            spellCheck={false}
            className="in-input in-input-mono"
          />
          <button
            onClick={handleFetchModels}
            disabled={fetchState === 'loading'}
            className="in-btn-ghost shrink-0 px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            {fetchState === 'loading' ? 'Loading…' : 'Refresh Models'}
          </button>
        </div>
        {fetchedModels.length > 0 && (
          <select value={fetchedModels.includes(model) ? model : ''} onChange={(e) => setModel(e.target.value)} className={`mt-2 ${inputCls}`}>
            <option value="">Select model</option>
            {fetchedModels.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        )}
        {fetchMsg && <p className="in-caption mt-1.5 text-xs leading-relaxed">{fetchMsg}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={handleTest}
          disabled={testState === 'loading'}
          className="in-btn-ghost w-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ borderColor: 'rgba(111,150,232,0.45)', background: 'var(--in-accent-wash)', color: 'var(--in-accent-hover)' }}
        >
          {testState === 'loading' ? 'Testing…' : 'Test Connection'}
        </button>
        {testMsg && (
          <p
            className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
              testState === 'ok' ? 'in-notice-ok text-[var(--in-ok)]' : 'in-notice-error text-[var(--in-danger)]'
            }`}
          >
            {testMsg}
          </p>
        )}
      </div>

      {formError && <p className="in-notice-error rounded-lg px-3 py-2 text-xs text-[var(--in-danger)]">{formError}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="in-btn-primary flex-1 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : initial ? 'Save Provider' : 'Save Provider'}
        </button>
        <button onClick={onCancel} className="in-btn-ghost px-4 py-2.5 text-sm font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}

function defaultName(choice: ProviderChoice): string {
  switch (choice) {
    case 'gemini':
      return 'Google Gemini';
    case 'openai':
      return 'OpenAI';
    case 'openrouter':
      return 'OpenRouter';
    default:
      return 'Custom Provider';
  }
}

function defaultFormat(choice: ProviderChoice): AIAdapterFormat {
  switch (choice) {
    case 'gemini':
      return 'gemini-native';
    case 'custom':
      return 'custom';
    default:
      return 'openai-compatible';
  }
}

function defaultEndpointForChoice(choice: ProviderChoice): string {
  switch (choice) {
    case 'gemini':
      return '';
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    default:
      return '';
  }
}
