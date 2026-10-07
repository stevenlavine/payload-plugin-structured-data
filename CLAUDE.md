# payload-plugin-structured-data — Claude Code Instructions

## Project overview

**Project:** `@lavinedev/payload-plugin-structured-data`
**Client:** None. Own product of Lavine Web & AI Solutions; public open-source npm plugin, not client work.
**Repo:** https://github.com/stevenlavine/payload-plugin-structured-data (private until Task 11)
**Description:** Payload CMS 3 plugin that outputs Schema.org JSON-LD (Organization, LocalBusiness, WebSite, Article, BlogPosting, Service, WebPage, FAQPage, BreadcrumbList), editable in the admin.

## Workspace links

- **Spec:** `D:\agent-os\docs\superpowers\specs\2026-10-07-payload-plugin-structured-data-design.md`
- **Plan:** `D:\agent-os\docs\superpowers\plans\2026-10-07-payload-plugin-structured-data.md`
- **SDD working files:** `D:\agent-os\.superpowers\sdd\2026-10-07-payload-plugin-structured-data\`

## Commands

```bash
pnpm test:int --run   # Vitest over src/**/*.spec.ts and dev/int.spec.ts (SQLite)
pnpm typecheck        # tsc --noEmit
pnpm build            # copyfiles + tsc types + swc into dist/
pnpm dev              # Next dev app in dev/
```

On Windows, `pnpm build` may need `SWC_NATIVE_BINDING_CACHE` pointing at a directory whose ancestors have no broad write ACLs (e.g. `C:\Users\steve\.swc-cache`).

## Global constraints

- Package name: `@lavinedev/payload-plugin-structured-data`. Branch `main`. Licence MIT, copyright Lavine Web & AI Solutions Ltd.
- Peer dependencies: `payload` `^3.82.1`, `next` `^15.0.0 || ^16.0.0`, `react` `^19.0.0`. `engines.node` `>=20.9.0`.
- Bad data never breaks the page: nothing in the render path throws. Skips produce warnings, logged only when `process.env.NODE_ENV !== 'production'`.
- Output is one `<script type="application/ld+json">` per call, holding `{ "@context": "https://schema.org", "@graph": [...] }`.
- Serialised JSON escapes every `<` as `\u003c` (six ASCII characters, not a literal `<`; verify bytes).
- Every URL in the output is absolute.
- v1 types only: Organization, LocalBusiness, WebSite, Article, BlogPosting, Service, WebPage, FAQPage, BreadcrumbList.
- `@id` values: `<siteUrl>/#organization`, `<siteUrl>/#website`, `<pageUrl>#webpage` / `#article` / `#service` / `#faq` / `#breadcrumb`.
- UK English in README and admin labels.
- Single site only in v1. Keep every settings read inside `getSettings` and every `siteUrl` use behind `ResolvedOptions.siteUrl` so multi-tenant (v2) can swap both.
- Dev/test database is SQLite. No Playwright e2e.
- No secrets in the repo.

## Publishing

Steve publishes with `pnpm publish --tag beta` (then plain `pnpm publish` for 0.1.0); never publish from an agent. Do not use `npm publish`: the top-level `exports`/`main`/`types` point at `src/*.ts` and only pnpm swaps in the `publishConfig` dist paths. `prepublishOnly` fails under npm on purpose.

On Windows, set `$env:SWC_NATIVE_BINDING_CACHE="C:\Users\steve\.swc-cache"` in PowerShell first, or the build fails.

## Things to avoid

- No `any`; use `unknown` and narrow.
- Do not commit `.env` files or secrets.
- Tests are authoritative; the plan's inline code has never been run.
