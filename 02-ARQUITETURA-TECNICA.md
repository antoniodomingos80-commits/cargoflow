# CargoFlow — Arquitetura Técnica

Documento de suporte ao dossier de investimento. Destina-se a leitores com
perfil técnico (CTO, sócio técnico, consultor de due diligence).

---

## 1. Princípios orientadores

| Princípio | Aplicação prática |
|---|---|
| **Construir para o mercado real** | Rede móvel instável e intermitente em Angola → funcionamento offline obrigatório |
| **Escalar quando for preciso** | Arquitetura modular, não microsserviços prematuros. Um monólito bem organizado escala muito mais do que se pensa |
| **Confiança é infraestrutura** | Segurança e auditoria desde o primeiro dia, não adicionadas depois |
| **Custo operacional baixo** | Serviços geridos em vez de infraestrutura própria — uma pessoa não administra um cluster Kubernetes |

> **Nota sobre pragmatismo:** a especificação original prevê Kubernetes, Kafka e
> microsserviços. São tecnologias corretas — **para a escala errada**. Introduzi-las
> no início multiplica a complexidade sem benefício e é uma das causas mais comuns
> de falha em produtos nesta fase. A arquitetura abaixo suporta com folga os
> primeiros milhares de utilizadores e está desenhada para evoluir para essa
> direção quando os números o justificarem.

---

## 2. Stack tecnológica

### Frontend
```
Next.js 14 (App Router)     framework React com renderização no servidor
TypeScript                  segurança de tipos em todo o código
Tailwind CSS + shadcn/ui    design system consistente e acessível
TanStack Query              gestão de estado do servidor e cache
Zustand                     estado local da aplicação
React Hook Form + Zod       formulários com validação partilhada com o backend
Framer Motion               animações
PWA (Workbox)               instalação no telemóvel e funcionamento offline
```

### Backend
```
Supabase (PostgreSQL gerido)
├── Auth              email, telefone OTP, Google, MFA
├── Row Level Security isolamento multi-empresa ao nível da base de dados
├── Realtime          chat e posições GPS em tempo real
├── Storage           documentos, fotografias, provas de entrega
├── Edge Functions    lógica de negócio (matching, preços, webhooks)
└── Cron              tarefas agendadas (expirar cargas, relatórios)
```

**Porquê Supabase:** dá PostgreSQL real (não uma abstração), autenticação,
armazenamento e tempo real num só serviço gerido. Para uma equipa de uma pessoa,
elimina meses de trabalho de infraestrutura. E como é PostgreSQL padrão, a
migração para infraestrutura própria no futuro é possível sem reescrever a
aplicação — o que não acontece com plataformas proprietárias.

### Serviços externos
```
Mapas          camada de abstração sobre Google Maps / OpenStreetMap
Pagamentos     interface comum → Multicaixa Express, Unitel Money, Stripe
Notificações   Push (Web Push / FCM), Email (Resend), SMS, WhatsApp Business
Observabilidade Sentry (erros), Better Stack (uptime), Vercel Analytics
```

Os pagamentos e mapas são acedidos através de **interfaces abstratas**. Trocar
de fornecedor é implementar uma nova classe, não reescrever a aplicação.

---

## 3. Arquitetura em camadas

```
┌─────────────────────────────────────────────────────────────┐
│  APRESENTAÇÃO                                                │
│  Web PWA (comerciante · transportador · empresa · admin)     │
│  App nativa motoristas (fase 3)                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS · WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│  API                                                         │
│  REST versionada · OpenAPI · autenticação JWT · rate limiting│
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  DOMÍNIO (módulos)                                           │
│  ┌─────────┬─────────┬──────────┬─────────┬───────────────┐ │
│  │ Cargas  │ Viagens │ Matching │ Preços  │ Rastreamento  │ │
│  ├─────────┼─────────┼──────────┼─────────┼───────────────┤ │
│  │ Chat    │ Pagam.  │ Docs     │ Avaliaç.│ Notificações  │ │
│  └─────────┴─────────┴──────────┴─────────┴───────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  DADOS                                                       │
│  PostgreSQL + RLS · Storage · Cache · Auditoria              │
└─────────────────────────────────────────────────────────────┘
```

Cada módulo é independente e comunica por interfaces bem definidas. Quando um
módulo justificar escala própria (o matching é o candidato natural), extrai-se
para serviço separado sem tocar nos restantes.

---

## 4. Multi-tenant: isolamento de dados

Cada empresa é um `tenant`. O isolamento é garantido pela própria base de dados
através de Row Level Security — não por código de aplicação, que é falível.

```sql
-- Exemplo: um utilizador só vê cargas do seu tenant
CREATE POLICY tenant_isolation ON loads
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

**Porque isto importa:** se um programador se esquecer de filtrar por empresa
numa consulta, a base de dados filtra na mesma. A segurança não depende de
ninguém se lembrar.

O marketplace público é a exceção deliberada: cargas e viagens publicadas são
visíveis a todos os utilizadores verificados, por definição. Os dados
operacionais (frota, faturação, motoristas) permanecem isolados.

---

## 5. Motor de correspondência

O componente central. Recebe uma carga publicada e devolve transportadores
compatíveis, ordenados por adequação.

### Como funciona

**Etapa 1 — Filtro rígido** (elimina incompatíveis)
```
corredor geográfico compatível?
capacidade disponível ≥ carga?
tipo de veículo adequado ao tipo de carga?
datas compatíveis?
transportador verificado e ativo?
```

**Etapa 2 — Pontuação** (ordena os restantes)
```
proximidade geográfica     ██████ peso alto
avaliação do transportador ████   peso médio-alto
histórico com este cliente ███    peso médio
adequação de datas         ███    peso médio
competitividade do preço   ██     peso médio-baixo
taxa de conclusão          ██     peso médio-baixo
```

**Etapa 3 — Notificação** aos melhores candidatos.

### Evolução planeada

- **v1:** regras determinísticas com pesos configuráveis (transparente, auditável, funciona sem dados históricos)
- **v2:** os pesos ajustam-se com base em correspondências aceites vs. rejeitadas
- **v3:** modelo preditivo treinado com o histórico acumulado

> **Sobre "Inteligência Artificial":** a especificação original pede IA
> extensivamente. Sendo honesto sobre a sequência correta — um modelo preditivo
> precisa de dados históricos que ainda não existem. A v1 usa regras bem
> desenhadas, que resolvem o problema real desde o primeiro dia e produzem
> exatamente os dados de que os modelos precisarão. Apresentar regras como "IA"
> seria marketing; construir modelos sem dados seria desperdício.

---

## 6. Rastreamento em tempo real

**Desafio:** cobertura móvel intermitente nas estradas angolanas.

**Solução:**
1. A aplicação do motorista regista posições localmente, mesmo sem rede
2. Quando há ligação, sincroniza o lote acumulado
3. O servidor reconstrói o percurso e recalcula a estimativa de chegada
4. Sem sinal prolongado, o comerciante vê a última posição conhecida e o tempo
   decorrido — informação honesta em vez de silêncio

A frequência de envio adapta-se: mais frequente em zona urbana e perto do
destino, menos frequente em estrada aberta (poupa bateria e dados).

---

## 7. Segurança

| Camada | Implementação |
|---|---|
| **Autenticação** | JWT curtos + refresh rotativo em cookie httpOnly; MFA obrigatório para admin e empresas |
| **Autorização** | RBAC por papel + RLS na base de dados (defesa em profundidade) |
| **Dados** | Encriptação em trânsito (TLS 1.3) e em repouso; documentos em storage privado com URLs assinados temporários |
| **Aplicação** | Validação de entrada com Zod; consultas parametrizadas (imune a SQL injection); CSP e cabeçalhos de segurança; rate limiting |
| **Auditoria** | Registo imutável de quem, quando, o quê, IP, antes/depois |
| **Fraude** | Verificação de identidade (KYC), deteção de padrões anómalos, retenção de pagamento até entrega confirmada |

**Recuperação de desastres:** backups automáticos diários com retenção de 30
dias, testados periodicamente. Objetivo de recuperação: menos de 4 horas.

---

## 8. Funcionamento offline

Requisito não negociável neste mercado.

| Funcionalidade | Offline |
|---|---|
| Ver cargas/viagens já carregadas | Sim |
| Ver detalhes de entrega atribuída | Sim |
| Registar posição GPS | Sim (sincroniza depois) |
| Capturar prova de entrega (foto, assinatura) | Sim (sincroniza depois) |
| Publicar carga nova | Fica em fila, envia ao reconectar |
| Chat | Mensagens em fila |
| Procurar no marketplace | Não (requer dados frescos) |

Implementação: Service Worker + IndexedDB + fila de sincronização com resolução
de conflitos.

---

## 9. Escalabilidade — quando e como

A arquitetura atual suporta confortavelmente **as primeiras dezenas de milhares
de utilizadores**. Os pontos de evolução, por ordem de necessidade:

| Sinal | Ação |
|---|---|
| Consultas de marketplace lentas | Cache Redis + índices geoespaciais (PostGIS) |
| Matching a demorar | Extrair para serviço próprio com fila de trabalho |
| Volume de posições GPS elevado | Base de dados de séries temporais para telemetria |
| Múltiplos países | Réplicas de leitura por região |
| Equipa a crescer | Aí sim, considerar separação em serviços |

**Não fazer antes de ser preciso.** Cada uma destas mudanças tem custo de
complexidade que só se justifica quando o problema é real e medido.

---

## 10. Custo operacional estimado (fase inicial)

| Serviço | Escalão |
|---|---|
| Supabase | Gratuito → Pro conforme crescimento |
| Vercel | Gratuito → Pro conforme tráfego |
| Mapas | Camada gratuita generosa; OpenStreetMap como alternativa sem custo |
| Notificações | Camadas gratuitas iniciais |
| Monitorização | Camadas gratuitas |

O custo de infraestrutura na fase inicial é **marginal**. O investimento é
tempo de desenvolvimento e angariação de utilizadores, não servidores.

---

## 11. Preparação para IoT e telemática (fase 4)

A arquitetura reserva um módulo de ingestão de telemetria, desenhado para:

```
Dispositivos ──> Gateway de ingestão ──> Fila ──> Processamento ──> BD séries temporais
(GPS, OBD-II,     (autenticação por      (absorve   (agregação,      (histórico)
 sensores temp.,   dispositivo, MQTT/     picos)     alertas)
 tacógrafos)       HTTP)
```

Casos de uso: cargas refrigeradas com alerta de temperatura, manutenção
preditiva por leitura OBD-II, conformidade de horas de condução por tacógrafo.

Não se constrói agora — mas as decisões de hoje não o impedem amanhã.
