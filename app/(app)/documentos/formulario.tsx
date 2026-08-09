'use client';

import { useState, useRef } from 'react';
import { carregarDocumento } from '@/lib/documentos/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DOCUMENT_TYPE_LABELS } from '@/lib/types';
import { Upload, AlertCircle, CheckCircle2, X } from 'lucide-react';

export function FormularioDocumento({ perfilCarrier }: { perfilCarrier: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function submeter(formData: FormData) {
    setAEnviar(true);
    setErro(null);
    const r = await carregarDocumento(formData);
    setAEnviar(false);

    if (r?.erro) {
      setErro(r.erro);
      return;
    }
    setSucesso(true);
    formRef.current?.reset();
    setTimeout(() => {
      setSucesso(false);
      setAberto(false);
    }, 2500);
  }

  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        Carregar documento
      </Button>
    );
  }

  return (
    <section className="cf-card p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-semibold text-navy-600">Carregar documento</h2>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {erro && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{erro}</span>
        </div>
      )}

      {sucesso && (
        <div className="mt-4 flex items-start gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Documento carregado. Fica pendente de verificação.</span>
        </div>
      )}

      <form ref={formRef} action={submeter} className="mt-5 space-y-4">
        <Select label="Tipo de documento" name="tipo" required placeholder="Selecionar…">
          {Object.entries(DOCUMENT_TYPE_LABELS)
            .filter(([v]) =>
              perfilCarrier
                ? true
                : !['VEHICLE_REGISTRATION', 'INSPECTION'].includes(v),
            )
            .map(([v, rotulo]) => (
              <option key={v} value={v}>{rotulo}</option>
            ))}
        </Select>

        <div className="space-y-1.5">
          <label htmlFor="ficheiro" className="block text-sm font-medium text-navy-600">
            Ficheiro <span className="text-red-500">*</span>
          </label>
          <input
            id="ficheiro"
            name="ficheiro"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            required
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100"
          />
          <p className="text-xs text-slate-500">
            Fotografia ou PDF, até 10 MB. Certifique-se de que é legível.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Número do documento"
            name="numero"
            placeholder="Opcional"
          />
          <Input
            label="Válido até"
            name="validade"
            type="date"
            hint="Opcional. Avisamos antes de expirar."
          />
        </div>

        <Button type="submit" loading={aEnviar} block>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Carregar
        </Button>
      </form>
    </section>
  );
}
