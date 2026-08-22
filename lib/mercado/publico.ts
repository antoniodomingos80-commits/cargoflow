/**
 * Acesso à superfície pública do mercado.
 *
 * A ÚNICA fonte é `public.mercado_publico` — uma vista com lista branca de
 * colunas, criada em `supabase/migrations/20260830_mercado_publico.sql`. Nada
 * aqui toca em `loads`, `trips`, `users`, `tenants`, `offers`, `matches`,
 * `documents` ou `payments`, nem directamente nem por junção.
 *
 * Porque não se lê `loads` com um filtro: a RLS isola linhas, não colunas. Um
 * visitante que conseguisse ler a linha veria `budget_amount`, `suggested_price`
 * e a descrição em texto livre — onde as pessoas escrevem telefones. A vista
 * resolve isso escolhendo colunas; a tabela nunca poderia.
 *
 * Estas funções correm em Server Components e devolvem `{ dados, erro }` em vez
 * de lançarem: a página tem de saber distinguir «não há cargas» de «não foi
 * possível carregar», e essas duas coisas dizem-se de maneira diferente a quem
 * está do outro lado.
 *
 * Os `as unknown as` seguem a convenção já usada em `app/(app)/mercado/cargas`:
 * o projecto não tem `lib/database.types.ts` gerado, portanto o cliente não
 * conhece a forma da vista. Enquanto não houver tipos gerados, o contrato é o
 * tipo `CargaPublica` declarado abaixo — que tem de ser mantido a par da vista à
 * mão.
 */

import { createClient } from '@/lib/supabase/server';

/**
 * As 17 colunas que a vista publica. Se a vista mudar, isto tem de mudar com
 * ela — e é de propósito que está escrito à mão em vez de `select('*')`:
 * assim uma coluna acrescentada à vista por engano não passa a aparecer no site
 * sem alguém ter escrito o nome dela aqui.
 */
export const COLUNAS_PUBLICAS = [
  'id',
  'reference',
  'title',
  'cargo_type',
  'weight_kg',
  'volume_m3',
  'required_vehicle_type',
  'requires_refrigeration',
  'is_urgent',
  'distance_km',
  'pickup_from',
  'pickup_until',
  'published_at',
  'origem_cidade',
  'origem_provincia',
  'destino_cidade',
  'destino_provincia',
].join(', ');

export type CargaPublica = {
  id: string;
  reference: string;
  title: string;
  cargo_type: string;
  weight_kg: number | null;
  volume_m3: number | null;
  required_vehicle_type: string | null;
  requires_refrigeration: boolean | null;
  is_urgent: boolean | null;
  distance_km: number | null;
  pickup_from: string | null;
  pickup_until: string | null;
  published_at: string | null;
  origem_cidade: string | null;
  origem_provincia: string | null;
  destino_cidade: string | null;
  destino_provincia: string | null;
};

export type FiltrosMercado = {
  origem?: string;
  destino?: string;
  tipo?: string;
  veiculo?: string;
  urgente?: string;
};

export type Resultado<T> = { dados: T; erro: string | null };

/**
 * Lista as cargas públicas.
 *
 * A vista já filtra por `status = 'PUBLISHED'`, por atribuir e dentro da janela
 * de recolha — não se repete isso aqui. Filtrar de novo pelo estado seria
 * pedir uma coluna que a vista não publica.
 *
 * Ordem: urgentes primeiro, depois as mais recentes.
 */
export async function listarMercadoPublico(
  filtros: FiltrosMercado = {},
): Promise<Resultado<CargaPublica[]>> {
  try {
    const supabase = createClient();
    let consulta = supabase.from('mercado_publico').select(COLUNAS_PUBLICAS);

    if (filtros.origem) consulta = consulta.eq('origem_provincia', filtros.origem);
    if (filtros.destino) consulta = consulta.eq('destino_provincia', filtros.destino);
    if (filtros.tipo) consulta = consulta.eq('cargo_type', filtros.tipo);
    if (filtros.veiculo) consulta = consulta.eq('required_vehicle_type', filtros.veiculo);
    if (filtros.urgente === '1') consulta = consulta.eq('is_urgent', true);

    const { data, error } = await consulta
      .order('is_urgent', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(60);

    if (error) return { dados: [], erro: error.message };
    return { dados: (data ?? []) as unknown as CargaPublica[], erro: null };
  } catch (e) {
    return { dados: [], erro: e instanceof Error ? e.message : 'erro desconhecido' };
  }
}

/**
 * Uma carga pública pelo id.
 *
 * `dados: null` sem `erro` significa que a carga não está na superfície
 * pública — pode nunca ter existido, ou já ter sido atribuída, ou a janela de
 * recolha ter passado. Do lado de fora essas hipóteses são indistinguíveis, e
 * é assim que deve ser: dizer «existe mas já foi atribuída» seria contar algo
 * sobre uma carga que o visitante não tem direito a ver.
 */
export async function obterCargaPublica(
  id: string,
): Promise<Resultado<CargaPublica | null>> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('mercado_publico')
      .select(COLUNAS_PUBLICAS)
      .eq('id', id)
      .maybeSingle();

    if (error) return { dados: null, erro: error.message };
    return { dados: (data as unknown as CargaPublica | null) ?? null, erro: null };
  } catch (e) {
    return { dados: null, erro: e instanceof Error ? e.message : 'erro desconhecido' };
  }
}

/**
 * Províncias com carga disponível, para o filtro. Sai da própria vista — não se
 * consulta `locations`, que é uma tabela privada.
 */
export async function listarProvinciasPublicas(): Promise<Resultado<string[]>> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('mercado_publico')
      .select('origem_provincia, destino_provincia');

    if (error) return { dados: [], erro: error.message };

    const provincias = new Set<string>();
    for (const linha of (data ?? []) as unknown as Pick<
      CargaPublica,
      'origem_provincia' | 'destino_provincia'
    >[]) {
      if (linha.origem_provincia) provincias.add(linha.origem_provincia);
      if (linha.destino_provincia) provincias.add(linha.destino_provincia);
    }
    return { dados: [...provincias].sort((a, b) => a.localeCompare(b, 'pt')), erro: null };
  } catch (e) {
    return { dados: [], erro: e instanceof Error ? e.message : 'erro desconhecido' };
  }
}
