'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { sincronizarPosicoes, registarEvento } from '@/lib/rastreio/actions';
import {
  guardarPosicao, lerPendentes, removerPendentes, contarPendentes,
  intervaloRegistoMs,
} from '@/lib/rastreio/fila-offline';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Navigation, WifiOff, Wifi, CloudUpload, AlertCircle, Play, Square, PackageCheck,
} from 'lucide-react';

type Estado = 'parado' | 'ativo' | 'erro';

/**
 * Partilha de localização pelo motorista.
 *
 * Regras de desenho, todas motivadas pelas condições reais de uso:
 *  · A posição é SEMPRE guardada localmente primeiro. Só depois se tenta enviar.
 *    Assim nada se perde quando não há rede.
 *  · A frequência adapta-se: menos vezes em estrada aberta (poupa bateria e
 *    dados), mais perto do destino (é quando o destinatário quer saber).
 *  · O estado da ligação é mostrado com honestidade — o motorista precisa de
 *    saber se está a transmitir ou apenas a acumular.
 */
export function PartilharLocalizacao({
  cargaId,
  viagemId,
  kmAoDestino,
  estadoCarga,
}: {
  cargaId: string;
  viagemId: string;
  kmAoDestino: number | null;
  estadoCarga: string;
}) {
  const [estado, setEstado] = useState<Estado>('parado');
  const [erro, setErro] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pendentes, setPendentes] = useState(0);
  const [ultimoEnvio, setUltimoEnvio] = useState<Date | null>(null);
  const [aSincronizar, setASincronizar] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ultimaPosRef = useRef<{ lat: number; lng: number; speed: number | null } | null>(null);

  // Estado da ligação
  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine);
    atualizar();
    window.addEventListener('online', atualizar);
    window.addEventListener('offline', atualizar);
    return () => {
      window.removeEventListener('online', atualizar);
      window.removeEventListener('offline', atualizar);
    };
  }, []);

  const atualizarContagem = useCallback(async () => {
    try {
      setPendentes(await contarPendentes(viagemId));
    } catch {
      /* IndexedDB indisponível (modo privado) — ignorar */
    }
  }, [viagemId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void atualizarContagem();
    }, 0);
    return () => clearTimeout(timer);
  }, [atualizarContagem]);

  /** Envia o que estiver acumulado */
  const sincronizar = useCallback(async () => {
    if (!navigator.onLine || aSincronizar) return;
    setASincronizar(true);
    try {
      const fila = await lerPendentes(viagemId);
      if (fila.length === 0) return;

      const resultado = await sincronizarPosicoes(
        viagemId,
        fila.map(({ id, tripId, ...p }) => p),
      );

      if ('gravados' in resultado) {
        await removerPendentes(fila.map((p) => p.id!).filter(Boolean));
        setUltimoEnvio(new Date());
        setErro(null);
      } else {
        setErro(resultado.erro);
      }
    } catch (e) {
      setErro('Falha ao sincronizar. As posições ficam guardadas.');
    } finally {
      setASincronizar(false);
      atualizarContagem();
    }
  }, [viagemId, aSincronizar, atualizarContagem]);

  // Sincronizar assim que a rede volta
  useEffect(() => {
    if (!online || estado !== 'ativo') return;
    const timer = setTimeout(() => {
      void sincronizar();
    }, 0);
    return () => clearTimeout(timer);
  }, [online, estado, sincronizar]);

  /** Regista a posição atual na fila local */
  const registarPosicao = useCallback(async () => {
    if (!ultimaPosRef.current) return;
    const { lat, lng, speed } = ultimaPosRef.current;
    try {
      await guardarPosicao({
        tripId: viagemId,
        lat,
        lng,
        speed,
        heading: null,
        accuracy: null,
        recorded_at: new Date().toISOString(),
      });
      await atualizarContagem();
      sincronizar();
    } catch {
      setErro('Não foi possível guardar a posição no dispositivo.');
    }
  }, [viagemId, atualizarContagem, sincronizar]);

  function iniciar() {
    if (!('geolocation' in navigator)) {
      setErro('Este dispositivo não suporta localização.');
      setEstado('erro');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        ultimaPosRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed !== null ? pos.coords.speed * 3.6 : null,
        };
        setErro(null);
      },
      (err) => {
        setErro(
          err.code === err.PERMISSION_DENIED
            ? 'Autorize o acesso à localização nas definições do browser.'
            : 'Não foi possível obter a localização.',
        );
        setEstado('erro');
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 },
    );

    // Primeiro registo quase imediato, para dar feedback
    setTimeout(registarPosicao, 3000);

    const intervalo = intervaloRegistoMs(kmAoDestino, null);
    timerRef.current = setInterval(registarPosicao, intervalo);

    setEstado('ativo');
  }

  function parar() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    sincronizar();
    setEstado('parado');
  }

  // Limpeza ao desmontar
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function marcarEvento(tipo: 'PICKED_UP' | 'DELIVERED') {
    const pos = ultimaPosRef.current;
    try {
      await registarEvento(
        cargaId,
        tipo,
        tipo === 'PICKED_UP'
          ? 'Carga recolhida na origem.'
          : 'Carga entregue no destino.',
        pos?.lat,
        pos?.lng,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registar.');
    }
  }

  const ativo = estado === 'ativo';

  return (
    <section className="cf-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-navy-600">
            <Navigation className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Partilha de localização
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            O comerciante vê onde está a carga em tempo real.
          </p>
        </div>

        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            online ? 'bg-green-50 text-green-700' : 'bg-accent-50 text-accent-700',
          )}
        >
          {online ? (
            <>
              <Wifi className="h-3 w-3" aria-hidden="true" />
              Com rede
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" aria-hidden="true" />
              Sem rede
            </>
          )}
        </span>
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

      {!online && pendentes > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-lg bg-accent-50 px-4 py-3 text-sm text-accent-800">
          <CloudUpload className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {pendentes} {pendentes === 1 ? 'posição guardada' : 'posições guardadas'} no
            telemóvel. São enviadas automaticamente quando houver rede — nada se perde.
          </span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {ativo ? (
          <Button onClick={parar} variant="outline">
            <Square className="h-4 w-4" aria-hidden="true" />
            Parar partilha
          </Button>
        ) : (
          <Button onClick={iniciar}>
            <Play className="h-4 w-4" aria-hidden="true" />
            Começar a partilhar
          </Button>
        )}

        {estadoCarga === 'ASSIGNED' && (
          <Button onClick={() => marcarEvento('PICKED_UP')} variant="secondary">
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            Marcar como recolhida
          </Button>
        )}

        {['PICKED_UP', 'IN_TRANSIT'].includes(estadoCarga) && (
          <Button onClick={() => marcarEvento('DELIVERED')} variant="secondary">
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            Marcar como entregue
          </Button>
        )}
      </div>

      {ativo && (
        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <div>
            <dt className="inline">Estado: </dt>
            <dd className="inline font-medium text-green-600">a transmitir</dd>
          </div>
          {ultimoEnvio && (
            <div>
              <dt className="inline">Último envio: </dt>
              <dd className="inline font-medium text-navy-600">
                {ultimoEnvio.toLocaleTimeString('pt-AO')}
              </dd>
            </div>
          )}
          {pendentes > 0 && (
            <div>
              <dt className="inline">Por enviar: </dt>
              <dd className="inline font-medium text-navy-600">{pendentes}</dd>
            </div>
          )}
        </dl>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        Mantenha esta página aberta durante a viagem. Se perder rede, as posições
        continuam a ser guardadas e são enviadas quando o sinal voltar.
      </p>
    </section>
  );
}
