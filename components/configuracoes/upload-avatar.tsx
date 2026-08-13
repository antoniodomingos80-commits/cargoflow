'use client';

import { useState, useRef } from 'react';
import { carregarAvatar } from '@/lib/configuracoes/actions';
import { Camera, Loader2 } from 'lucide-react';

export function UploadAvatar({
  avatarUrlInicial,
  nome,
}: {
  avatarUrlInicial: string | null;
  nome: string;
}) {
  const [avatarUrl, setAvatarUrl] = useState(avatarUrlInicial);
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const iniciais = nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  async function selecionar(ficheiro: File) {
    setErro(null);
    setACarregar(true);

    // Pré-visualização imediata, antes de esperar pelo carregamento
    const previa = URL.createObjectURL(ficheiro);
    setAvatarUrl(previa);

    const formData = new FormData();
    formData.set('avatar', ficheiro);
    const resultado = await carregarAvatar(formData);

    setACarregar(false);
    if (resultado.erro) {
      setErro(resultado.erro);
      setAvatarUrl(avatarUrlInicial);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-brand-100"
        aria-label="Alterar fotografia de perfil"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={nome} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-brand-600">
            {iniciais || '?'}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-navy-900/0 text-white opacity-0 transition-opacity group-hover:bg-navy-900/40 group-hover:opacity-100">
          {aCarregar ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const ficheiro = e.target.files?.[0];
            e.target.value = '';
            if (ficheiro) selecionar(ficheiro);
          }}
        />
      </button>
      <div>
        <p className="text-sm font-medium text-navy-600">Fotografia de perfil</p>
        <p className="text-xs text-slate-500">Clique na imagem para alterar. Até 5 MB.</p>
        {erro && <p className="mt-1 text-xs font-medium text-red-600">{erro}</p>}
      </div>
    </div>
  );
}
