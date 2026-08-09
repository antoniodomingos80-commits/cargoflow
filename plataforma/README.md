# CargoFlow — Plataforma

**A logística inteligente começa aqui.**

Estado: **Fase 1 (MVP) — CONCLUÍDA** ✅
- ✅ Semanas 1–2 — Fundação (autenticação, 4 perfis, design system)
- ✅ Semanas 3–4 — Marketplace de cargas
- ✅ Semanas 5–6 — Frota, viagens e **motor de correspondência**
- ✅ Semanas 7–8 — Negociação (propostas) e chat em tempo real
- ✅ Semanas 9–10 — Rastreamento GPS com funcionamento offline
- ✅ Semanas 11–12 — Prova de entrega, avaliações e administração

**O ciclo comercial está completo:** publicar → corresponder → propor →
negociar → acordar → transportar → entregar → confirmar → avaliar.

Próximo: Fase 2 — pagamentos, faturação e KYC (ver `../03-MVP-E-ROADMAP.md`)

---

## Arranque rápido (primeira vez)

### 1. Criar o projeto Supabase

1. Ir a [supabase.com](https://supabase.com) → **New project**
2. Nome: `cargoflow` · Região: **West EU (Ireland)** ← mais perto de Angola que os EUA
3. Guardar a password da base de dados num gestor de passwords
4. Aguardar ~2 minutos pelo aprovisionamento

### 2. Aplicar o esquema da base de dados

No Supabase: **SQL Editor** → **New query** → colar o conteúdo de
`../04-MODELO-DE-DADOS.sql` → **Run**.

Deve terminar sem erros. Confirme em **Table Editor** que aparecem as tabelas
`tenants`, `users`, `loads`, `trips`, etc.

### 3. Configurar as variáveis de ambiente

No Supabase: **Settings → API**. Copiar os três valores.

```powershell
cd CARGOFLOW\plataforma
copy .env.example .env.local
notepad .env.local
```

Preencher:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...        (chave "anon public")
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...            (chave "service_role" — secreta)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> ⚠️ A `service_role` ignora todas as regras de segurança da base de dados.
> Nunca a partilhe nem a coloque em código que corra no browser.

### 4. Instalar e correr

```powershell
npm install
npm run dev
```

Abrir http://localhost:3000

### 5. Criar a primeira conta

1. **Criar conta** → escolher perfil → preencher dados
2. Confirmar pelo email recebido
3. Entrar → deve chegar ao **Painel**

> Em desenvolvimento pode desligar a confirmação por email:
> Supabase → **Authentication → Providers → Email** → desativar
> *Confirm email*. Volte a ativar antes de ir para produção.

### 6. Tornar-se administrador da plataforma

Depois de criar a sua conta, no **SQL Editor**:

```sql
UPDATE users
SET role = 'PLATFORM_ADMIN', verification = 'APPROVED'
WHERE email = 'o-seu-email@exemplo.com';
```

Voltar a entrar — a navegação passa a mostrar as opções de administração.

---

## Estrutura

```
plataforma/
├── app/
│   ├── (auth)/              autenticação (layout próprio, sem barra lateral)
│   │   ├── actions.ts       server actions: entrar, registar, sair
│   │   ├── entrar/
│   │   └── registo/         2 passos: escolher perfil → dados
│   ├── (app)/               área autenticada (barra lateral por perfil)
│   │   ├── layout.tsx       navegação, cabeçalho, sessão
│   │   └── painel/
│   ├── auth/confirmar/      troca o código do email por sessão
│   ├── layout.tsx
│   ├── page.tsx             página pública
│   └── globals.css          design system
│
├── components/
│   ├── ui/                  button, input (base do design system)
│   └── logo.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts        browser
│   │   └── server.ts        servidor + getSessionProfile()
│   ├── types.ts             tipos de domínio + rótulos em português
│   └── utils.ts             formatação (moeda, peso, distância, datas)
│
└── middleware.ts            renovação de sessão + proteção de rotas
```

---

## Decisões de arquitetura

**Segurança em camadas.** A autorização vive nas políticas RLS da base de
dados, não no código da interface. Esconder um botão não é segurança — se uma
consulta esquecer o filtro por empresa, o PostgreSQL filtra na mesma.

**Validação no servidor.** Os esquemas Zod em `actions.ts` correm no servidor.
A validação no browser é conveniência para o utilizador, nunca a barreira real.

**Registo transacional.** Criar conta envolve três inserções coordenadas
(auth → tenant → user). Se alguma falhar, as anteriores são revertidas — para
não deixar contas órfãs sem perfil.

**Sessão em cookies httpOnly.** O token nunca fica acessível a JavaScript,
o que mitiga roubo por XSS. A renovação acontece no middleware porque os
Server Components não podem escrever cookies.

**Português de Angola em toda a interface**, com a estrutura preparada para
inglês e francês (rótulos centralizados em `lib/types.ts`).

---

## O que já funciona

**Autenticação e perfis**
Registo em dois passos, login, confirmação por email, navegação distinta para
comerciante / camionista / empresa / administrador.

**Marketplace de cargas**
- Publicar carga (rascunho ou publicação direta)
- Listagem própria com filtros por estado
- Detalhe com publicação e cancelamento
- Marketplace público com filtros por rota, tipo e peso
- Vista de transportador (informação diferente da vista de dono)

**Frota e viagens**
- Registar veículos com capacidade e características
- Publicar viagem com espaço livre e marcação de "viagem de retorno"
- Listagem própria e marketplace de transporte disponível

**Motor de correspondência** ← o núcleo do produto
- Filtro rígido: capacidade, tipo de veículo, refrigeração, datas, geografia
- Pontuação 0–100 decomposta em seis critérios
- Recalculado automaticamente por gatilho ao publicar carga ou viagem
- Cada correspondência explica ao utilizador porque foi recomendada

**Negociação**
- Transportador envia proposta a partir da carga (escolhendo qual viagem usar)
- Comerciante compara propostas ordenadas por preço, com reputação e
  compatibilidade lado a lado
- Aceitar / recusar / contrapropor, com histórico encadeado
- Propostas expiram em 72h — evita bloquear planeamento indefinidamente

**Chat em tempo real**
- Conversa aberta automaticamente ao surgir a primeira proposta
- Supabase Realtime + atualização otimista (mensagem aparece antes da
  confirmação do servidor — importante em ligações lentas)
- Contagem de mensagens por ler, agrupamento por dia

**Rastreamento GPS** — desenhado para rede intermitente
- Motorista partilha localização; posições guardadas em IndexedDB **antes** de
  serem enviadas, por isso nada se perde sem rede
- Envio em lote ao recuperar sinal, com indicação clara de quantas ficaram por enviar
- Frequência adaptativa: 2 min em estrada, 30 s perto do destino, 5 min parado
- Mapa OpenStreetMap (sem chave de API nem custo) com origem, destino,
  percurso real e posição atual
- ETA calculada a partir da velocidade média real das últimas 2 horas
- Aviso honesto quando não há sinal há mais de 90 minutos
- Partições mensais da tabela de posições criadas automaticamente (pg_cron)

**Prova de entrega e avaliações**
- Fotografias, assinatura capturada em canvas, GPS e hora
- Registo explícito de danos — esconder danos gera disputas
- Confirmação pelo comerciante encerra a operação
- Avaliação mútua em 5 critérios, **só permitida após confirmação**
  (avaliar antes transformaria a reputação numa arma de negociação)
- Reputação recalculada por gatilho a cada avaliação

**Administração**
- Fila de verificações pendentes com contexto (documentos, veículos, antiguidade)
- Aprovar ou rejeitar com registo em auditoria e notificação ao utilizador
- Indicadores da plataforma e supervisão de todas as operações
- Alerta de cargas em trânsito sem sinal há mais de 3 horas

**Armazenamento**
- Três buckets **privados**; acesso por URLs assinados temporários
- Caminho começa pelo id da empresa — é assim que as políticas verificam posse

**Automatismos na base de dados**
- Referências `CF-2026-000001` geradas por sequência
- Distância calculada por PostGIS com fator de sinuosidade de 1,25
  (validado: Luanda–Huambo 643 km, Benguela–Lobito 34 km)
- Perfil criado por gatilho no registo — atómico, sem chave `service_role`
- Expiração automática 2 dias após a janela de recolha

---

## Motor de correspondência — como funciona

**Etapa 1 — Filtro rígido** (elimina o impossível)
Empresas diferentes · capacidade suficiente · tipo de veículo compatível ·
refrigeração quando exigida · partida dentro da janela de recolha ·
origem e destino a menos de 75 km do trajeto.

**Etapa 2 — Pontuação 0–100**

| Critério | Peso | Racional |
|---|---|---|
| Proximidade da rota | 40 | O que mais determina se compensa |
| Avaliação | 20 | Sem avaliações = 12/20 (neutro — não penaliza quem começa) |
| Ajuste de datas | 15 | Partir cedo na janela vale mais |
| Aproveitamento | 10 | Evita camião de 30 t para 200 kg |
| Histórico conjunto | 10 | Confiança já construída |
| Viagem de retorno | 5 | **Bónus deliberado** — é o problema que a plataforma existe para resolver |

**Etapa 3 — Apresentação** com a decomposição visível ao utilizador.
Transparência é o que faz confiar na recomendação.

> **Nota sobre "IA":** isto são regras determinísticas, não um modelo. É
> deliberado — um modelo preditivo precisa de histórico que ainda não existe.
> As regras resolvem o problema desde o primeiro dia e produzem exatamente os
> dados de que os modelos precisarão. Ver `../02-ARQUITETURA-TECNICA.md`.

---

## Próximos passos

| Semanas | Entregável |
|---|---|
| 5–6 | Marketplace de viagens + **motor de correspondência** ← momento de demonstração |
| 7–8 | Negociação (propostas) e chat |
| 9–10 | Rastreamento GPS com funcionamento offline |
| 11–12 | Prova de entrega, avaliações, painel de administração |

Âmbito detalhado em `../03-MVP-E-ROADMAP.md`.

---

## Como testar o que está feito

Precisa de duas contas — o produto só faz sentido com os dois lados.

**1. Conta de comerciante**
Criar conta como *Comerciante*. Depois, no SQL Editor do Supabase:
```sql
UPDATE users SET verification = 'APPROVED' WHERE email = 'comerciante@teste.ao';
```

**2. Conta de transportador** (noutro browser ou janela privada)
Criar conta como *Camionista* ou *Empresa transportadora*, e aprovar da mesma forma.

**3. O teste que importa**
- Transportador: **Frota → Adicionar veículo** (ex.: 8000 kg)
- Transportador: **Publicar viagem** Benguela → Luanda, marcar *viagem de retorno*
- Comerciante: **Publicar carga** Benguela → Luanda, 3000 kg, com recolha dentro
  da janela da viagem
- Comerciante: abrir a carga → **deve ver o transportador na lista de
  correspondências**, com pontuação e explicação
- Transportador: abrir a viagem → **deve ver a carga**

Se ambos os lados se veem, o núcleo do produto funciona.

**4. Fechar o negócio** (o ciclo completo)
- Transportador: abrir a carga no marketplace → **Enviar proposta** com preço
  e mensagem
- Comerciante: abrir a carga → ver a proposta com reputação e pontuação →
  **Aceitar**
- Ambos: são levados para a conversa; escrever mensagens de um lado deve
  fazê-las aparecer no outro **sem recarregar a página**

Ao aceitar, verifique na viagem que a capacidade disponível **diminuiu** pelo
peso da carga — é a prova de que a transação foi atómica.

**5. Rastreamento** (o teste mais interessante)
- Transportador: **Entregas** → abrir a carga → **Começar a partilhar**
- Autorizar a localização quando o browser pedir
- Comerciante: **Acompanhar** → deve ver o camião no mapa

**Testar o modo offline** — é o requisito mais importante deste módulo:
1. Com a partilha ativa, abrir as ferramentas de programador (F12)
2. Separador **Network** → mudar de *No throttling* para **Offline**
3. Aguardar 2–3 minutos: o cartão passa a "Sem rede" e mostra quantas
   posições estão guardadas
4. Voltar a *No throttling*: as posições são enviadas automaticamente e
   aparecem no mapa do comerciante

Se as posições registadas offline aparecerem depois, o módulo cumpre o
requisito que mais interessa em Angola.

**6. Fechar a operação**
- Transportador: no rastreio → **Marcar como recolhida** → depois
  **Registar entrega** (nome de quem recebeu, fotografia, assinatura no ecrã)
- Comerciante: **Confirmar receção**
- Ambos: avaliar a contraparte de 1 a 5 estrelas
- Verificar que a média de avaliação aparece no perfil e nas correspondências
  seguintes — é o que faz a reputação ter valor

**7. Administração**
```sql
UPDATE users SET role = 'PLATFORM_ADMIN' WHERE email = 'o-seu-email';
```
Sair e voltar a entrar. O painel passa a mostrar indicadores da plataforma,
e a navegação ganha **Verificações** e **Operações**.

**Dados de teste já existentes**
A base de dados tem um cenário de demonstração (tenants "Teste Comercio",
"Teste Transp 1" e "Teste Transp 2") com uma carga e três viagens que produzem
correspondências de 86 e 55 pontos. Para remover:
```sql
DELETE FROM tenants WHERE slug IN ('t-com','t-tr1','t-tr2');
```

---

## Comandos

```powershell
npm run dev          # desenvolvimento
npm run build        # build de produção
npm run typecheck    # verificar tipos sem compilar
npm run lint         # análise estática
```
