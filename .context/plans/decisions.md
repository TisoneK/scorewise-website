# Architectural Decisions (append-only, ADR-style)

Decisions already made — future agents respect these rather than
relitigating them. To reverse one, append a new ADR that supersedes it.

<!-- TEMPLATE — copy below the last entry:
---
## ADR-N: <short title> (YYYY-MM-DD)
- **Status:** accepted | superseded by ADR-M
- **Context:** <what forced the decision>
- **Decision:** <what was decided>
- **Consequences:** <trade-offs accepted; what future agents must respect>
-->

---
## ADR-1: Manual reduced-risk overrides are protected from scraper clobber (2026-07-14)
- **Status:** accepted
- **Context:** The reduced-risk fields (`reducedOverTotal`, `reducedOverOdds`, `reducedUnderTotal`, `reducedUnderOdds`) are scraped from Flashscore by default. But Flashscore sometimes reports odds up to ~1.6 while the actual bookmaker site has odds ≤1.10 — far below break-even. Admins/operators need to manually correct these. Without protection, the next scraper run would overwrite the correction, defeating the feature.
- **Decision:** Added a `reducedRiskSource` column ("manual" | "scraper" | null). The webhook ingest route (`/api/webhook/predictions`) checks `existing.reducedRiskSource === "manual"` and, if true, OMITS the 4 reduced-risk fields from the update payload — preserving the manual values. The manual writer (`/api/admin/predictions/reduced-risk`) stamps `reducedRiskSource = "manual"` on every write. A "clear" action resets source to null, allowing the scraper to repopulate.
- **Consequences:** (1) Manual overrides are sticky — they survive all subsequent scrapes until explicitly cleared. (2) The scraper can NEVER update reduced-risk values while a manual override is active, even if the scraped values are "better" — clearing is a manual action. (3) The audit columns (`reducedRiskUpdatedAt`, `reducedRiskUpdatedBy`) provide full traceability. (4) Future agents must NOT "fix" the webhook to always write reduced-risk fields — the omission is intentional and load-bearing.

---
## ADR-2: Runtime schema migration via /api/admin/migrate-schema, not prisma db push (2026-07-14)
- **Status:** accepted (confirms pre-existing decision from commits 8d920d5, dccc4e9, 517a6af)
- **Context:** Vercel builds cannot reach the Turso DB to run `prisma db push` — it times out / blocks deploys. The project already had a runtime migration pattern: an admin-only API route that runs `ALTER TABLE ADD COLUMN` via raw SQL, called silently on admin page load.
- **Decision:** Continued the existing pattern for the 3 new audit columns (`reducedRiskSource`, `reducedRiskUpdatedAt`, `reducedRiskUpdatedBy`). Updated `prisma/schema.prisma` (for dev type-safety + Prisma client generation) AND the `/api/admin/migrate-schema/route.ts` (for production runtime migration). The migrate-schema route uses `PRAGMA table_info(Prediction)` to check existing columns and only adds missing ones.
- **Consequences:** (1) Schema changes require updates in TWO places — `schema.prisma` AND `migrate-schema/route.ts`. Future agents must not update one without the other. (2) The migrate-schema route is idempotent — safe to call on every admin page load. (3) `prisma generate` is still needed locally for type-safety, but `prisma db push` is NEVER run in production. (4) This is a workaround for Vercel's build-time DB access limitation — if Vercel ever supports build-time DB access (or the project moves off Vercel), this pattern can be retired in favor of `prisma migrate deploy`.

---
## ADR-3: Reduced-risk audit fields are admin-only, stripped from user API responses (2026-07-14)
- **Status:** accepted
- **Context:** The 3 audit fields (`reduced_risk_source`, `reduced_risk_updated_at`, `reduced_risk_updated_by`) expose admin/operator activity (who overrode what, when). Regular users should not see this — it's internal audit data, not betting info.
- **Decision:** The public predictions API (`/api/predictions`) includes the audit fields in its full response, but the `!all` branch (regular users) strips them via the existing `USER_FIELDS` allowlist. Only the `?all=true` branch (admin/operator) returns them.
- **Consequences:** (1) Regular users see only the 4 reduced-risk VALUES (total/odds), never the source/audit trail. (2) The `USER_FIELDS` allowlist is the security boundary — future agents adding fields to the user response must explicitly add them to `USER_FIELDS`, and internal/audit fields must NOT be added. (3) `reduced_risk_updated_by` exposes admin userIds to other admins — defensible (admins can already see the users table) but worth noting.
