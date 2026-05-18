'use client';

import { useState } from 'react';
import { trpc } from '../../../lib/trpc/client';

type ProviderName = 'anthropic' | 'openai' | 'gemini';

const PROVIDERS: { id: ProviderName; label: string; description: string }[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude Sonnet — best reasoning, highest cost',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o mini — balanced speed and quality',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini 2.0 Flash Lite — fastest, lowest cost',
  },
];

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  active,
  onSelect,
  isPending,
}: {
  provider: (typeof PROVIDERS)[number];
  active: boolean;
  onSelect: () => void;
  isPending: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={isPending}
      aria-pressed={active}
      className={[
        'group relative flex flex-col gap-2 rounded-xl border p-5 text-left transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        active
          ? 'border-transparent bg-gradient-to-br from-violet-500/10 via-indigo-500/10 to-sky-500/10 ring-2 ring-indigo-500/40 shadow-md'
          : 'border-[oklch(88%_0.015_75)] bg-white hover:border-indigo-300 hover:shadow-sm',
        isPending ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {/* Active dot */}
      {active && (
        <span className="absolute right-4 top-4 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-500" />
        </span>
      )}

      <div className="flex items-center gap-2.5">
        <ProviderIcon id={provider.id} active={active} />
        <span className={['text-sm font-semibold', active ? 'text-indigo-700' : 'text-gray-800'].join(' ')}>
          {provider.label}
        </span>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{provider.description}</p>
      {active && (
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
          Active
        </span>
      )}
    </button>
  );
}

// ── Provider icons (inline SVG, AI-themed) ────────────────────────────────────

function ProviderIcon({ id, active }: { id: ProviderName; active: boolean }) {
  const cls = `h-6 w-6 ${active ? 'text-indigo-500' : 'text-gray-400'}`;
  if (id === 'anthropic') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    );
  }
  if (id === 'openai') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

// ── Usage stats table ─────────────────────────────────────────────────────────

function UsageTable() {
  const { data, isLoading } = trpc.admin.getUsageStats.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        Loading usage stats…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        No usage recorded in the last 30 days.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
            <th className="pb-3 pr-4">Provider</th>
            <th className="pb-3 pr-4">Model</th>
            <th className="pb-3 pr-4">Feature</th>
            <th className="pb-3 pr-4 text-right">Requests</th>
            <th className="pb-3 pr-4 text-right">Input tk</th>
            <th className="pb-3 pr-4 text-right">Output tk</th>
            <th className="pb-3 text-right">Avg ms</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50/60 transition-colors">
              <td className="py-2.5 pr-4 font-medium text-gray-800 capitalize">{row.provider}</td>
              <td className="py-2.5 pr-4 text-gray-500 font-mono text-xs">{row.model}</td>
              <td className="py-2.5 pr-4">
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600">
                  {row.feature}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{row.totalRequests?.toLocaleString()}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-gray-500">{row.totalInputTokens?.toLocaleString()}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-gray-500">{row.totalOutputTokens?.toLocaleString()}</td>
              <td className="py-2.5 text-right tabular-nums text-gray-400">{row.avgLatencyMs ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const utils = trpc.useUtils();
  const { data: activeData, isLoading: activeLoading } = trpc.admin.getActiveProvider.useQuery();
  const setProviderMutation = trpc.admin.setActiveProvider.useMutation({
    onSuccess: () => {
      void utils.admin.getActiveProvider.invalidate();
    },
  });

  const [pendingProvider, setPendingProvider] = useState<ProviderName | null>(null);

  function handleSelect(provider: ProviderName) {
    if (provider === activeData?.provider) return;
    setPendingProvider(provider);
    setProviderMutation.mutate(
      { provider },
      { onSettled: () => setPendingProvider(null) },
    );
  }

  return (
    <>
      {/* Mobile guard — admin is desktop-only */}
      <div className="lg:hidden flex min-h-[60vh] items-center justify-center p-8 text-center">
        <div>
          <IconAdmin className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <p className="text-lg font-semibold text-gray-700">Admin requires desktop</p>
          <p className="mt-1 text-sm text-gray-400">Open Bücherturm on a larger screen to access the admin panel.</p>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden lg:block">
        {/* Gradient header */}
        <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-sky-500 p-8 text-white shadow-lg">
          {/* Subtle mesh pattern overlay */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="relative flex items-start gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <IconAdmin className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">AI Control Panel</h1>
              <p className="mt-1 text-indigo-100/80 text-sm">
                Hot-swap the active LLM provider. Changes take effect immediately for all subsequent requests.
              </p>
            </div>
          </div>
        </div>

        {/* Provider selection */}
        <section className="mb-8">
          <h2 className="mb-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Active LLM Provider
          </h2>

          {activeLoading ? (
            <div className="flex items-center gap-3 py-4 text-sm text-gray-400">
              <Spinner /> Loading…
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {PROVIDERS.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  active={activeData?.provider === p.id}
                  onSelect={() => handleSelect(p.id)}
                  isPending={setProviderMutation.isPending && pendingProvider === p.id}
                />
              ))}
            </div>
          )}

          {setProviderMutation.isError && (
            <p className="mt-3 text-sm text-red-500" role="alert">
              Failed to switch provider. Check server logs.
            </p>
          )}
          {setProviderMutation.isSuccess && (
            <p className="mt-3 text-sm text-emerald-600" role="status">
              Provider switched to <strong className="capitalize">{pendingProvider ?? activeData?.provider}</strong>.
            </p>
          )}
        </section>

        {/* Note: OpenAI is always used for embeddings */}
        <div className="mb-8 rounded-xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-700">
          <strong>Embeddings:</strong> Always generated via <code className="font-mono text-xs">text-embedding-3-small</code> (OpenAI)
          regardless of the active completion provider. This keeps pgvector dimensions consistent (1536) across provider switches.
        </div>

        {/* Usage stats */}
        <section>
          <h2 className="mb-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Token Usage — Last 30 Days
          </h2>
          <div className="rounded-xl border border-[oklch(88%_0.015_75)] bg-white p-6 shadow-sm">
            <UsageTable />
          </div>
        </section>
      </div>
    </>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconAdmin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a9.96 9.96 0 0 1 6.29 2.226 1 1 0 0 1 .01 1.524l-4.3 3.485a1 1 0 0 1-1.25 0L8.45 5.75a1 1 0 0 1 .01-1.524A9.96 9.96 0 0 1 12 2z" />
      <path d="M15.71 13.31a1 1 0 0 1 0 1.38l-2.4 2.4a1 1 0 0 1-1.38 0l-2.4-2.4a1 1 0 0 1 0-1.38l1.18-1.17a1 1 0 0 0 0-1.42L9.53 9.71a1 1 0 0 1 0-1.38l.38-.38" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
