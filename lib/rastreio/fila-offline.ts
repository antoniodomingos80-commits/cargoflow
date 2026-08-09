/**
 * Fila de posições GPS para sincronização diferida.
 *
 * A cobertura móvel nas estradas angolanas é intermitente. Perder as posições
 * registadas durante um túnel de sem-rede tornaria o rastreamento inútil
 * exatamente nos troços onde é mais necessário.
 *
 * Solução: guardar tudo em IndexedDB (persiste entre sessões e fecho do
 * browser, ao contrário da memória) e enviar em lote quando houver ligação.
 */

const BD_NOME = 'cargoflow-rastreio';
const BD_VERSAO = 1;
const LOJA = 'posicoes';

export interface PosicaoPendente {
  id?: number;
  tripId: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  recorded_at: string;
}

function abrirBD(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BD_NOME, BD_VERSAO);
    req.onupgradeneeded = () => {
      const bd = req.result;
      if (!bd.objectStoreNames.contains(LOJA)) {
        const loja = bd.createObjectStore(LOJA, { keyPath: 'id', autoIncrement: true });
        loja.createIndex('tripId', 'tripId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function guardarPosicao(p: PosicaoPendente): Promise<void> {
  const bd = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = bd.transaction(LOJA, 'readwrite');
    tx.objectStore(LOJA).add(p);
    tx.oncomplete = () => { bd.close(); resolve(); };
    tx.onerror = () => { bd.close(); reject(tx.error); };
  });
}

export async function lerPendentes(tripId: string, limite = 200): Promise<PosicaoPendente[]> {
  const bd = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = bd.transaction(LOJA, 'readonly');
    const req = tx.objectStore(LOJA).index('tripId').getAll(tripId, limite);
    req.onsuccess = () => { bd.close(); resolve(req.result as PosicaoPendente[]); };
    req.onerror = () => { bd.close(); reject(req.error); };
  });
}

export async function removerPendentes(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const bd = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = bd.transaction(LOJA, 'readwrite');
    const loja = tx.objectStore(LOJA);
    ids.forEach((id) => loja.delete(id));
    tx.oncomplete = () => { bd.close(); resolve(); };
    tx.onerror = () => { bd.close(); reject(tx.error); };
  });
}

export async function contarPendentes(tripId: string): Promise<number> {
  const bd = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = bd.transaction(LOJA, 'readonly');
    const req = tx.objectStore(LOJA).index('tripId').count(tripId);
    req.onsuccess = () => { bd.close(); resolve(req.result); };
    req.onerror = () => { bd.close(); reject(req.error); };
  });
}

/**
 * Frequência de registo adaptativa.
 *
 * Registar de 10 em 10 segundos numa estrada aberta gasta bateria e dados
 * sem acrescentar informação — a trajetória é previsível. Perto do destino
 * ou em zona urbana, cada minuto conta para o destinatário.
 */
export function intervaloRegistoMs(kmAoDestino: number | null, velocidadeKmh: number | null): number {
  if (kmAoDestino !== null && kmAoDestino < 15) return 30_000;   // a chegar: 30s
  if (kmAoDestino !== null && kmAoDestino < 50) return 60_000;   // aproximação: 1min
  if (velocidadeKmh !== null && velocidadeKmh < 5) return 300_000; // parado: 5min
  return 120_000;                                                 // estrada: 2min
}
