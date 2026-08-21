import Link from 'next/link';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
import { indicadoresPlataforma } from '@/lib/admin/actions';
import { Shield, Settings, Users, ArrowRight } from 'lucide-react';
import { classesBotao } from '@/components/ui/button';

export const metadata = { title: 'Configurações da plataforma' };

export default async function PaginaConfiguracoesAdmin() {
  const indicadores = await indicadoresPlataforma();

  return (
    <PageContainer>
      <PageHeader
        titulo="Configurações da plataforma"
        descricao="Painel administrativo para governação, revisão e controlo operacional."
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Cartao
          icone={Users}
          titulo="Utilizadores pendentes"
          valor={indicadores?.utilizadores_pendentes ?? 0}
          subtitulo="Aguardam aprovação documental"
        />
        <Cartao
          icone={Shield}
          titulo="Propostas pendentes"
          valor={indicadores?.propostas_pendentes ?? 0}
          subtitulo="Negociações por decidir"
        />
        <Cartao
          icone={Settings}
          titulo="Acordos"
          valor={indicadores?.acordos ?? 0}
          subtitulo="Total de acordos registados"
        />
      </section>

      <section className="cf-card p-6">
        <h2 className="text-lg font-semibold text-navy-600">Ações rápidas</h2>
        <p className="mt-1 text-sm text-slate-500">
          Fluxos críticos de administração e segurança da plataforma.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/verificacoes" className={classesBotao({ variant: 'outline' })}>
            Rever verificações <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/admin/operacoes" className={classesBotao({ variant: 'outline' })}>
            Monitorizar operações <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/admin/relatorios" className={classesBotao({ variant: 'outline' })}>
            Abrir relatórios <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="cf-card p-6">
        <h2 className="text-lg font-semibold text-navy-600">Configurações de conta</h2>
        <p className="mt-1 text-sm text-slate-500">
          Dados do seu perfil administrativo e preferências de empresa.
        </p>
        <Link href="/configuracoes" className={`${classesBotao()} mt-4`}>
          Abrir configurações
        </Link>
      </section>
    </PageContainer>
  );
}

function Cartao({
  icone: Icone,
  titulo,
  valor,
  subtitulo,
}: {
  icone: any;
  titulo: string;
  valor: number;
  subtitulo: string;
}) {
  return (
    <div className="cf-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        {titulo}
      </div>
      <p className="mt-2 text-2xl font-bold text-navy-600">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{subtitulo}</p>
    </div>
  );
}