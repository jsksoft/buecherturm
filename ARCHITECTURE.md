# ARCHITECTURE.md

> Letzte Aktualisierung: 2026-05
> Produkt: **Bücherturm**
> Status: Living Document

---

## 1. System-Überblick

KI-gestütztes Buch-Tracking-Tool. Privacy-first, DSGVO-nativ.

┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                           │
│   Next.js 16 (App Router, React 19)                             │
│   Tailwind CSS v4 (Modern CSS Engine)                           │
│   Responsive Shell: Bottom-Nav (Mobile) / Sidebar (Desktop)     │
└───────────────────────────┬─────────────────────────────────────┘
│ HTTPS / tRPC 11
┌───────────────────────────▼─────────────────────────────────────┐
│                          API LAYER                              │
│   tRPC Router (Next.js Route Handlers)                          │
│   Zod Validierung & Middleware (Auth, Admin, Rate-Limit)        │
└───────────────────────────┬─────────────────────────────────────┘
│
┌─────────────────┼─────────────────┐
│                 │                 │
┌─────────▼──────┐ ┌────────▼───────┐ ┌──────▼──────────┐
│  Supabase EU   │ │  Upstash Redis │ │  KI-Provider    │
│  PostgreSQL 16 │ │  Rate Limiting │ │  Anthropic/OA   │
│  pgvector      │ │  Caching       │ │  Embeddings     │
└────────────────┘ └────────────────┘ └─────────────────┘


## 2. Kern-Komponenten

- **Frontend:** Next.js 16, Tailwind v4. Fokus auf Mobile-First.
- **Security:** AES-256-GCM Verschlüsselung für E-Mails und private Notizen direkt in der Applikationsschicht (bevor die Daten die API verlassen).
- **Database:** Drizzle ORM mit PostgreSQL 16 auf Supabase (Region Frankfurt).
- **AI Infrastructure:** Provider-agnostisches Interface (Anthropic/OpenAI/Gemini), zur Laufzeit umschaltbar via Admin-Panel.

## 3. Responsive Strategie

- **Mobile (< 1024px):** Feste Bottom-Navigation, einspaltige Layouts, Daumenzonen-Optimierung.
- **Desktop (>= 1024px):** Sidebar-Navigation links, Content-Bereich begrenzt auf `max-w-5xl`. Explizit optimiert für 13" MacBook Air (ca. 2560x1600 Retina).