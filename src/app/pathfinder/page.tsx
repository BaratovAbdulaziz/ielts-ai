'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  X,
  Loader2,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  RotateCcw,
  Zap,
  Shield,
  Save,
  KeyRound,
} from 'lucide-react';

type ApiKey = { name: string; key: string; type: string };

type Config = {
  API_KEYS: ApiKey[];
  FALLBACK_CHAIN: string[];
  SYSTEM_PROMPT: string;
};

type TestResult = { ok: boolean; error?: string };

const PROVIDER_TYPES = ['gemini', 'openrouter', 'groq'];

const PRESETS = [
  {
    name: 'IELTS Tutor',
    prompt:
      'You are a friendly IELTS speaking practice partner. Keep responses short (1-3 sentences), natural, and conversational. Help the user practice English. If they speak Uzbek, respond in English but acknowledge their effort.',
  },
  {
    name: 'General Tutor',
    prompt:
      'You are a helpful and patient tutor. Explain concepts clearly and concisely. Use simple language. Encourage the user and provide constructive feedback.',
  },
  {
    name: 'Casual Chat',
    prompt:
      'You are a friendly conversationalist. Keep responses natural, warm, and brief. Ask follow-up questions to keep the conversation going. Be engaging and curious.',
  },
];

type Tab = 'api' | 'ai';

export default function Pathfinder() {
  const [config, setConfig] = useState<Config>({
    API_KEYS: [],
    FALLBACK_CHAIN: [],
    SYSTEM_PROMPT: '',
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>('api');
  const [testResults, setTestResults] = useState<Record<number, TestResult>>({});
  const [testing, setTesting] = useState<number | null>(null);
  const [showKeys, setShowKeys] = useState<Record<number, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalKey, setModalKey] = useState('');
  const [modalType, setModalType] = useState('gemini');

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((data: Config) => {
        setConfig(data);
        setLoading(false);
      });
  }, []);

  const save = useCallback(async () => {
    setSaved(false);
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [config]);

  const openAddModal = () => {
    setModalIndex(null);
    setModalName('');
    setModalKey('');
    setModalType('gemini');
    setModalOpen(true);
  };

  const openEditModal = (index: number) => {
    const entry = config.API_KEYS[index];
    setModalIndex(index);
    setModalName(entry.name);
    setModalKey(entry.key);
    setModalType(entry.type);
    setModalOpen(true);
  };

  const saveModal = () => {
    if (!modalName.trim() || !modalKey.trim()) return;
    const entry: ApiKey = { name: modalName.trim(), key: modalKey.trim(), type: modalType };

    setConfig((prev) => {
      const keys = [...prev.API_KEYS];
      if (modalIndex !== null) {
        const oldName = keys[modalIndex].name;
        keys[modalIndex] = entry;
        const chain = prev.FALLBACK_CHAIN.map((n) => (n === oldName ? entry.name : n));
        return { ...prev, API_KEYS: keys, FALLBACK_CHAIN: chain };
      }
      return { ...prev, API_KEYS: [...keys, entry] };
    });

    setModalOpen(false);
    setSaved(false);
  };

  const removeKey = (index: number) => {
    const name = config.API_KEYS[index].name;
    setConfig((prev) => ({
      ...prev,
      API_KEYS: prev.API_KEYS.filter((_, i) => i !== index),
      FALLBACK_CHAIN: prev.FALLBACK_CHAIN.filter((n) => n !== name),
    }));
    setSaved(false);
  };

  const testKey = async (index: number) => {
    const entry = config.API_KEYS[index];
    if (!entry.key) return;
    setTesting(index);
    try {
      const res = await fetch('/api/admin/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: entry.type, apiKey: entry.key }),
      });
      const result: TestResult = await res.json();
      setTestResults((prev) => ({ ...prev, [index]: result }));
    } catch {
      setTestResults((prev) => ({ ...prev, [index]: { ok: false, error: 'Network error' } }));
    } finally {
      setTesting(null);
    }
  };

  const moveInChain = (index: number, direction: -1 | 1) => {
    const chain = [...config.FALLBACK_CHAIN];
    const target = index + direction;
    if (target < 0 || target >= chain.length) return;
    [chain[index], chain[target]] = [chain[target], chain[index]];
    setConfig((prev) => ({ ...prev, FALLBACK_CHAIN: chain }));
    setSaved(false);
  };

  const addToChain = (name: string) => {
    setConfig((prev) => ({ ...prev, FALLBACK_CHAIN: [...prev.FALLBACK_CHAIN, name] }));
    setSaved(false);
  };

  const removeFromChain = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      FALLBACK_CHAIN: prev.FALLBACK_CHAIN.filter((_, i) => i !== index),
    }));
    setSaved(false);
  };

  const getKeyIndex = (name: string) => config.API_KEYS.findIndex((k) => k.name === name);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#181818] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="size-4 text-[#da291c] animate-spin" />
          <p className="text-[#8f8f8f] text-[13px] uppercase tracking-[1.1px] font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setModalOpen(false)} />
          <div className="relative bg-[#222222] border border-[#303030] w-full max-w-[480px] p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <KeyRound className="size-5 text-[#da291c]" />
                <h3 className="text-[20px] font-medium tracking-[-0.2px]">
                  {modalIndex !== null ? 'Edit Key' : 'Add Key'}
                </h3>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-2 text-[#969696] hover:text-white transition-colors">
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[12px] text-[#969696] uppercase tracking-[1.1px] font-semibold mb-2 block">Name</label>
                <input
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  placeholder="e.g. My Gemini, Backup Groq"
                  className="w-full bg-[#181818] text-white border border-[#303030] px-4 py-3 text-[14px] placeholder:text-[#666666] outline-none focus:border-[#da291c] transition-colors"
                />
              </div>

              <div>
                <label className="text-[12px] text-[#969696] uppercase tracking-[1.1px] font-semibold mb-2 block">Provider Type</label>
                <div className="flex gap-2">
                  {PROVIDER_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setModalType(t)}
                      className={`flex-1 px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[1.1px] border transition-colors ${
                        modalType === t
                          ? 'border-[#da291c] text-[#da291c] bg-[#da291c]/10'
                          : 'border-[#303030] text-[#969696] hover:text-white hover:border-[#969696]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[12px] text-[#969696] uppercase tracking-[1.1px] font-semibold mb-2 block">API Key</label>
                <input
                  type="password"
                  value={modalKey}
                  onChange={(e) => setModalKey(e.target.value)}
                  placeholder="Paste your API key"
                  className="w-full bg-[#181818] text-white border border-[#303030] px-4 py-3 text-[14px] font-mono placeholder:text-[#666666] outline-none focus:border-[#da291c] transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={saveModal}
                disabled={!modalName.trim() || !modalKey.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#da291c] text-white text-[13px] font-bold uppercase tracking-[1.4px] hover:bg-[#b01e0a] transition-colors disabled:opacity-30"
              >
                <Check className="size-4" />
                {modalIndex !== null ? 'Update' : 'Add'}
              </button>
              <button
                onClick={() => setModalOpen(false)}
                className="px-6 py-3 bg-[#303030]/40 border border-[#303030] text-[13px] font-semibold uppercase tracking-[1.1px] text-[#969696] hover:text-white hover:border-[#969696] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-[#181818] text-white flex">
        {/* Sidebar */}
        <aside className="w-[260px] shrink-0 border-r border-[#303030] bg-[#141414] flex flex-col">
          <div className="p-6 border-b border-[#303030]">
            <Link href="/" className="flex items-center gap-2 text-[#969696] hover:text-white transition-colors mb-5">
              <ArrowLeft className="size-4" />
              <span className="text-[12px] font-semibold uppercase tracking-[1.1px]">Back to App</span>
            </Link>
            <h1 className="text-[20px] font-medium tracking-[-0.2px]">Pathfinder</h1>
            <p className="text-[12px] text-[#666666] mt-1">System configuration</p>
          </div>

          <nav className="flex-1 p-3">
            <button
              onClick={() => setTab('api')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.65px] transition-colors ${
                tab === 'api' ? 'bg-[#da291c]/10 text-[#da291c]' : 'text-[#969696] hover:text-white hover:bg-[#303030]/50'
              }`}
            >
              <Zap className="size-4" />
              API Keys
            </button>
            <button
              onClick={() => setTab('ai')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.65px] transition-colors ${
                tab === 'ai' ? 'bg-[#da291c]/10 text-[#da291c]' : 'text-[#969696] hover:text-white hover:bg-[#303030]/50'
              }`}
            >
              <Shield className="size-4" />
              AI Prompt
            </button>
          </nav>

          <div className="p-4 border-t border-[#303030]">
            <button
              onClick={save}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#da291c] text-white text-[13px] font-bold uppercase tracking-[1.4px] hover:bg-[#b01e0a] transition-colors"
            >
              <Save className="size-4" />
              {saved ? 'Saved' : 'Save'}
            </button>
            {saved && (
              <p className="text-center text-[11px] text-[#03904a] uppercase tracking-[1.1px] font-semibold mt-2">Changes persisted</p>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {tab === 'api' && (
            <div className="p-[64px] max-w-[800px]">
              {/* API Keys */}
              <div className="mb-[64px]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <Zap className="size-5 text-[#da291c]" />
                    <h2 className="text-[36px] font-medium leading-[1.2] tracking-[-0.36px]">API Keys</h2>
                  </div>
                  <button
                    onClick={openAddModal}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#da291c] text-white text-[12px] font-bold uppercase tracking-[1.4px] hover:bg-[#b01e0a] transition-colors"
                  >
                    <Plus className="size-4" />
                    Add
                  </button>
                </div>
                <p className="text-[13px] text-[#8f8f8f] uppercase tracking-[1.1px] font-semibold mb-[40px]">
                  Add as many providers as you need
                </p>

                {config.API_KEYS.length === 0 ? (
                  <div className="border border-dashed border-[#303030] p-12 text-center">
                    <KeyRound className="size-8 text-[#666666] mx-auto mb-3" />
                    <p className="text-[14px] text-[#666666] mb-1">No API keys yet</p>
                    <p className="text-[12px] text-[#666666]">Click Add to configure your first provider</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {config.API_KEYS.map((entry, index) => {
                      const result = testResults[index];
                      const isTesting = testing === index;
                      const inChain = config.FALLBACK_CHAIN.includes(entry.name);

                      return (
                        <div key={index} className="flex items-center gap-3 border border-[#303030] bg-[#303030]/20 px-5 py-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <span className="text-[14px] font-bold uppercase tracking-[1.4px] truncate">{entry.name}</span>
                              <span className="px-2 py-0.5 bg-[#181818] border border-[#303030] text-[10px] text-[#8f8f8f] uppercase tracking-[1.1px] font-semibold shrink-0">
                                {entry.type}
                              </span>
                              {inChain && (
                                <span className="px-2 py-0.5 bg-[#da291c] text-white text-[10px] font-bold uppercase tracking-[1.4px] shrink-0">
                                  In chain
                                </span>
                              )}
                              {result && (
                                <span className={`text-[11px] uppercase tracking-[1.1px] font-semibold flex items-center gap-1 shrink-0 ${result.ok ? 'text-[#03904a]' : 'text-[#da291c]'}`}>
                                  {result.ok ? <><Check className="size-3" /> Verified</> : <><X className="size-3" /> {result.error}</>}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-[#666666] font-mono mt-1 truncate">
                              {showKeys[index] ? entry.key : '••••••••••••••••'}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setShowKeys((p) => ({ ...p, [index]: !p[index] }))}
                              className="px-3 py-2 text-[11px] text-[#8f8f8f] uppercase tracking-[1.1px] font-semibold hover:text-white transition-colors"
                            >
                              {showKeys[index] ? 'Hide' : 'Show'}
                            </button>
                            <button
                              onClick={() => openEditModal(index)}
                              className="px-3 py-2 text-[11px] text-[#8f8f8f] uppercase tracking-[1.1px] font-semibold hover:text-white transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => testKey(index)}
                              disabled={isTesting}
                              className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-[#8f8f8f] uppercase tracking-[1.1px] font-semibold hover:text-white transition-colors disabled:opacity-40"
                            >
                              {isTesting ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                              {isTesting ? '...' : 'Test'}
                            </button>
                            <button
                              onClick={() => removeKey(index)}
                              className="p-2 text-[#969696] hover:text-[#da291c] transition-colors"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Fallback Chain */}
              {config.API_KEYS.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <RotateCcw className="size-5 text-[#da291c]" />
                    <h2 className="text-[36px] font-medium leading-[1.2] tracking-[-0.36px]">Fallback Chain</h2>
                  </div>
                  <p className="text-[13px] text-[#8f8f8f] uppercase tracking-[1.1px] font-semibold mb-[40px]">
                    Drag to reorder priority
                  </p>

                  <div className="space-y-0">
                    {config.FALLBACK_CHAIN.map((name, index) => {
                      const ki = getKeyIndex(name);
                      const entry = ki >= 0 ? config.API_KEYS[ki] : null;
                      const result = ki >= 0 ? testResults[ki] : null;

                      return (
                        <div key={index} className="flex items-center">
                          <div className="flex flex-col items-center w-[60px] shrink-0">
                            <div
                              className={`size-8 flex items-center justify-center border text-[12px] font-bold ${
                                result?.ok
                                  ? 'border-[#03904a] text-[#03904a] bg-[#03904a]/10'
                                  : result && !result.ok
                                    ? 'border-[#da291c] text-[#da291c] bg-[#da291c]/10'
                                    : 'border-[#303030] text-[#666666] bg-[#303030]/20'
                              }`}
                            >
                              {index + 1}
                            </div>
                            {index < config.FALLBACK_CHAIN.length - 1 && <div className="w-px h-6 bg-[#303030]" />}
                          </div>

                          <div className="flex-1 flex items-center justify-between py-3 px-5 border border-[#303030] border-l-0 bg-[#303030]/20">
                            <div className="flex items-center gap-3">
                              <span className="text-[14px] font-bold uppercase tracking-[1.4px]">{name}</span>
                              {index === 0 && (
                                <span className="px-2 py-0.5 bg-[#da291c] text-white text-[10px] font-bold uppercase tracking-[1.4px]">
                                  Primary
                                </span>
                              )}
                              {entry && (
                                <span className="px-2 py-0.5 bg-[#181818] border border-[#303030] text-[10px] text-[#8f8f8f] uppercase tracking-[1.1px] font-semibold">
                                  {entry.type}
                                </span>
                              )}
                              {!entry && (
                                <span className="text-[11px] text-[#da291c] uppercase tracking-[1.1px] font-semibold">
                                  Missing key
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => moveInChain(index, -1)}
                                disabled={index === 0}
                                className="p-2 text-[#969696] hover:text-white disabled:text-[#303030] transition-colors"
                              >
                                <ChevronUp className="size-4" />
                              </button>
                              <button
                                onClick={() => moveInChain(index, 1)}
                                disabled={index === config.FALLBACK_CHAIN.length - 1}
                                className="p-2 text-[#969696] hover:text-white disabled:text-[#303030] transition-colors"
                              >
                                <ChevronDown className="size-4" />
                              </button>
                              <button
                                onClick={() => removeFromChain(index)}
                                className="p-2 text-[#969696] hover:text-[#da291c] transition-colors"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {config.API_KEYS.filter((k) => !config.FALLBACK_CHAIN.includes(k.name)).length > 0 && (
                    <div className="flex gap-2 mt-4">
                      {config.API_KEYS
                        .filter((k) => !config.FALLBACK_CHAIN.includes(k.name))
                        .map((k) => (
                          <button
                            key={k.name}
                            onClick={() => addToChain(k.name)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#303030]/40 border border-[#303030] text-[12px] font-semibold uppercase tracking-[1.1px] text-[#8f8f8f] hover:text-white hover:border-[#969696] transition-colors"
                          >
                            <Plus className="size-3" />
                            {k.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'ai' && (
            <div className="p-[64px] max-w-[800px]">
              <div className="mb-[64px]">
                <div className="flex items-center gap-3 mb-1">
                  <Shield className="size-5 text-[#da291c]" />
                  <h2 className="text-[36px] font-medium leading-[1.2] tracking-[-0.36px]">System Prompt</h2>
                </div>
                <p className="text-[13px] text-[#8f8f8f] uppercase tracking-[1.1px] font-semibold mb-[40px]">How the AI behaves</p>

                <div>
                  <textarea
                    value={config.SYSTEM_PROMPT}
                    onChange={(e) => {
                      setConfig((prev) => ({ ...prev, SYSTEM_PROMPT: e.target.value }));
                      setSaved(false);
                    }}
                    rows={14}
                    placeholder="You are a helpful assistant..."
                    className="w-full bg-[#303030]/40 border border-[#303030] px-5 py-4 text-[14px] text-white leading-[1.6] font-mono placeholder:text-[#666666] outline-none focus:border-[#da291c] transition-colors resize-none"
                  />
                  <div className="flex justify-between mt-3">
                    <p className="text-[12px] text-[#666666]">{config.SYSTEM_PROMPT.length} characters</p>
                    <p className="text-[12px] text-[#666666]">{config.SYSTEM_PROMPT.split(/\s+/).filter(Boolean).length} words</p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-3 mb-1">
                  <RotateCcw className="size-5 text-[#da291c]" />
                  <h2 className="text-[36px] font-medium leading-[1.2] tracking-[-0.36px]">Presets</h2>
                </div>
                <p className="text-[13px] text-[#8f8f8f] uppercase tracking-[1.1px] font-semibold mb-[40px]">Quick load a pre-configured prompt</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {PRESETS.map((preset) => {
                    const isActive = config.SYSTEM_PROMPT === preset.prompt;
                    return (
                      <button
                        key={preset.name}
                        onClick={() => {
                          setConfig((prev) => ({ ...prev, SYSTEM_PROMPT: preset.prompt }));
                          setSaved(false);
                        }}
                        className={`text-left p-5 border transition-colors ${
                          isActive ? 'border-[#da291c] bg-[#da291c]/5' : 'border-[#303030] bg-[#303030]/20 hover:border-[#969696]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[13px] font-bold uppercase tracking-[1.4px]">{preset.name}</span>
                          {isActive && <Check className="size-4 text-[#da291c]" />}
                        </div>
                        <p className="text-[12px] text-[#8f8f8f] leading-[1.5] line-clamp-3">{preset.prompt}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
