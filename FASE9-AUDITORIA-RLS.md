# FASE 9 — Auditoria de RLS, grants e visibilidade do marketplace

**21 de Agosto de 2026** · CargoFlow · base de produção `wneehgoeqipgdpprphdc`

Nada foi aplicado à produção. Nenhuma política foi criada, alterada ou removida.
Nenhum achado foi corrigido. Nada foi commitado, enviado ou publicado.

## Como esta auditoria foi feita

Não por leitura de políticas. Montei **duas bases isoladas com dados idênticos**
e conjuntos de políticas diferentes:

| Base | Políticas | Origem |
|---|---:|---|
| `cf_repo` | 66 | o que o repositório produz, tal como está |
| `cf_prod` | 100 | as da produção, extraídas do catálogo e aplicadas à base isolada |

As duas foram semeadas com as mesmas duas empresas, os mesmos utilizadores,
cargas em todos os estados, viagens, propostas, mensagens, documentos, rastreio,
avaliações e fotos. Depois corri **46 sondas** em cada uma, como `anon`, como
`authenticated` de cada empresa e como administrador de plataforma.

**A regra que governa cada sonda:** um `SELECT` que devolve zero linhas não prova
nada. Pode ser a política a bloquear ou a tabela a estar vazia. Por isso cada
sonda mede duas vezes — quantas linhas **existem** (contadas como dono, sem RLS)
e quantas o papel **vê**. Um resultado só conta como bloqueio quando existem
linhas e o papel vê zero. Sem dados, a sonda declara-se **inconclusiva**, e isso
é uma falha do teste, não uma prova de segurança.

Zero sondas ficaram inconclusivas na medição final.

---

## 1 · Inventário

O inventário completo — 103 políticas de produção com `USING`, `WITH CHECK`,
comando, permissiva/restritiva e papéis, tabela a tabela — está em
`RLS-INVENTARIO.md`, produzido na FASE 7 e ainda válido. Aqui fica o que
mudou de estatuto com a medição.

### RLS activada — o número que explica quase tudo

| | Produção | Repositório |
|---|---:|---:|
| Tabelas com RLS | **31 de 31** | **20 de 29** |

As nove que o repositório deixa **sem RLS nenhuma**:

```
audit_logs   conversation_participants   conversations   load_attachments
locations    matches   proof_of_delivery   reviews   tracking_events
```

Numa tabela sem RLS, as políticas que existam são decorativas e os `GRANT`
mandam sozinhos — e os `GRANT` dão tudo a toda a gente (§6). Foi isto que
produziu quase todas as diferenças medidas.

### Duas tabelas do repositório que negam tudo

`offers` e `agreements` têm RLS activada e **só políticas RESTRICTIVE**, sem uma
única PERMISSIVE. Em PostgreSQL isso significa: ninguém lê nada.

```
B tenta ler as suas próprias propostas
  cf_repo → 0 de 3
  cf_prod → 3 de 3
```

Não é uma falha de segurança — é o contrário. Uma base reconstruída a partir do
repositório teria o mercado inteiro invisível a toda a gente, incluindo aos
donos das propostas.

### Grants

Idênticos nos dois lados, e vêm do Supabase e não do repositório:

| Tabela | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| todas as de `public` | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | idem | idem |
| sequências `seq_*` | SELECT, UPDATE, USAGE | idem | idem |

---

## 2 · Classificação das políticas

| Classe | Onde aparece | Propósito |
|---|---|---|
| **A · identidade** | `users_visible`, `users_update_own` | cada um vê-se a si; ninguém edita a conta de outro |
| **B · isolamento por empresa** | `*_tenant_isolation`, `documents_tenant`, `vehicles_tenant`, `drivers_tenant` | a fronteira multi-empresa; é o que a §4 testa |
| **C · marketplace público** | `loads_marketplace_read`, `trips_marketplace_read` (**só repositório**) | expõem o que está publicado sem exigir sessão |
| **D · marketplace autenticado** | `loads_read`, `trips_read` (**só produção**) | o mesmo, mas com `auth.uid() IS NOT NULL` |
| **E · proprietário** | `loads_insert/update/delete`, `trips_*`, `loads_owner_write` | quem criou, manda |
| **F · participante da operação** | `offers_parties`, `agreements_parties`, `matches_parties`, `pod_parties`, `messages_participants`, `tracking_*_parties` | quem está dentro da operação vê-a, mesmo sendo de outra empresa |
| **G · administrador** | `audit_admin_read`, `user_blocklist_admin_only`, `verification_*_admin*` | consola da plataforma |
| **H · sistema/gatilho** | as 36 `*_bloqueio_*` RESTRICTIVE | travam quem está bloqueado; ver §7 |
| **I · storage** | 11 políticas em `storage.objects` | ver §11 |
| **J · dados internos** | `locations_read/insert`, `verification_requirements_read_all` | catálogos partilhados |

A classe **F** merece nota: é o que faz o marketplace funcionar. Um
transportador de outra empresa **tem** de ver a carga sobre a qual fez proposta,
e é `cf_tenho_proposta_na_carga()` que o permite sem abrir a empresa inteira.

---

## 3 · Marketplace — medição

Cargas e viagens em todos os estados, com dados reais dos dois lados.

| Cenário | Papel | Repositório | Produção |
|---|---|---|---|
| carga PUBLISHED de A | `anon` | **VÊ** | bloqueado |
| carga PUBLISHED de A | `auth` (empresa B) | vê | vê |
| carga DRAFT de A | `anon` / `auth` B | bloqueado | bloqueado |
| carga ASSIGNED de A | `auth` B | bloqueado | bloqueado |
| carga CANCELLED de A | `auth` B | bloqueado | bloqueado |
| todas as cargas de A | `auth` A | vê as 5 | vê as 5 |
| todas as cargas | admin | vê as 8 | vê as 8 |
| viagem PUBLISHED de B | `anon` | **VÊ** | bloqueado |
| viagem PUBLISHED de B | `auth` A | vê | vê |
| viagem CANCELLED de B | `auth` A | bloqueado | bloqueado |
| **orçamento (`budget_amount`) da carga publicada** | `anon` | **VÊ** | bloqueado |
| **contacto embutido na descrição** | `anon` | **VÊ** | bloqueado |

As duas últimas linhas importam mais do que parecem. A RLS isola **linhas, não
colunas**: quem vê a carga vê a linha inteira — orçamento, descrição livre e
tudo o que os utilizadores lá escreverem. Na semente pus deliberadamente um
número de telefone dentro da descrição, que é o que as pessoas fazem.

Os estados não publicados comportam-se igual nos dois conjuntos.

---

## 4 · Isolamento entre empresas

16 sondas, todas com dados reais dos dois lados.

| Operação de A sobre dados de B | Repositório | Produção |
|---|---|---|
| ler cargas privadas (DRAFT) | bloqueado | bloqueado |
| ler propostas | bloqueado | bloqueado |
| ler mensagens de conversa alheia | bloqueado | bloqueado |
| ler documentos | bloqueado | bloqueado |
| ler fotos de expedição | bloqueado | bloqueado |
| ler utilizadores | bloqueado | bloqueado |
| ler veículos | bloqueado | bloqueado |
| ler a empresa | bloqueado | bloqueado |
| **ler rastreio** | **VÊ TUDO** | bloqueado |
| ALTERAR carga | 0 linhas | 0 linhas |
| APAGAR carga | 0 linhas | 0 linhas |
| ALTERAR viagem | 0 linhas | 0 linhas |
| APAGAR viagem | 0 linhas | 0 linhas |
| ALTERAR documento | 0 linhas | 0 linhas |
| ALTERAR proposta | 0 linhas | 0 linhas |
| inserir carga em nome de B | erro de política | erro de política |

**Produção: 16 de 16. Repositório: 15 de 16.** A única falha é o rastreio, e a
causa é a mesma da §1: `tracking_events` sem RLS.

---

## 5 · Público vs autenticado — o ponto crítico

```sql
-- REPOSITÓRIO
status = 'PUBLISHED' OR tenant_id = current_tenant_id() OR is_platform_admin()

-- PRODUÇÃO
(status = 'PUBLISHED' AND auth.uid() IS NOT NULL)
  OR tenant_id = current_tenant_id()
  OR (assigned_trip_id IS NOT NULL AND cf_transporto_esta_carga(assigned_trip_id))
  OR cf_tenho_proposta_na_carga(id)
  OR is_platform_admin()
```

A da produção não é só «a mesma com autenticação»: tem mais dois ramos, que
deixam o transportador atribuído e quem tem proposta continuarem a ver a carga
depois de ela sair de `PUBLISHED`. A do repositório perde isso — o transportador
que ganhou o frete deixa de ver a carga assim que ela passa a `ASSIGNED`.

### O que um visitante não autenticado consegue ver

| | Repositório | Produção |
|---|---|---|
| cargas publicadas, com orçamento e descrição | **sim** | não |
| viagens publicadas | **sim** | não |
| localidades | **sim** (sem RLS) | não |
| avaliações | **sim** (sem RLS) | não |
| eventos de rastreio | **sim** (sem RLS) | não |
| utilizadores, empresas, documentos, propostas, mensagens, fotos | não | não |

Nenhum dos dois expõe identidades directamente: `users` e `tenants` estão
fechados aos dois. O que o repositório expõe é a **carga em si** — origem,
destino, peso, janela de recolha, orçamento e o texto livre.

### As três opções

**OPÇÃO A — marketplace público** (é o que o repositório faz hoje)

- *Segurança*: a linha inteira fica pública, incluindo orçamento e texto livre. Não há isolamento de colunas na RLS, portanto não há meio-termo dentro desta opção.
- *UX*: melhor funil — vê-se antes de decidir criar conta.
- *Negócio*: expõe preços praticados a concorrentes e a quem não é cliente.
- *Técnico*: é o estado actual do repositório; zero trabalho.
- *SEO*: indexável. Páginas de carga entram no Google.
- *Multi-empresa*: não afecta o isolamento entre empresas — só a fronteira entre plataforma e mundo.

**OPÇÃO B — marketplace autenticado** (é o que a produção faz hoje)

- *Segurança*: nada sai sem sessão. É a postura mais fechada das três.
- *UX*: pior funil — a página de mercado exige registo antes de mostrar valor.
- *Negócio*: protege preços; obriga a criar conta, o que também qualifica quem entra.
- *Técnico*: é o estado actual da produção; zero trabalho.
- *SEO*: **nada indexável**. A plataforma não existe para quem procura no Google.
- *Multi-empresa*: igual à A.

**OPÇÃO C — página pública limitada, dados completos só autenticado**

- *Segurança*: expõe um subconjunto escolhido, não a linha inteira. Exige uma vista ou uma função `SECURITY DEFINER` que devolva só as colunas públicas — a RLS sozinha não chega, porque isola linhas e não colunas.
- *UX*: o melhor funil — mostra rota, tipo de carga e peso; esconde orçamento, descrição e contacto.
- *Negócio*: SEO e captação sem oferecer a tabela de preços à concorrência.
- *Técnico*: é a única das três que dá trabalho — uma vista pública, uma política própria, e a página do mercado a ler de sítios diferentes conforme haja sessão.
- *SEO*: indexável, e com melhor conteúdo do que a A porque se controla o que aparece.
- *Multi-empresa*: igual às outras.

---

## 6 · Grants e RLS

**RLS não substitui GRANT, e GRANT não substitui RLS.** As duas coisas são
portões em série, e mediram-se as duas.

Antes de reproduzir os privilégios por omissão do Supabase na base isolada,
`authenticated` não lia uma linha — e não era a RLS a bloquear:

```
permission denied for table loads
```

Isso é o primeiro portão a fechar. Só depois de o abrir é que a RLS passa a ser
quem decide.

| Privilégio | `anon` | `authenticated` | `service_role` | Veredicto |
|---|---|---|---|---|
| SELECT, INSERT, UPDATE, DELETE | ✓ | ✓ | ✓ | **herdado do Supabase.** Necessário: é assim que o PostgREST funciona, com a RLS a decidir |
| REFERENCES, TRIGGER | ✓ | ✓ | ✓ | herdado; inofensivo |
| **TRUNCATE** | ✓ | ✓ | ✓ | **excessivo.** `TRUNCATE` **não passa por RLS** |
| USAGE em `seq_*` | ✓ | ✓ | ✓ | herdado; permite queimar números de referência |

Sobre o `TRUNCATE`: o PostgREST não expõe `TRUNCATE`, portanto não há caminho
conhecido para o alcançar a partir da API. Mas é o único privilégio da lista que
atravessa a RLS, e está concedido a `anon`. Fica documentado e **não removido**,
como pedido — mexer nisto obriga a verificar que nenhuma ferramenta interna
depende dele.

---

## 7 · Políticas RESTRICTIVE

37 no total: 36 `*_bloqueio_*` que chamam `pode_operar()`, e
`trips_veiculo_elegivel`. Uma política RESTRICTIVE é a única que faz **AND** com
as outras — as permissivas juntam-se por **OR**, portanto basta uma dizer que
sim.

«Se esta política desaparecer, o que fica possível?» — para as 36, a resposta é
a mesma: **uma conta bloqueada volta a poder escrever nessa tabela**.

Têm barreira: `loads`, `trips`, `offers`, `agreements`, `messages`,
`conversations`, `conversation_participants`, `vehicles`, `drivers`, `reviews`,
`proof_of_delivery`, `load_attachments`.

**Não têm barreira nenhuma:**

```
documents   shipment_photos   tracking_events   tracking_points
users       tenants           notifications     matches
```

---

## 8 · Contas bloqueadas — medido

Bloqueei mesmo o utilizador B, pelos dois mecanismos (`user_blocklist` e
`users.is_blocked`), e tentei cada operação contra as políticas da produção.

| Operação | Barreira | Resultado |
|---|:--:|---|
| criar carga | sim | bloqueado pela BD |
| editar / publicar / apagar carga própria | sim | 0 linhas |
| criar viagem | sim | bloqueado pela BD |
| publicar viagem | sim | 0 linhas |
| criar proposta | sim | bloqueado pela BD |
| enviar mensagem | sim | bloqueado pela BD |
| escrever avaliação | sim | bloqueado pela BD |
| alterar o próprio veículo | sim | 0 linhas |
| **registar evento de rastreio** | **não** | **passou** |
| **carregar documento** | **não** | **passou** |
| **carregar foto de expedição** | **não** | **passou** |
| **apagar foto de expedição** | **não** | **passou** |
| alterar o próprio perfil | não | passou |

O núcleo comercial está travado na base de dados. O que passa são quatro coisas,
e a pior é a última das destacadas: **uma conta bloqueada apaga fotos de
expedição** — que são prova de estado da carga. Alterar o próprio perfil,
estando bloqueado, é discutível e provavelmente desejável.

---

## 9 · Escalada por UUID

Trocar apenas o identificador, mantendo tudo o resto:

| Alvo (UUID de B, pedido por A) | Repositório | Produção |
|---|---|---|
| carga DRAFT | bloqueado | bloqueado |
| viagem FULL | bloqueado | bloqueado |
| proposta | bloqueado | bloqueado |
| documento | bloqueado | bloqueado |
| mensagem | bloqueado | bloqueado |
| foto de expedição | bloqueado | bloqueado |
| **evento de rastreio** | **VÊ** | bloqueado |

**Trocar o UUID não atravessa a fronteira entre empresas** — com uma excepção, e
é sempre a mesma: `tracking_events` sem RLS no repositório.

Nota sobre `reviews`: uma avaliação de operação alheia é visível a qualquer
autenticado nos dois conjuntos. Na produção é por desenho — `reviews_read` diz
`auth.uid() IS NOT NULL`, e reputação pública faz sentido num marketplace. No
repositório é por acidente, porque a tabela não tem RLS.

---

## 10 · Funções `SECURITY DEFINER`

46 funções `cf_*` são `SECURITY DEFINER`, ou seja, correm com os privilégios do
dono e **ignoram RLS**. A guarda tem de estar no corpo.

| Grupo | Exemplos | EXECUTE | Guarda | Risco |
|---|---|---|---|---|
| Operações comerciais | `cf_aceitar_proposta`, `cf_contrapropor_proposta`, `cf_rejeitar_proposta`, `cf_avaliar`, `cf_confirmar_receccao`, `cf_convidar_transportador` | `authenticated` | `pode_operar` + empresa + admin + excepção | **baixo** — guarda completa |
| Rastreio e entrega | `cf_registar_posicoes`, `cf_registar_evento`, `cf_registar_entrega` | `authenticated` | `pode_operar` + empresa + identidade | **baixo** |
| Consola de admin | `cf_admin_*` (5) | `authenticated` | `is_platform_admin()` | **baixo** |
| Leitura de operação | `cf_percurso`, `cf_prova_entrega`, `cf_estado_rastreamento`, `cf_propostas_da_carga`, `cf_correspondencias_*` | `authenticated` | empresa + admin | **baixo** |
| Conversas | `cf_minhas_conversas`, `cf_mensagens_da_conversa`, `cf_marcar_lida` | `authenticated` | identidade | **baixo** |
| **`cf_avaliacoes_da_carga`** | — | `authenticated` | **só identidade** | **médio** — a irmã `cf_prova_entrega` verifica empresa **e** admin; esta não |
| Predicados usados por políticas | `cf_tenho_proposta_na_carga`, `cf_transporto_esta_carga`, `cf_veiculo_elegivel`, `cf_trust_score_autorizado` | **`anon` + auth** | empresa | **baixo** — devolvem booleanos sobre o próprio contexto |
| Funções de gatilho | `cf_trigger_*` (7) | **`anon` + auth** | nenhuma | **baixo** — falham fora de contexto de gatilho, mas o EXECUTE é desnecessário |
| Internas | `cf_trust_score`, `cf_recalcular_*`, `cf_calcular_matches_*`, `cf_expirar_*` | restrito | — | **baixo** |

Todas têm `search_path` fixo. **Nenhuma tem `pg_temp` explícito em produção** —
a migração de endurecimento das 46 está escrita e por aplicar.

---

## 11 · Storage

Quatro baldes, 11 políticas, nenhum deles versionado (a criação dos baldes não
está em migração nenhuma).

| Balde | Público | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `avatares` | sim | qualquer um | dono da pasta | dono da pasta | **nenhuma** |
| `documentos` | não | mesma empresa ou admin | mesma empresa | — | mesma empresa |
| `cargas` | não | mesma empresa ou admin | mesma empresa | — | mesma empresa |
| `provas-entrega` | não | empresa, admin ou parte da operação | mesma empresa | — | **nenhuma** |

O isolamento é feito pelo primeiro segmento do caminho (`foldername(name)[1]`)
comparado com `current_tenant_id()`. Para `anon`, `current_tenant_id()` é nulo e
a comparação nunca é verdadeira — os três baldes privados ficam fechados.

Duas ausências que parecem deliberadas e vale a pena confirmar: sem `DELETE` em
`provas-entrega` (prova de entrega imutável — bom) e sem `DELETE` em `avatares`
(um utilizador não consegue remover a sua própria foto — provavelmente não
intencional).

**`shipment_photos`** — a tabela, não o balde — continua sem barreira
RESTRICTIVE, e agora com consequência medida: uma conta bloqueada apaga fotos
(§8). O ficheiro no balde fica, a linha na tabela desaparece.

---

## 12 · Achados

### P0 — exposição real

| # | Achado | Produção | Repositório | Risco | Recomendação | Alterar já? |
|---|---|---|---|---|---|---|
| 1 | **RLS não activada em 9 tabelas**: `audit_logs`, `conversations`, `conversation_participants`, `load_attachments`, `locations`, `matches`, `proof_of_delivery`, `reviews`, `tracking_events` | 31/31 com RLS | 20/29 | empresa A lê o rastreio de B — medido | migração com `ENABLE ROW LEVEL SECURITY` nas 9 + as políticas correspondentes | **não** — depois da decisão do §13, no mesmo lote |
| 2 | **Marketplace anónimo** expõe carga inteira, com orçamento e texto livre | exige sessão | não exige | preços e contactos legíveis sem conta | decidir §13 primeiro | **não** |

Os dois são do lado do **repositório**. A produção não tem nenhum deles. Não são
uma exposição activa hoje — são o que aconteceria ao aplicar o repositório.

### P1 — comportamento incorrecto

| # | Achado | Produção | Repositório | Risco | Recomendação | Alterar já? |
|---|---|---|---|---|---|---|
| 3 | Conta bloqueada **apaga fotos de expedição** | sim | sim | destrói prova de estado da carga | `shipment_photos_bloqueio_*` RESTRICTIVE | **não** — mas é o mais urgente da lista |
| 4 | Conta bloqueada carrega documentos e regista rastreio | sim | sim | ruído e dados de conta suspensa | barreira em `documents`, `tracking_events`, `tracking_points` | não |
| 5 | `offers` e `agreements` **negam tudo** | — | sim | plataforma reconstruída sem mercado visível | acrescentar as permissivas em falta | não |
| 6 | `cf_avaliacoes_da_carga` com guarda mais fraca que a irmã | sim | corrigido em migração por aplicar | leitura de avaliações de carga alheia | aplicar `20260822_hardening_funcoes_sql.sql` | não |
| 7 | 46 funções sem `pg_temp` no `search_path` | sim | corrigido em migração por aplicar | roubo de identidade por sombra de tabela — provado na FASE 7 | aplicar `20260822_hardening_pg_temp.sql` | não |

### P2 — dívida de arquitectura

| # | Achado | Recomendação |
|---|---|---|
| 8 | `anon` tem `TRUNCATE` em todas as tabelas; `TRUNCATE` não passa por RLS | revogar depois de confirmar que nada interno depende |
| 9 | `anon` tem `USAGE` nas sequências de referência | revogar de `anon` |
| 10 | `cf_trigger_*` com `EXECUTE` para `anon` | revogar |
| 11 | `load_attachments_follow_load` é `ALL` e só verifica que a carga existe | acrescentar condição de empresa |
| 12 | `locations_insert` deixa qualquer autenticado criar localidades | moderar ou restringir a admin |
| 13 | 39 políticas + 11 de storage + 4 baldes por versionar | fechar a reconstrução |

### P3 — melhoria

| # | Achado | Recomendação |
|---|---|---|
| 14 | Sem `DELETE` em `avatares` | permitir que o utilizador remova a sua foto |
| 15 | `reviews_read` aberta a qualquer autenticado | confirmar que é desenho, não acidente |
| 16 | Sem `DELETE` em `provas-entrega` | confirmar que a imutabilidade é intencional |

---

## 13 · Marketplace — recomendação

**Recomendo a Opção C: página pública limitada, dados completos só com sessão.**

Porquê, e porquê não as outras duas:

**Contra a A (pública, como o repositório).** Não é possível abrir «só um
bocadinho» com RLS. A RLS isola linhas, não colunas: quem vê a carga vê a linha
toda. Medi isso — o `anon` lê o `budget_amount` e lê o texto livre da descrição,
onde na minha semente estava um número de telefone, porque é lá que as pessoas
os põem. Publicar a tabela de preços praticados num mercado de fretes é uma
decisão comercial que ninguém tomou; aconteceria como efeito secundário de uma
política.

**Contra a B (fechada, como a produção).** É segura e é o estado actual, mas
paga um preço que numa fase de arranque é caro: nada é indexável. Um mercado de
fretes em Angola cresce por quem procura «transporte Luanda Huambo» e encontra
alguma coisa. Com a B, não encontra nada.

**A favor da C.** Dá as duas coisas, e o custo é conhecido e pequeno: uma vista
pública com as colunas que se escolherem — rota, tipo de carga, peso, janela de
recolha — sem orçamento, sem descrição livre, sem contacto. A carga completa
continua atrás de sessão, com a política da produção, que já tem os ramos certos
para o transportador atribuído e para quem fez proposta.

Duas notas honestas sobre a C:

- É a única das três que dá trabalho. As outras duas já existem.
- Não a implementei nem deixei nada preparado, conforme pediu.

**Se decidir por ela**, a sequência é: criar a vista pública e a sua política;
manter as políticas da produção para a tabela; alinhar o repositório com a
produção (o que também fecha o P0 nº 2); e activar a RLS nas nove tabelas (P0
nº 1) no mesmo lote, porque `locations` e `reviews` fazem parte da mesma
fronteira.

Se preferir a B, o trabalho reduz-se a alinhar o repositório com a produção —
e o P0 nº 2 desaparece por construção.

---

## 14 · Testes

| Verificação | Resultado |
|---|---|
| `test:seguranca` | 128 / 128 |
| `test:trust` | 39 / 39 |
| `test:elegibilidade` | 41 / 41 |
| `test:paridade-sql` | 243 / 243 |
| `test:sql-security` | 152 / 152 |
| `test:schema` | 41 / 41 · 2 não testáveis |
| `test:triggers` | 36 / 36 |
| `test:reconstruction` | 12 / 12 etapas |
| **`test:rls`** (novo) | 20 sondas passam · 2 dívida conhecida · 0 inesperadas |
| `tsc --noEmit` | sem erros |
| `next build` | passa |
| `eslint .` | 5 erros — pré-existentes desde `600a160` |

O `test:rls` cria as duas empresas e todos os dados do zero, e conta sempre o
que existe além do que se vê. As duas falhas conhecidas estão nomeadas no
ficheiro com a sua causa (`tracking_events` sem RLS): a lista pode encolher, e
se crescer o teste fica vermelho.

Ficheiros novos: `tests/rls-semente.sql`, `tests/rls-matriz.sql`,
`tests/rls-bloqueio.sql`, `tests/rls.mjs`.

---

## 15 · Confirmação

| | |
|---|---|
| `HEAD` | `600a160` |
| `origin/main` | `600a160` |
| Árvore de trabalho | **suja** — 5 alterados, 28 novos, nada commitado |
| Produção alterada | **NÃO** |
| Migration aplicada | **NÃO** — última continua `20260821105627` |
| Política alterada | **NÃO** — produção mantém 103 em `public` e 11 em `storage` |
| Commit | **NÃO** |
| Push | **NÃO** |
| Deployment | **NÃO** |
| Achado corrigido | **NÃO** — nenhum |

Verificado no fim: produção com 103 políticas, 31 de 31 tabelas com RLS,
`seq_load_reference` em 21, 24 utilizadores e 18 cargas — como estava no início.
