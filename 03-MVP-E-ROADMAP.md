# CargoFlow — Âmbito do MVP e Roadmap de Execução

Documento operacional. Define exatamente o que se constrói primeiro, o que
fica de fora, e em que ordem — assumindo execução por uma pessoa com apoio de IA.

---

## A regra que governa este documento

> **Tudo o que não seja essencial para a primeira transação real acontecer
> fica para depois.**

Uma plataforma com dez funcionalidades a funcionar bem vale infinitamente mais
do que cinquenta a meio. A tentação de construir tudo é o maior risco deste
projeto.

---

## Fase 1 — Núcleo (meses 1–3)

**Objetivo:** um comerciante em Benguela publica carga, um transportador aceita,
a carga é transportada e ambos avaliam a experiência. Ponta a ponta, na plataforma.

### Entra

**Contas e identidade**
- Registo por email e telefone (OTP)
- Perfis: Comerciante · Transportador · Empresa · Administrador
- Carregamento de documentos (carta de condução, livrete, seguro)
- Validação manual pelo administrador (automática só na fase 2)

**Marketplace de cargas**
- Publicar carga: origem, destino, peso, volume, tipo, datas, fotografias
- Listar e filtrar cargas disponíveis
- Editar e cancelar

**Marketplace de viagens**
- Publicar viagem: rota, veículo, capacidade livre, data, preço indicativo
- Listar e filtrar

**Correspondência**
- Motor de regras (filtro rígido + pontuação)
- Notificação aos transportadores compatíveis
- Notificação ao comerciante quando surge viagem compatível

**Negociação e acordo**
- Proposta de preço, contraproposta, aceitação
- Registo do acordo (contrato digital simples, sem assinatura eletrónica ainda)

**Chat**
- Texto, imagens, localização
- Notificações
- Histórico por operação

**Rastreamento**
- Envio de posição GPS pela app do motorista
- Mapa em tempo real para o comerciante
- Estimativa de chegada
- Funcionamento offline com sincronização

**Prova de entrega**
- Fotografia, assinatura, GPS, data/hora
- Confirmação pelo comerciante

**Avaliações**
- Classificação mútua de 1 a 5 estrelas com comentário
- Média visível no perfil

**Administração**
- Aprovar utilizadores e documentos
- Ver operações em curso
- Resolver disputas manualmente

**Base técnica**
- PWA instalável, funcionamento offline
- Multi-tenant com RLS desde o início
- Auditoria de ações sensíveis
- Português (estrutura pronta para inglês e francês)

### Não entra na fase 1

| Fica para | Porquê |
|---|---|
| Pagamentos na plataforma | Fase 1: pagam como já pagam hoje. Validar o transporte primeiro |
| IA preditiva | Não há dados históricos. As regras resolvem o problema agora |
| Leilões | Negociação direta é suficiente para validar |
| Faturação eletrónica | Requer enquadramento fiscal — fase 2 |
| Seguros | Requer parceria com seguradora |
| Gestão de frota detalhada | Manutenção, pneus, consumos — fase 3 |
| BI avançado | Indicadores básicos chegam. Sem operações não há o que analisar |
| App nativa | PWA chega para validar |
| OCR de documentos | Validação manual funciona no volume inicial |
| API pública | Ninguém pede integração antes de a plataforma ser relevante |
| IoT e telemática | Fase 4 |
| Control Tower | Faz sentido com centenas de veículos, não com dezenas |

---

## Fase 2 — Confiança e dinheiro (meses 4–6)

**Objetivo:** o dinheiro passa a circular dentro da plataforma. É aqui que
começa a receita.

- Integração Multicaixa Express
- Carteira digital com retenção (pagamento retido até entrega confirmada)
- Comissão automática
- Faturação eletrónica
- KYC com verificação automática de documentos (OCR)
- Contratos com assinatura eletrónica
- Sistema de disputas estruturado
- Dashboards financeiros por perfil

---

## Fase 3 — Inteligência (meses 7–12)

**Objetivo:** a plataforma passa de intermediária a conselheira.

- Motor de preços (sugestão baseada em histórico real)
- Previsão de procura por corredor
- Sugestão automática de carga de retorno ← *elimina viagens em vazio, o problema central*
- Otimização de rotas
- Previsão de risco de atraso
- Deteção de fraude por padrões
- Gestão de frota completa (manutenção, consumos, custos)
- Business Intelligence com indicadores internacionais (OTIF, Empty Miles, Revenue/km)
- **Aplicação nativa para motoristas** (GPS em segundo plano, offline robusto)

---

## Fase 4 — Escala (ano 2)

- Expansão nacional e corredores transfronteiriços
- Multi-moeda e multi-idioma ativos
- API pública documentada + webhooks
- Integrações (ERP, Power BI, WhatsApp Business)
- IoT e telemática
- Control Tower nacional

---

## Ordem de construção dentro da Fase 1

Sequência pensada para ter algo demonstrável o mais cedo possível — importante
para conversas com investidores e utilizadores fundadores.

```
Semanas 1–2    Fundação
               Projeto, base de dados, autenticação, multi-tenant, design system
               ▸ Entregável: login funcional com os 4 perfis

Semanas 3–4    Marketplace de cargas
               Publicar, listar, filtrar, editar
               ▸ Entregável: comerciante publica carga real

Semanas 5–6    Marketplace de viagens + correspondência
               Publicar viagem, motor de matching, notificações
               ▸ Entregável: DEMONSTRAÇÃO — carga encontra transportador
                 (é este o momento que convence investidores)

Semanas 7–8    Negociação e chat
               Propostas, acordo, mensagens
               ▸ Entregável: acordo fechado dentro da plataforma

Semanas 9–10   Rastreamento
               GPS, mapa, ETA, offline
               ▸ Entregável: seguir uma viagem em tempo real

Semanas 11–12  Fecho do ciclo
               Prova de entrega, avaliações, painel de administração
               ▸ Entregável: primeira operação completa ponta a ponta

Semana 13      Preparação de lançamento
               Testes, correções, angariação dos primeiros transportadores
```

---

## Riscos e mitigação

| Risco | Probabilidade | Mitigação |
|---|---|---|
| **Arranque do marketplace** (ovo e galinha) | Alta | Corredor único · angariação manual · cliente-âncora · comissão zero inicial |
| **Adoção pelos motoristas** (literacia digital) | Média-alta | Interface muito simples · onboarding presencial · WhatsApp como canal de apoio |
| **Desconfiança nos pagamentos digitais** | Média | Fase 1 sem pagamentos na plataforma. Introduzir só depois de confiança estabelecida |
| **Cobertura de rede nas estradas** | Alta | Offline desde o primeiro dia — requisito, não funcionalidade |
| **Concorrente internacional entra em Angola** | Baixa-média | Vantagem de terreno e velocidade. Ocupar o corredor antes |
| **Execução solo — capacidade limitada** | Alta | Âmbito rigorosamente controlado · serviços geridos · não construir o que se pode comprar |
| **Enquadramento fiscal e legal** | Média | Consultar contabilista e jurista antes da fase 2 (pagamentos) |

---

## Critérios de sucesso da Fase 1

Não são metas de vaidade. São os sinais que dizem se o produto merece continuar:

| Indicador | O que significa |
|---|---|
| Transportadores verificados ativos no corredor | Existe oferta |
| Cargas publicadas por semana | Existe procura |
| **% de cargas que encontram transportador em menos de 24h** | ← **o indicador que verdadeiramente importa** |
| Operações concluídas ponta a ponta | O produto funciona |
| Avaliação média das duas partes | A experiência é boa |
| % de utilizadores que repetem | Há retenção |

Se as cargas encontram transporte depressa e as pessoas voltam, o negócio existe.
Se não, nenhuma funcionalidade adicional resolve isso — e é melhor saber cedo.

---

## Nota sobre execução solo com IA

É viável — está demonstrado pela plataforma NEVAQUA — mas exige disciplina:

- **Âmbito fechado.** A tentação de adicionar funcionalidades é o principal
  inimigo do lançamento.
- **Comprar em vez de construir.** Autenticação, armazenamento, mapas,
  pagamentos, notificações: usar serviços existentes.
- **Testar continuamente.** Sem equipa de QA, os testes automatizados são a
  única rede de segurança.
- **Angariar em paralelo.** As semanas de construção devem ser também semanas
  de conversas com transportadores. Chegar ao lançamento com utilizadores já
  à espera.
