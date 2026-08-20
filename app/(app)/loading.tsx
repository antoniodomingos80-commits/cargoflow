/**
 * Estado de carregamento da área autenticada.
 *
 * Antes disto não existia nenhum `loading.tsx` no projecto: uma página lenta
 * dava ecrã em branco. O esqueleto usa a mesma classe `cf-skeleton` que já
 * existia em globals.css.
 */
export default function ACarregar() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">A carregar…</span>

      <div className="space-y-2">
        <div className="cf-skeleton h-8 w-56" />
        <div className="cf-skeleton h-4 w-72" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="cf-card p-5">
            <div className="cf-skeleton h-3 w-20" />
            <div className="cf-skeleton mt-4 h-8 w-16" />
            <div className="cf-skeleton mt-3 h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="cf-card space-y-3 p-6">
        <div className="cf-skeleton h-4 w-40" />
        <div className="cf-skeleton h-16 w-full" />
        <div className="cf-skeleton h-16 w-full" />
      </div>
    </div>
  );
}
