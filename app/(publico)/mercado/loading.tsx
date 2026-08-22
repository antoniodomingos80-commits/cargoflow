import { PageContainer, PageHeader } from '@/components/ui/page-header';

/**
 * Estado de carregamento do mercado público.
 *
 * O Next.js mostra isto enquanto o Server Component prepara a página, sem
 * JavaScript no cliente. Reutiliza `cf-skeleton`, a mesma classe que o resto da
 * plataforma usa — para o carregamento não parecer de outra aplicação.
 */
export default function ACarregarMercado() {
  return (
    <PageContainer>
      <PageHeader titulo="Cargas disponíveis" descricao="A carregar cargas…" />
      <div className="cf-skeleton mb-6 h-28 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="cf-skeleton h-56 w-full rounded-xl" />
        ))}
      </div>
      <span className="sr-only" role="status">A carregar cargas disponíveis</span>
    </PageContainer>
  );
}
