'use client';

import { useState, useTransition } from 'react';
import {
  carregarFotoOperacao,
  removerFotoOperacao,
  type FotoOperacao,
} from '@/lib/entrega/actions';
import { Camera, X, Loader2 } from 'lucide-react';

/**
 * Galeria de fotos partilhada — recolha e entrega.
 *
 * Ao contrário da prova de entrega formal (que só o transportador regista,
 * uma vez, com assinatura), esta galeria é simples e aberta às duas partes:
 * tanto o comerciante como o transportador podem juntar fotografias da
 * mercadoria, tanto no momento da recolha como no da entrega.
 */
export function GaleriaFotos({
  cargaId,
  fotosIniciais,
  urlsIniciais,
}: {
  cargaId: string;
  fotosIniciais: FotoOperacao[];
  urlsIniciais: Record<string, string>;
}) {
  const [fotos, setFotos] = useState(fotosIniciais);
  const [urls, setUrls] = useState(urlsIniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState<'PICKUP' | 'DELIVERY' | null>(null);
  const [, startTransition] = useTransition();

  async function adicionar(stage: 'PICKUP' | 'DELIVERY', ficheiro: File) {
    setErro(null);
    setACarregar(stage);
    const resultado = await carregarFotoOperacao(cargaId, stage, ficheiro);
    setACarregar(null);

    if ('erro' in resultado) {
      setErro(resultado.erro);
      return;
    }

    // A revalidatePath já trata do servidor; aqui só refletimos localmente
    // uma pré-visualização imediata sem esperar por um novo pedido.
    const previaId = `temp-${Date.now()}`;
    const url = URL.createObjectURL(ficheiro);
    setFotos((f) => [
      ...f,
      {
        id: previaId,
        stage,
        path: previaId,
        caption: null,
        uploaded_by_name: 'Você',
        sou_eu: true,
        created_at: new Date().toISOString(),
      },
    ]);
    setUrls((u) => ({ ...u, [previaId]: url }));
  }

  function remover(fotoId: string) {
    setFotos((f) => f.filter((foto) => foto.id !== fotoId));
    if (fotoId.startsWith('temp-')) return; // só era pré-visualização local
    startTransition(() => {
      removerFotoOperacao(cargaId, fotoId).catch(() => {
        setErro('Não foi possível remover a fotografia.');
      });
    });
  }

  function Secao({ stage, titulo }: { stage: 'PICKUP' | 'DELIVERY'; titulo: string }) {
    const fotosDaSecao = fotos.filter((f) => f.stage === stage);
    return (
      <div>
        <p className="text-sm font-medium text-navy-600">{titulo}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {fotosDaSecao.map((foto) => (
            <div key={foto.id} className="relative">
              {urls[foto.path] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[foto.path]}
                  alt={`Fotografia de ${foto.uploaded_by_name}`}
                  className="h-20 w-20 rounded-lg object-cover"
                />
              ) : (
                <div className="h-20 w-20 animate-pulse rounded-lg bg-slate-100" />
              )}
              <p className="mt-1 max-w-[5rem] truncate text-center text-[10px] text-slate-400">
                {foto.sou_eu ? 'Você' : foto.uploaded_by_name}
              </p>
              {foto.sou_eu && (
                <button
                  type="button"
                  onClick={() => remover(foto.id)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-1 text-white"
                  aria-label="Remover fotografia"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}

          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500">
            {aCarregar === stage ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <>
                <Camera className="h-5 w-5" aria-hidden="true" />
                <span className="text-xs">Foto</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={aCarregar !== null}
              onChange={(e) => {
                const ficheiro = e.target.files?.[0];
                e.target.value = '';
                if (ficheiro) adicionar(stage, ficheiro);
              }}
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <section className="cf-card space-y-5 p-6">
      <div>
        <h2 className="font-semibold text-navy-600">Fotografias da mercadoria</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Qualquer uma das partes pode juntar fotos aqui — na recolha e na entrega.
        </p>
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      <Secao stage="PICKUP" titulo="Na recolha" />
      <Secao stage="DELIVERY" titulo="Na entrega" />
    </section>
  );
}
