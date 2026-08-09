'use client';

import { useRef, useState, useEffect } from 'react';
import { carregarFicheiros, registarEntrega } from '@/lib/entrega/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Camera, X, PenLine, Eraser, AlertTriangle, MapPin, CheckCircle2, PackageCheck,
} from 'lucide-react';

/**
 * Registo da prova de entrega.
 *
 * Este é o documento que resolve disputas — se houver desacordo sobre o estado
 * da mercadoria ou sobre se foi mesmo entregue, é isto que decide. Por isso
 * captura nome de quem recebeu, assinatura, fotografias, GPS e hora, e permite
 * registar danos explicitamente em vez de os esconder.
 */
export function FormularioEntrega({ cargaId }: { cargaId: string }) {
  const [aberto, setAberto] = useState(false);
  const [recebidoPor, setRecebidoPor] = useState('');
  const [notas, setNotas] = useState('');
  const [temDanos, setTemDanos] = useState(false);
  const [danosDesc, setDanosDesc] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [posicao, setPosicao] = useState<{ lat: number; lng: number } | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhandoRef = useRef(false);
  const temAssinaturaRef = useRef(false);

  // Obter posição ao abrir — a entrega deve ficar georreferenciada
  useEffect(() => {
    if (!aberto || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosicao({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPosicao(null),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, [aberto]);

  // Preparar o canvas da assinatura
  useEffect(() => {
    if (!aberto) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Escala para ecrãs de alta densidade — sem isto a assinatura fica desfocada
    const escala = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * escala;
    canvas.height = rect.height * escala;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0B3C5D';
  }, [aberto]);

  function coordenadas(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function iniciarTraco(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    desenhandoRef.current = true;
    temAssinaturaRef.current = true;
    const { x, y } = coordenadas(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function continuarTraco(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhandoRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = coordenadas(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function terminarTraco() {
    desenhandoRef.current = false;
  }

  function limparAssinatura() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    temAssinaturaRef.current = false;
  }

  function adicionarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const novas = Array.from(e.target.files ?? []);
    if (fotos.length + novas.length > 5) {
      setErro('Máximo 5 fotografias.');
      return;
    }
    setFotos((f) => [...f, ...novas]);
    setPreviews((p) => [...p, ...novas.map((f) => URL.createObjectURL(f))]);
    setErro(null);
  }

  function removerFoto(i: number) {
    URL.revokeObjectURL(previews[i]);
    setFotos((f) => f.filter((_, idx) => idx !== i));
    setPreviews((p) => p.filter((_, idx) => idx !== i));
  }

  async function submeter() {
    if (!recebidoPor.trim()) {
      setErro('Indique quem recebeu a mercadoria.');
      return;
    }
    if (temDanos && !danosDesc.trim()) {
      setErro('Descreva os danos verificados.');
      return;
    }

    setAGravar(true);
    setErro(null);

    try {
      // Fotografias
      let caminhosFotos: string[] = [];
      if (fotos.length > 0) {
        const r = await carregarFicheiros('provas-entrega', fotos);
        if ('erro' in r) {
          setErro(r.erro);
          setAGravar(false);
          return;
        }
        caminhosFotos = r.caminhos;
      }

      // Assinatura — o canvas é convertido em ficheiro
      let caminhoAssinatura: string | null = null;
      if (temAssinaturaRef.current && canvasRef.current) {
        const blob = await new Promise<Blob | null>((res) =>
          canvasRef.current!.toBlob(res, 'image/png'),
        );
        if (blob) {
          const ficheiro = new File([blob], 'assinatura.png', { type: 'image/png' });
          const r = await carregarFicheiros('provas-entrega', [ficheiro]);
          if ('caminhos' in r) caminhoAssinatura = r.caminhos[0];
        }
      }

      await registarEntrega({
        cargaId,
        recebidoPor: recebidoPor.trim(),
        assinatura: caminhoAssinatura,
        fotos: caminhosFotos,
        notas: notas.trim() || null,
        temDanos,
        danosDescricao: temDanos ? danosDesc.trim() : null,
        lat: posicao?.lat ?? null,
        lng: posicao?.lng ?? null,
      });

      setConcluido(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registar a entrega.');
    } finally {
      setAGravar(false);
    }
  }

  if (concluido) {
    return (
      <section className="cf-card border-green-200 bg-green-50/60 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" aria-hidden="true" />
        <h2 className="mt-4 font-semibold text-navy-600">Entrega registada</h2>
        <p className="mt-1 text-sm text-slate-600">
          O comerciante foi notificado e vai confirmar a receção.
        </p>
      </section>
    );
  }

  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)} size="lg">
        <PackageCheck className="h-4 w-4" aria-hidden="true" />
        Registar entrega
      </Button>
    );
  }

  return (
    <section className="cf-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-navy-600">Prova de entrega</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Este registo serve de comprovativo em caso de dúvida.
          </p>
        </div>
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
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="mt-5 space-y-5">
        <Input
          label="Quem recebeu"
          value={recebidoPor}
          onChange={(e) => setRecebidoPor(e.target.value)}
          required
          placeholder="Nome de quem assinou a receção"
        />

        {/* Fotografias */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-navy-600">
            Fotografias da entrega
          </label>
          <div className="flex flex-wrap gap-3">
            {previews.map((src, i) => (
              <div key={src} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Fotografia ${i + 1}`}
                  className="h-20 w-20 rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={() => removerFoto(i)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-1 text-white"
                  aria-label={`Remover fotografia ${i + 1}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            ))}
            {fotos.length < 5 && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500">
                <Camera className="h-5 w-5" aria-hidden="true" />
                <span className="text-xs">Foto</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={adicionarFotos}
                  className="sr-only"
                />
              </label>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Até 5 fotografias. Mostre a mercadoria no local de entrega.
          </p>
        </div>

        {/* Assinatura */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-sm font-medium text-navy-600">
              <PenLine className="h-4 w-4" aria-hidden="true" />
              Assinatura de quem recebeu
            </label>
            <button
              type="button"
              onClick={limparAssinatura}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-navy-600"
            >
              <Eraser className="h-3 w-3" aria-hidden="true" />
              Limpar
            </button>
          </div>
          <canvas
            ref={canvasRef}
            onPointerDown={iniciarTraco}
            onPointerMove={continuarTraco}
            onPointerUp={terminarTraco}
            onPointerLeave={terminarTraco}
            className="h-36 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
            style={{ touchAction: 'none' }}
          />
        </div>

        {/* Danos */}
        <label
          className={cn(
            'flex items-start gap-3 rounded-lg border p-4',
            temDanos ? 'border-accent-300 bg-accent-50/50' : 'border-slate-200',
          )}
        >
          <input
            type="checkbox"
            checked={temDanos}
            onChange={(e) => setTemDanos(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-accent-500 focus:ring-accent-500"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-navy-600">
              <AlertTriangle className="h-4 w-4 text-accent-500" aria-hidden="true" />
              A mercadoria apresenta danos
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Registar agora protege ambas as partes. Esconder danos gera disputas.
            </span>
          </span>
        </label>

        {temDanos && (
          <Textarea
            label="Descrição dos danos"
            value={danosDesc}
            onChange={(e) => setDanosDesc(e.target.value)}
            required
            rows={3}
            placeholder="Ex.: Duas embalagens amolgadas no canto superior."
          />
        )}

        <Textarea
          label="Observações"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          placeholder="Opcional"
        />

        {posicao && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
            Localização registada ({posicao.lat.toFixed(4)}, {posicao.lng.toFixed(4)})
          </p>
        )}

        <Button onClick={submeter} loading={aGravar} block size="lg">
          <PackageCheck className="h-4 w-4" aria-hidden="true" />
          Confirmar entrega
        </Button>
      </div>
    </section>
  );
}
