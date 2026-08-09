# Copilot instructions for CargoFlow

## Stack and architecture
- Next.js App Router with TypeScript.
- Tailwind CSS for styling and reusable UI primitives under components/ui.
- Supabase for auth, realtime, storage, and data access.
- Server actions live near the feature modules and are used for mutations.

## Repo-specific guidance
- Keep the product experience in Portuguese unless the task explicitly requires otherwise.
- Use existing components and patterns instead of introducing ad-hoc implementations.
- Respect the auth boundaries: browser code should not access service-role secrets.
- Prefer small, verifiable changes and preserve current routing and data flow.

## Validation
- Run npm run typecheck after code changes affecting types or shared modules.
- Run npm run lint for UI and component changes.
- If a change touches data access, verify it still respects the app's Supabase and permission model.
