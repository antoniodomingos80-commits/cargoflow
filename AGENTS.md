# CargoFlow agent guidance

## Project context
- This is a Next.js 16 application using the App Router, TypeScript, Tailwind CSS, and Supabase.
- The product is a logistics marketplace for loads, trips, proposals, messaging, tracking, delivery confirmation, and platform administration.
- The UI is primarily in Portuguese and should stay consistent with the existing design system.

## Working conventions
- Prefer server components and server actions for data mutations and auth-sensitive flows.
- Keep Supabase access in the dedicated server/client helpers under lib/supabase.
- Use existing UI primitives in components/ui before introducing new styles.
- Preserve the separation between app routes, server actions, and domain logic under lib/.
- Keep changes minimal, focused, and aligned with the existing architecture.

## Quality bar
- Validate changes with npm run typecheck and npm run lint whenever feasible.
- Avoid introducing client-side secrets or exposing service-role access in browser code.
- Keep database rules, auth flows, and permissions aligned with the existing Supabase setup.
- When adding features, respect the current Portuguese terminology and user experience patterns.
