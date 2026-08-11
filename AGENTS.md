# CargoFlow agent guidance

## Project context
- This workspace is a Next.js 16 App Router application in TypeScript with Tailwind CSS.
- The product is a Portuguese logistics marketplace for loads, trips, proposals, messaging, tracking, delivery confirmation, and platform administration.
- Keep the UI and copy in Portuguese unless a task explicitly requires otherwise.

## Important references
- Start with [README.md](README.md), [00-LEIA-ME.md](00-LEIA-ME.md), [02-ARQUITETURA-TECNICA.md](02-ARQUITETURA-TECNICA.md), and [03-MVP-E-ROADMAP.md](03-MVP-E-ROADMAP.md) for product context.
- Use [app/](app/) for routes, [components/ui/](components/ui/) for reusable UI primitives, [lib/](lib/) for domain logic and server actions, and [lib/supabase/](lib/supabase/) for Supabase access.

## Working conventions
- Prefer server components and server actions for mutations and auth-sensitive flows.
- Keep Supabase client/server boundaries intact: browser code should use [lib/supabase/client.ts](lib/supabase/client.ts), while server-side access should go through [lib/supabase/server.ts](lib/supabase/server.ts).
- Reuse existing UI patterns and components before introducing new styles.
- Preserve the existing route, action, and module boundaries; keep changes small and focused.
- Avoid exposing service-role secrets or other sensitive values in browser code.

## Validation
- Run npm run typecheck after changes that affect types or shared modules.
- Run npm run lint for UI and component changes.
- If a change touches data access, verify that permissions and Supabase assumptions remain correct.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
