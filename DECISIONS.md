### 4. DECISIONS.md
Das Logbuch aller wichtigen Architekturentscheidungen.

```markdown
# DECISIONS.md
## Architekturentscheidungen — Chronologisches Log

---

## 2026-05 — Upgrade auf Next.js 16, React 19 und Tailwind v4

**Kontext:**
Modernisierung des Tech-Stacks für maximale Performance und die Nutzung neuester React-Features wie verbesserte Server Actions und Hooks.

**Entscheidung:**
Einsatz von Next.js 16 (App Router) und Tailwind CSS v4.

**Begründung:**
- **Tailwind v4:** Deutlich schnellere Build-Zeiten und eine native CSS-Engine, die besser mit modernen Browser-Features harmoniert.
- **React 19:** Native Unterstützung für Optimistic UI und vereinfachtes Form-Handling.
- **Next.js 16:** Optimiertes Caching und verbesserte Performance für Mobile-Clients.

---

## 2025-06 — App-Name: Bücherturm, Domain: buecherturm.com

**Kontext:**
Namensfindung für das Produkt.

**Entscheidung:**
Name: **Bücherturm**.

**Begründung:**
Hoher emotionaler Wiedererkennungswert ("Stapel/Turm ungelesener Bücher") und klare, deutsche Identität.

---

## 2025-06 — Supabase EU statt selbst-gehostet

**Kontext:**
Infrastrukturwahl für Datenbank und Auth.

**Entscheidung:**
Supabase Frankfurt (EU).

**Begründung:**
Garantiert DSGVO-Konformität innerhalb der EU bei minimalem Wartungsaufwand für einen Solo-Entwickler.