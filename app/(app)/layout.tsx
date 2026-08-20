import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarNotificacoes } from '@/lib/notificacoes/actions';
import { sair } from '../(auth)/actions';
import { SinoNotificacoes } from '@/components/notificacoes/sino';
import { Logo } from '@/components/logo';
import { LinkNav } from '@/components/shell/link-nav';
import { NavMobile } from '@/components/shell/nav-mobile';
import { ROLE_LABELS, type UserRole } from '@/lib/types';
import {
  LayoutDashboard, Package, Truck, MapPin, Users, FileText,
  BarChart3, Settings, LogOut, ShieldAlert, MessageSquare, Wallet, PiggyBank,
  Shield,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * Navegação por perfil.
 *
 * Isto é conveniência de interface, NÃO segurança — esconder um link não
 * impede o acesso. A autorização real está nas políticas RLS da base de dados
 * e nas verificações de cada página.
 */
const NAVEGACAO: Record<UserRole, { href: string; rotulo: string; icone: any }[]> = {
  MERCHANT: [
    { href: '/painel', rotulo: 'Painel', icone: LayoutDashboard },
    { href: '/cargas', rotulo: 'As minhas cargas', icone: Package },
    { href: '/mercado/viagens', rotulo: 'Procurar transporte', icone: Truck },
    { href: '/mensagens', rotulo: 'Mensagens', icone: MessageSquare },
    { href: '/rastreio', rotulo: 'Acompanhar', icone: MapPin },
    { href: '/pagamentos', rotulo: 'Pagamentos', icone: Wallet },
    { href: '/carteira', rotulo: 'Carteira', icone: PiggyBank },
    { href: '/documentos', rotulo: 'Documentos', icone: FileText },
    { href: '/configuracoes', rotulo: 'Configurações', icone: Settings },
  ],
  CARRIER: [
    { href: '/painel', rotulo: 'Painel', icone: LayoutDashboard },
    { href: '/viagens', rotulo: 'As minhas viagens', icone: Truck },
    { href: '/mercado/cargas', rotulo: 'Procurar carga', icone: Package },
    { href: '/mensagens', rotulo: 'Mensagens', icone: MessageSquare },
    { href: '/frota', rotulo: 'Frota', icone: Truck },
    { href: '/pagamentos', rotulo: 'Pagamentos', icone: Wallet },
    { href: '/carteira', rotulo: 'Carteira', icone: PiggyBank },
    { href: '/documentos', rotulo: 'Documentos', icone: FileText },
    { href: '/configuracoes', rotulo: 'Configurações', icone: Settings },
  ],
  COMPANY_ADMIN: [
    { href: '/painel', rotulo: 'Painel', icone: LayoutDashboard },
    { href: '/viagens', rotulo: 'Viagens', icone: Truck },
    { href: '/mercado/cargas', rotulo: 'Procurar carga', icone: Package },
    { href: '/mensagens', rotulo: 'Mensagens', icone: MessageSquare },
    { href: '/frota', rotulo: 'Frota', icone: Truck },
    { href: '/motoristas', rotulo: 'Motoristas', icone: Users },
    { href: '/pagamentos', rotulo: 'Pagamentos', icone: Wallet },
    { href: '/carteira', rotulo: 'Carteira', icone: PiggyBank },
    { href: '/relatorios', rotulo: 'Relatórios', icone: BarChart3 },
    { href: '/documentos', rotulo: 'Documentos', icone: FileText },
    { href: '/configuracoes', rotulo: 'Configurações', icone: Settings },
  ],
  COMPANY_STAFF: [
    { href: '/painel', rotulo: 'Painel', icone: LayoutDashboard },
    { href: '/viagens', rotulo: 'Viagens', icone: Truck },
    { href: '/mercado/cargas', rotulo: 'Procurar carga', icone: Package },
    { href: '/mensagens', rotulo: 'Mensagens', icone: MessageSquare },
    { href: '/pagamentos', rotulo: 'Pagamentos', icone: Wallet },
    { href: '/carteira', rotulo: 'Carteira', icone: PiggyBank },
    { href: '/rastreio', rotulo: 'Entregas', icone: MapPin },
    { href: '/configuracoes', rotulo: 'Configurações', icone: Settings },
  ],
  PLATFORM_ADMIN: [
    { href: '/painel', rotulo: 'Visão geral', icone: LayoutDashboard },
    { href: '/admin/utilizadores', rotulo: 'Utilizadores', icone: Users },
    { href: '/admin/verificacoes', rotulo: 'Verificações', icone: ShieldAlert },
    { href: '/admin/trust', rotulo: 'Trust Layer', icone: Shield },
    { href: '/admin/documentos', rotulo: 'Documentos', icone: FileText },
    { href: '/admin/operacoes', rotulo: 'Operações', icone: Package },
    { href: '/admin/relatorios', rotulo: 'Relatórios', icone: BarChart3 },
    { href: '/admin/configuracoes', rotulo: 'Configurações', icone: Settings },
  ],
};

/**
 * Lista de ligações. Renderizada no servidor e usada tal e qual na barra
 * lateral e na gaveta — uma única fonte, dois sítios.
 */
function ListaNavegacao({ itens }: { itens: (typeof NAVEGACAO)[UserRole] }) {
  return (
    <ul className="space-y-1">
      {itens.map(({ href, rotulo, icone: Icone }) => (
        <li key={href}>
          <LinkNav href={href}>
            <Icone className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{rotulo}</span>
          </LinkNav>
        </li>
      ))}
    </ul>
  );
}

function CartaoEmpresa({ nome, papel }: { nome: string; papel: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="truncate text-xs font-semibold text-navy-600">{nome}</p>
      <p className="mt-0.5 text-xs text-slate-500">{papel}</p>
    </div>
  );
}

export default async function LayoutAplicacao({
  children,
}: {
  children: React.ReactNode;
}) {
  const perfil = await getSessionProfile();

  // O middleware já bloqueia acesso sem sessão. Isto apanha o caso em que
  // existe sessão de autenticação mas o registo em `users` não foi criado.
  if (!perfil) redirect('/entrar');

  const { user, tenant } = perfil;
  const itens = NAVEGACAO[user.role] ?? NAVEGACAO.MERCHANT;
  const { notificacoes, porLer } = await listarNotificacoes();
  const iniciais = user.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const papel = ROLE_LABELS[user.role];

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Barra lateral — a partir de 1024 px */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-slate-100 px-5">
          <Logo />
        </div>

        <nav className="flex-1 overflow-y-auto p-3" aria-label="Navegação principal">
          <ListaNavegacao itens={itens} />
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-4">
          <CartaoEmpresa nome={tenant.name} papel={papel} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <NavMobile rodape={<CartaoEmpresa nome={tenant.name} papel={papel} />}>
            <ListaNavegacao itens={itens} />
          </NavMobile>

          <div className="lg:hidden">
            <Logo showWordmark={false} />
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            {user.verification === 'PENDING' && (
              <span className="cf-badge-delayed hidden sm:inline-flex">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Verificação pendente
              </span>
            )}

            <SinoNotificacoes notificacoes={notificacoes} porLer={porLer} />

            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-600 text-xs font-bold text-white">
                {iniciais}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate text-sm font-semibold text-navy-600">
                  {user.full_name}
                </span>
                <span className="block truncate text-xs text-slate-500">{papel}</span>
              </span>
            </div>

            <form action={sair}>
              <button
                type="submit"
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-600"
                aria-label="Terminar sessão"
              >
                <LogOut className="h-4.5 w-4.5" aria-hidden="true" />
              </button>
            </form>
          </div>
        </header>

        {/* `min-w-0` impede que uma tabela larga empurre a página inteira. */}
        <main id="conteudo" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
