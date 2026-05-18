# PRD — Bücherturm
## Product Requirements Document v1.1

> Status: Living Document
> Letzte Aktualisierung: 2026-05
> Entwickler: Solo (nebenberuflich, ~10–15h/Woche)
> Claude Code: Dieses Dokument ist die primäre Referenz für alle Implementierungsentscheidungen.

---

## 0. Wie man dieses Dokument liest

Dieses PRD ist gleichzeitig Produktdokumentation und Claude Code-Kontext.

- **Fett** = Implementierungsanforderung, nicht verhandelbar
- *Kursiv* = Empfehlung, kann abweichen wenn begründet
- `Code` = technische Spezifikation, exakt umzusetzen
- ⚠️ = DSGVO-kritisch, immer PRIVACY.md konsultieren
- 🔒 = nur für authentifizierte Nutzer
- 💎 = nur für Premium-Nutzer

---

## 1. Produkt-Überblick

### 1.1 Vision
Bücherturm ist die erste Buch-App, die deutschsprachige Leser wirklich kennt — gebaut in Deutschland, für Menschen, die ihre Leseidentität ernst nehmen und ihre Daten kontrollieren wollen.

### 1.2 Positionierung
Bücherturm ist ein privates, KI-gestütztes Buch-Tracking-Tool für den DACH-Markt. Es ist kein soziales Netzwerk. Es ist kein Buchmarktplatz. Es ist ein persönliches Werkzeug.

**Was Bücherturm ist:**
- Privates Buch-Tracking mit einfacher Bedienung
- KI-Empfehlungen basierend auf persönlichem Lesegeschmack
- DSGVO-first: Daten bleiben in der EU, sind exportierbar, jederzeit löschbar

---

## 5. Technische Spezifikation

### 5.1 Tech-Stack (verbindlich)

| Bereich | Technologie | Version | Notiz |
| :--- | :--- | :--- | :--- |
| **Frontend** | Next.js | 16.x | App Router, Server Components, React 19 |
| **Sprache** | TypeScript | 5.5+ | strict mode |
| **API** | tRPC | 11.x | End-to-end type safety |
| **ORM** | Drizzle ORM | 0.45+ | |
| **Datenbank** | PostgreSQL | 16 | Supabase EU Frankfurt |
| **Vektor-DB** | pgvector | - | In Supabase integriert |
| **Styling** | Tailwind CSS | 4.x | Native CSS-Engine, high perf |
| **Krypto** | AES-256-GCM | - | Application-level encryption für PII |

---

## 6. UX-Anforderungen

### 6.1 Design-Prinzipien

- **Mobile First:** Primäre Nutzung auf Smartphones. Alle wichtigen Steuerelemente in der Daumenzone.
- **Bottom Navigation:** Auf Mobile zentrale Steuerung unten.
- **Desktop Adaptation:** Sidebar-Navigation links (ab 1024px).
- **Content Constraint:** Auf Desktops (optimiert für 13" MacBook Air) max-width `5xl` (ca. 1024px) für Textinhalte, um optimale Zeilenlängen zu garantieren.
- **Schnelligkeit:** Nutzung von React 19 `useOptimistic` für sofortiges Feedback (< 100ms).

---