'use client';

import { useState, useTransition } from 'react';
import { trpc } from '../../../../lib/trpc/client';

// ── Data Export ────────────────────────────────────────────────────────────────

function ExportSection() {
  const [isPending, startTransition] = useTransition();
  const [exported, setExported] = useState(false);

  const exportMutation = trpc.gdpr.exportData.useMutation({
    onSuccess(data) {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `buecherturm-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExported(true);
    },
  });

  function handleExport() {
    startTransition(() => {
      exportMutation.mutate();
    });
  }

  return (
    <section className="rounded-xl border border-[oklch(88%_0.015_75)] bg-white p-6">
      <h2 className="text-base font-semibold text-[oklch(20%_0.02_75)]">Deine Daten exportieren</h2>
      <p className="mt-1 text-sm text-[oklch(45%_0.02_75)]">
        Lade eine vollständige Kopie aller gespeicherten Daten herunter (DSGVO Art. 20 –
        Recht auf Datenübertragbarkeit). Die Datei enthält dein Leseprofil, deine Bibliothek
        und alle privaten Notizen im Klartext.
      </p>

      {exportMutation.error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          Export fehlgeschlagen: {exportMutation.error.message}
        </p>
      )}

      <button
        onClick={handleExport}
        disabled={isPending || exportMutation.isPending}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-brand-500)] px-4 py-2.5
                   text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-600)]
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        <IconDownload className="h-4 w-4 shrink-0" />
        {exportMutation.isPending ? 'Exportiere…' : exported ? 'Erneut exportieren' : 'Daten herunterladen'}
      </button>

      {exported && !exportMutation.isPending && (
        <p className="mt-2 text-xs text-[oklch(50%_0.1_145)]">
          Export erfolgreich — Datei wurde heruntergeladen.
        </p>
      )}
    </section>
  );
}

// ── Account Deletion ───────────────────────────────────────────────────────────

function DeletionSection() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [, startTransition] = useTransition();

  const statusQuery = trpc.gdpr.getDeletionStatus.useQuery();

  const requestMutation = trpc.gdpr.requestDeletion.useMutation({
    onSuccess() {
      statusQuery.refetch();
      setShowConfirm(false);
      setConfirmText('');
    },
  });

  const cancelMutation = trpc.gdpr.cancelDeletion.useMutation({
    onSuccess() {
      statusQuery.refetch();
    },
  });

  const scheduledFor = statusQuery.data?.scheduledFor
    ? new Date(statusQuery.data.scheduledFor)
    : null;

  const daysLeft = scheduledFor
    ? Math.max(0, Math.ceil((scheduledFor.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  function handleRequestDeletion() {
    startTransition(() => {
      requestMutation.mutate();
    });
  }

  function handleCancelDeletion() {
    startTransition(() => {
      cancelMutation.mutate();
    });
  }

  if (statusQuery.isLoading) {
    return (
      <section className="rounded-xl border border-[oklch(88%_0.015_75)] bg-white p-6">
        <div className="h-5 w-48 animate-pulse rounded bg-[oklch(92%_0.01_75)]" />
      </section>
    );
  }

  // ── Deletion pending state ──
  if (statusQuery.data?.isPending && scheduledFor) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-base font-semibold text-amber-900">Konto-Löschung geplant</h2>
        <p className="mt-1 text-sm text-amber-800">
          Dein Konto wird am{' '}
          <strong>{scheduledFor.toLocaleDateString('de-DE', { dateStyle: 'long' })}</strong>{' '}
          endgültig gelöscht (in {daysLeft} {daysLeft === 1 ? 'Tag' : 'Tagen'}). Alle deine
          Daten und dein Leseverlauf werden dauerhaft entfernt.
        </p>
        <p className="mt-2 text-sm text-amber-800">
          Du kannst die Löschung noch widerrufen, solange die Frist läuft.
        </p>

        {cancelMutation.error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            Fehler: {cancelMutation.error.message}
          </p>
        )}

        <button
          onClick={handleCancelDeletion}
          disabled={cancelMutation.isPending}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-300
                     bg-white px-4 py-2.5 text-sm font-medium text-amber-900 transition-colors
                     hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cancelMutation.isPending ? 'Widerrufe…' : 'Löschung widerrufen'}
        </button>
      </section>
    );
  }

  // ── Normal state — show deletion option ──
  return (
    <section className="rounded-xl border border-red-100 bg-white p-6">
      <h2 className="text-base font-semibold text-[oklch(20%_0.02_75)]">Konto löschen</h2>
      <p className="mt-1 text-sm text-[oklch(45%_0.02_75)]">
        Dein Konto und alle zugehörigen Daten werden nach einer Frist von 30 Tagen endgültig
        gelöscht (DSGVO Art. 17 – Recht auf Löschung). Du kannst die Löschung während dieser
        Zeit jederzeit widerrufen.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-[oklch(45%_0.02_75)]">
        <li className="flex items-center gap-2">
          <span className="text-red-400">✕</span> Leseverlauf und Bewertungen
        </li>
        <li className="flex items-center gap-2">
          <span className="text-red-400">✕</span> Private Notizen
        </li>
        <li className="flex items-center gap-2">
          <span className="text-red-400">✕</span> Leseclub-Mitgliedschaften
        </li>
        <li className="flex items-center gap-2">
          <span className="text-red-400">✕</span> KI-Leseprofil
        </li>
      </ul>

      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-red-200
                     px-4 py-2.5 text-sm font-medium text-red-700 transition-colors
                     hover:bg-red-50"
        >
          <IconTrash className="h-4 w-4 shrink-0" />
          Konto löschen
        </button>
      ) : (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-900">
            Bitte gib <strong>LÖSCHEN</strong> ein, um zu bestätigen:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="LÖSCHEN"
            aria-label="Bestätigungsfeld — tippe LÖSCHEN"
            className="mt-2 w-full rounded-md border border-red-300 bg-white px-3 py-2
                       text-sm text-red-900 placeholder-red-300 focus:outline-none
                       focus:ring-2 focus:ring-red-400"
          />

          {requestMutation.error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              Fehler: {requestMutation.error.message}
            </p>
          )}

          <div className="mt-3 flex gap-3">
            <button
              onClick={handleRequestDeletion}
              disabled={confirmText !== 'LÖSCHEN' || requestMutation.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white
                         transition-colors hover:bg-red-700 disabled:cursor-not-allowed
                         disabled:opacity-50"
            >
              {requestMutation.isPending ? 'Verarbeite…' : 'Löschung bestätigen'}
            </button>
            <button
              onClick={() => { setShowConfirm(false); setConfirmText(''); }}
              className="rounded-lg border border-[oklch(88%_0.015_75)] px-4 py-2 text-sm
                         font-medium text-[oklch(40%_0.02_75)] transition-colors hover:bg-[oklch(97%_0.005_75)]"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PrivacySettingsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[oklch(15%_0.02_75)]">Datenschutz & Konto</h1>
        <p className="mt-1 text-sm text-[oklch(50%_0.02_75)]">
          Verwalte deine persönlichen Daten gemäß DSGVO.
        </p>
      </div>

      <div className="space-y-6">
        <ExportSection />
        <DeletionSection />
      </div>
    </main>
  );
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
