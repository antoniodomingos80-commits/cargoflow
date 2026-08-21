'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Navegação em ecrã pequeno.
 *
 * Antes disto, abaixo de 1024 px a barra lateral era simplesmente escondida e
 * o utilizador ficava sem forma nenhuma de navegar — num produto usado por
 * camionistas no telemóvel, era o defeito mais grave da interface.
 *
 * Este componente é cliente só pelo estado de aberto/fechado. A lista de
 * ligações chega como `children`, renderizada no servidor a partir do mesmo
 * `Record<UserRole, …>` que alimenta a barra lateral — as permissões por
 * perfil não são recalculadas aqui nem duplicadas.
 *
 * PORQUÊ UM PORTAL
 *
 * O botão vive dentro do `<header>`, e esse header tem `backdrop-blur`. Um
 * elemento com `backdrop-filter` passa a ser o bloco contentor dos seus
 * descendentes `position: fixed` — ou seja, um `fixed inset-0` lá dentro não
 * cobre a janela, cobre os 64 px do header e fica recortado. A gaveta abria e
 * não se via.
 *
 * O portal move o painel e a sobreposição para o `<body>`, fora de qualquer
 * contexto de empilhamento criado por filtros, transformações ou `contain`.
 * É a correcção robusta: deixa de depender do que o header tiver aplicado.
 */
export function NavMobile({
  children,
  rodape,
}: {
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  const pathname = usePathname();

  // O portal só existe no browser. Sem esta guarda, o servidor e o cliente
  // renderizariam árvores diferentes.
  useEffect(() => {
    setMontado(true);
  }, []);

  // Navegar fecha a gaveta. Fica aqui, e não em cada ligação, para que os
  // links possam continuar a ser renderizados no servidor.
  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  // Enquanto a gaveta está aberta, o corpo não deve deslizar por baixo.
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  const gaveta = (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        onClick={() => setAberto(false)}
        className="absolute inset-0 bg-navy-600/40 backdrop-blur-[2px]"
        aria-label="Fechar menu de navegação"
        tabIndex={-1}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navegação principal"
        className="animate-slide-in absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col bg-white shadow-2xl"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 pl-5 pr-3">
          <span className="text-sm font-semibold text-navy-600">Navegação</span>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-600"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">{children}</nav>

        {rodape ? <div className="shrink-0 border-t border-slate-100 p-4">{rodape}</div> : null}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-600 lg:hidden"
        aria-label="Abrir menu de navegação"
        aria-expanded={aberto}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {aberto && montado ? createPortal(gaveta, document.body) : null}
    </>
  );
}
