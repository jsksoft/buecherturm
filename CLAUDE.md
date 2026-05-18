# CLAUDE.md
## Primärer Kontext für Claude Code — immer zuerst lesen

> Dieses Dokument ist die Quelle der Wahrheit für alle Entwicklungsentscheidungen.
> Letztes Update: 2026-05

---

## Projekt-Kern

**Bücherturm** — Privates, KI-gestütztes Buch-Tracking (DACH).
**Stack:** Next.js 16, React 19, Tailwind v4, tRPC 11, Drizzle, Supabase EU.

---

## 🚨 KRITISCHE REGELN

1. **DSGVO First:** Alle personenbezogenen Daten (E-Mails, private Notizen) MÜSSEN via AES-256-GCM verschlüsselt werden, bevor sie in die Datenbank geschrieben werden.
2. **Mobile First:** Alle UI-Komponenten werden primär für das Smartphone entworfen (Bottom-Nav). Desktop ist eine sekundäre Anpassung.
3. **Desktop Constraints:** Auf Desktops niemals Text über die gesamte Breite ziehen. Immer `max-w-5xl` für den Content-Bereich nutzen.
4. **LLM Privacy:** Niemals PII (Namen, E-Mails, IPs) an externe KI-Provider senden. Immer `sanitizeForLLM()` nutzen.
5. **Modern Stack:** Nutze React 19 Features (`useOptimistic`, `useActionState`) und Tailwind v4 native CSS-Features.

---

## Implementierungs-Status

- [ ] Phase 1: Foundation (Next 16, Drizzle, Monorepo)
- [ ] Phase 2: Auth & Crypto (AES-256-GCM)
- [ ] Phase 3: Core Tracking (Status-Machine, UI)
- [ ] Phase 4: Search & AI (DNB API, pgvector)
- [ ] Phase 5: GDPR Self-Service (Export, Delete)

---

## Entwicklungs-Befehle

```bash
pnpm dev             # Start Dev Server
pnpm db:generate     # Drizzle Schema Migration generieren
pnpm db:push         # Schema direkt in DB pushen
pnpm build           # Next.js Production Build