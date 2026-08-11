# Copilot instructions for CargoFlow

## Stack and architecture
- Next.js App Router with TypeScript and Tailwind CSS.
- Primary app routes live under [app/](app/); reusable UI primitives are in [components/ui/](components/ui/); domain logic and server actions live under [lib/](lib/).
- Supabase is the data and auth layer; use the dedicated helpers in [lib/supabase/](lib/supabase/) instead of ad-hoc clients.

## Product and UX
- Keep the product experience in Portuguese and follow the existing terminology and patterns.
- Prefer small, verifiable changes that preserve the current routing and flow.

## Guardrails
- Respect auth boundaries: browser code should not access service-role secrets.
- Reuse existing components and patterns before introducing new ones.
- Keep data mutations in server actions or server-side helpers whenever possible.

## Validation
- Run npm run typecheck after changes affecting types or shared modules.
- Run npm run lint for UI and component changes.
- If a change touches data access, check that Supabase permissions and RLS assumptions remain appropriate.
