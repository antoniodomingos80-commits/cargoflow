# CargoFlow
## A logística inteligente começa aqui.

**Dossier para investidores e parceiros**
Versão 1.1 · Agosto de 2026 · Benguela, Angola

> Estado verificado a 19 de Agosto de 2026. A secção 8 descreve o que está
> efetivamente em produção; o detalhe módulo a módulo está em `ESTADO-REAL.md`.

---

## Sumário executivo

A CargoFlow é uma plataforma digital que liga quem tem carga para transportar a
quem tem camião disponível — em Angola, onde hoje esse encontro acontece por
telefone e WhatsApp.

O problema é concreto e mensurável: **camiões viajam vazios em cerca de metade
dos percursos** porque não existe forma sistemática de descobrir que carga
existe no sentido inverso. Cada quilómetro em vazio é combustível queimado,
desgaste do veículo e tempo do motorista sem retorno — custo que acaba
repercutido no preço final dos bens.

A CargoFlow resolve isto com um marketplace de dupla face e um motor de
correspondência automática: o comerciante publica a carga, o transportador
publica a viagem, o sistema encontra o par. Em cima disso, constrói-se o que
falta ao setor: rastreamento em tempo real, pagamentos digitais, documentação
eletrónica e indicadores de desempenho.

**A plataforma está construída e no ar.** O ciclo comercial completo — publicar,
corresponder, negociar, acordar, transportar, entregar, avaliar — funciona hoje
em produção, com contas, cargas e acordos reais.

**O pedido:** capital e parceiros para levar a plataforma ao mercado — angariação
de transportadores, piloto de terreno e operação — começando pelo corredor
Luanda–Benguela–Huambo.

---

## 1. O problema

### O que acontece hoje

Um comerciante em Benguela precisa de enviar mercadoria para Luanda. Liga a
três ou quatro contactos conhecidos. Um deles conhece um motorista. Combina-se
preço por telefone, sem referência de mercado. A carga segue sem rastreamento —
o comerciante só sabe que chegou quando alguém liga a confirmar. O pagamento é
em numerário ou transferência, sem garantia para nenhuma das partes. Não há
fatura eletrónica, nem histórico, nem avaliação.

Do outro lado, o camionista que descarregou em Luanda tem duas opções: esperar
dias por uma carga de retorno através dos mesmos contactos informais, ou
regressar vazio. Regressa vazio.

### Os cinco custos deste modelo

| Problema | Consequência |
|---|---|
| **Viagens em vazio** | Combustível e tempo sem receita — o maior desperdício do setor |
| **Descoberta informal** | Depende de quem se conhece, não de quem está disponível |
| **Sem rastreamento** | O dono da carga não sabe onde está a sua mercadoria |
| **Preços opacos** | Sem referência de mercado, cada negociação parte do zero |
| **Sem histórico nem reputação** | A confiança não é transferível para novos parceiros |

O resultado é um mercado onde os custos logísticos são desnecessariamente
altos, e onde a produtividade de cada camião fica muito abaixo do seu potencial.

---

## 2. Porquê agora

Três condições convergem em Angola neste momento, e nenhuma existia há cinco
anos:

**Pagamentos digitais atingiram massa crítica.** O Multicaixa Express passou de
1,8 para 2,7 milhões de utilizadores válidos num ano — um crescimento de quase
50%. Em 2025 processou 2,1 mil milhões de transações. Os meios digitais já
representam praticamente metade de todo o valor movimentado na rede Multicaixa.
Uma plataforma que precisa de cobrar e pagar digitalmente já tem infraestrutura
para o fazer.

**O Estado está a investir na logística.** A Rede Nacional de Plataformas
Logísticas (RNPL) é um programa público de criação de centros logísticos pelo
país. O Ministério dos Transportes tem, no orçamento de 2026, uma verba
significativa para um Portal Estatístico Integrado do setor. Existe vontade
política de modernizar e digitalizar o transporte.

**A digitalização da economia acelerou.** As transações digitais valiam 19% do
PIB angolano em 2019; em 2025 já representavam 32%. O comportamento mudou.

A isto junta-se o enquadramento regional: a Zona de Comércio Livre Continental
Africana (AfCFTA) e os corredores para a RDC, Zâmbia e Namíbia tornam Angola um
ponto de passagem — e o transporte rodoviário é o modo dominante.

---

## 3. A solução

### Como funciona

```
COMERCIANTE                    CARGOFLOW                    TRANSPORTADOR
     │                             │                              │
     │  publica carga              │              publica viagem  │
     │  Benguela → Luanda ────────>│<──────── Benguela → Luanda   │
     │  2 toneladas                │          4 m³ livres, amanhã │
     │                             │                              │
     │                    ┌────────▼────────┐                     │
     │                    │  CORRESPONDÊNCIA │                    │
     │                    │   AUTOMÁTICA     │                    │
     │                    └────────┬────────┘                     │
     │                             │                              │
     │<──── proposta com preço ────┴───── notificação ───────────>│
     │                                                            │
     │            acordo · contrato digital · pagamento           │
     │                             │                              │
     │<─────── rastreamento em tempo real durante a viagem ──────>│
     │                             │                              │
     │         prova de entrega (foto + assinatura + GPS)         │
     │                             │                              │
     │<────────── avaliação mútua · fatura eletrónica ───────────>│
```

### O que a plataforma entrega a cada lado

**Ao comerciante:** encontra transporte sem depender de contactos pessoais;
compara opções e preços; sabe onde está a carga a qualquer momento; recebe
documentação eletrónica; constrói histórico com transportadores de confiança.

**Ao transportador:** descobre carga de retorno em vez de viajar vazio;
recebe pagamento com garantia; constrói reputação que atrai mais trabalho;
gere a frota e os documentos num só lugar.

**À empresa transportadora:** gestão de vários motoristas e veículos,
indicadores de utilização da frota, controlo de custos por rota.

### O que nos distingue

Não é um classificado digital nem um grupo de WhatsApp organizado. A diferença
está em três camadas que só funcionam juntas:

1. **Correspondência automática** — o sistema procura por si, considerando
   origem, destino, capacidade, tipo de veículo, datas, avaliações e histórico.
2. **Confiança estruturada** — identidade verificada, documentos validados,
   avaliações públicas, pagamento com retenção até à entrega confirmada.
3. **Dados que geram valor** — cada viagem alimenta o motor de preços e a
   previsão de procura. Quanto mais se usa, melhor funciona.

---

## 4. Mercado

### Dimensão e crescimento

O mercado global de intermediação digital de frete foi estimado em **4,9 mil
milhões de dólares em 2025**, com projeção de chegar a 8,6 mil milhões em 2035.
Em África, o mercado de logística de frete cresce a um ritmo anual composto de
**6,4%**, impulsionado pelo comércio intra-regional da AfCFTA, urbanização e
comércio eletrónico.

As startups africanas de logística e transporte captaram **1,8 mil milhões de
dólares nos últimos cinco anos** — sinal de que existe apetite de investimento
no problema, mas também que a janela competitiva não fica aberta indefinidamente.

### O nosso mercado inicial

Começamos pelo corredor **Luanda–Benguela–Huambo**, por três razões:

- concentra uma parte significativa do movimento de mercadorias do país;
- é o percurso onde o problema das viagens em vazio é mais visível;
- é onde temos presença e conhecimento do terreno.

A partir daí: Lobito, Lubango, Malanje, e depois os corredores transfronteiriços.

### Referências internacionais que validam o modelo

| Empresa | Mercado | O que valida |
|---|---|---|
| **Uber Freight** | EUA | Correspondência automática à escala |
| **Full Truck Alliance** | China | Marketplace de dupla face líder mundial |
| **Trella** | Egito | Digitalização de frete em contexto africano |
| **FreteBras / CargoX** | Brasil | Mercado emergente com desafios semelhantes |
| **Lori Systems** | Quénia/Nigéria | Logística digital na África Subsariana |

Nenhuma destas opera em Angola. O mercado está por ocupar.

---

## 5. Modelo de negócio

### Fontes de receita

**1. Comissão por transação (receita principal)**
Percentagem sobre cada transporte concretizado através da plataforma.
Alinha o nosso sucesso com o dos utilizadores: só ganhamos quando eles ganham.

**2. Assinatura para empresas transportadoras**
Mensalidade para empresas com frota, dando acesso a gestão de motoristas e
veículos, dashboards de utilização, relatórios de custos e API de integração.

**3. Serviços premium**
- Destaque de cargas e viagens no marketplace
- Seguro de mercadoria contratado no momento da reserva
- Relatórios analíticos avançados
- Antecipação de pagamento ao transportador (factoring)

**4. Dados agregados e anonimizados** (fase posterior)
Índices de preço por corredor, relatórios de mercado — valor para
seguradoras, instituições financeiras e organismos públicos.

### Porque este modelo funciona

A comissão por transação tem uma propriedade importante: **não exige que o
utilizador pague nada antes de obter valor**. Isto é decisivo num mercado onde
a adoção de software pago é baixa e a desconfiança inicial é alta. O
transportador não arrisca nada ao experimentar.

---

## 6. O desafio real: o arranque

Seria desonesto apresentar este projeto sem nomear a sua maior dificuldade.

**Um marketplace de dupla face não tem valor com um só lado.** Um comerciante
que publica carga e não encontra transportadores não volta. Um transportador
que se regista e não encontra cargas desinstala a aplicação. É o problema
clássico do "ovo e da galinha", e é onde a maioria destas plataformas falha.

### Como o resolvemos

**Estratégia de corredor único.** Não lançamos para o país inteiro. Concentramos
todo o esforço inicial num corredor — Luanda–Benguela — até haver densidade
suficiente para que cada publicação encontre resposta em horas, não em dias.

**Angariação manual do lado da oferta.** Antes do lançamento público, contactar
diretamente empresas transportadoras e camionistas independentes do corredor,
registá-los e validar os documentos. Chegar ao dia do lançamento com
transportadores já na plataforma.

**Parceria com um ou dois clientes-âncora.** Um distribuidor ou indústria com
volume regular garante fluxo constante de cargas, que por sua vez atrai e
retém transportadores.

**Comissão zero nos primeiros meses.** Renunciar à receita inicial para
comprar densidade. A receita vem depois, quando a plataforma já é o sítio
natural onde se procura carga.

---

## 7. Roadmap

### Fase 1 — Núcleo (meses 1–3)
Marketplace de cargas e viagens · correspondência automática · chat ·
rastreamento GPS · avaliações · gestão de documentos
**Objetivo:** plataforma utilizável no corredor Luanda–Benguela

### Fase 2 — Confiança e dinheiro (meses 4–6)
Pagamentos Multicaixa Express · carteira digital com retenção · faturação
eletrónica · verificação de identidade (KYC) · contratos com assinatura digital
**Objetivo:** transação completa dentro da plataforma

### Fase 3 — Inteligência (meses 7–12)
Motor de preços · previsão de procura por corredor · sugestão de carga de
retorno · otimização de rotas · dashboards analíticos · aplicação móvel nativa
para motoristas
**Objetivo:** a plataforma passa a recomendar, não só a intermediar

### Fase 4 — Escala (ano 2)
Expansão nacional · multi-empresa · corredores transfronteiriços (RDC, Zâmbia,
Namíbia) · API pública para integração com ERP · IoT e telemática (sensores de
temperatura, tacógrafos, OBD-II)
**Objetivo:** infraestrutura logística de referência em Angola

---

## 8. Estado atual do projeto

*Levantamento de 19 de Agosto de 2026, verificado contra a produção, o código e
a base de dados. O quadro completo módulo a módulo está em `ESTADO-REAL.md`.*

**O que está em produção e a ser usado.** A plataforma está no ar em
`cargoflow-theta.vercel.app`. Funcionam, com dados reais: contas e cinco perfis
de utilizador, marketplace de cargas e de viagens, motor de correspondência
automática, propostas e acordos, mensagens, gestão de frota, documentação com
verificação administrativa, notificações e painel de administração. A
arquitetura é multi-empresa com isolamento de dados garantido na própria base de
dados — Row Level Security em 31 tabelas, não apenas na aplicação.

**O que está publicado mas ainda não foi exercido.** Rastreamento GPS, prova de
entrega e avaliações estão em produção, mas nenhuma operação real passou por
eles ainda. O que falta é o piloto de terreno, não código.

**O que está escrito e à espera de credenciais.** O módulo de pagamentos
(Multicaixa e Stripe) está implementado, com geração de referência e webhooks de
confirmação. Só não está ligado porque as credenciais dependem do registo da
empresa, que está em curso. As notificações por WhatsApp estão no mesmo estado.

**O que é plano e não está construído:** capacidade offline, autenticação
multifator, notificações por email e push, e a camada de inteligência artificial
para correspondência preditiva e preços dinâmicos. Nenhuma destas é necessária
para operar o corredor inicial.

**Prova de execução:** o promotor concebeu, construiu e colocou em produção uma
plataforma de gestão empresarial completa (ERP, CRM, loja online, logística,
recursos humanos e business intelligence) com autenticação multifator,
arquitetura multi-empresa e infraestrutura cloud — do zero ao ar. A capacidade
de execução técnica está demonstrada, não é uma promessa.

**O que falta:** capital e parcerias para a angariação de transportadores, o
piloto de terreno e a operação dos primeiros doze meses. O risco já não é
construir o núcleo — é chegar ao mercado.

---

## 9. O que procuramos

**Capital** para a angariação inicial de transportadores, o piloto de terreno e a
operação nos primeiros doze meses.

**Parceiros estratégicos**, e estes valem tanto como o capital:
- **Empresas transportadoras** dispostas a ser utilizadores fundadores
- **Um cliente-âncora** com volume regular de carga
- **Instituição de pagamentos** para integração Multicaixa Express
- **Seguradora** para o produto de seguro de mercadoria

**Aconselhamento** de quem conhece o setor do transporte rodoviário angolano
por dentro.

---

## 10. Porquê acreditar neste projeto

O problema é real e quantificável — não é uma solução à procura de problema.

O momento é o correto — a infraestrutura de pagamentos digitais existe agora,
e não existia antes.

O modelo está validado noutros mercados — não estamos a inventar uma categoria,
estamos a trazer para Angola uma categoria que já provou funcionar em contextos
comparáveis.

O mercado está por ocupar — nenhum dos operadores internacionais está presente,
e a vantagem de quem conhece o terreno é significativa.

E existe capacidade de execução demonstrada.

---

**CargoFlow — A logística inteligente começa aqui.**

Antonio Domingos · Benguela, Angola
antoniodomingos80@gmail.com

---

### Fontes dos dados de mercado

- [Digital Freight Brokerage Market Size & Share 2026-2035 — GM Insights](https://www.gminsights.com/industry-analysis/digital-freight-brokerage-market)
- [Africa Freight Logistics Market Size, Share & Growth 2034 — Market Data Forecast](https://www.marketdataforecast.com/market-reports/africa-freight-logistic-market)
- [How African transport & logistics startups attracted $1.8 billion in 5 years — TechCabal Insights](https://insights.techcabal.com/how-african-logistics-startups-attracted-1-8-billion-in-5-years/)
- [Multicaixa Express: número de utilizadores cresceu quase 50% em um ano — PTI](https://pti.ao/multicaixa-express-numero-de-utilizadores-cresceu-quase-50-em-um-ano/)
- [Transacções no MULTICAIXA Express atingem 19,7 biliões Kz em 2025 — Economia e Mercado](https://www.economiaemercado.com/artigo/transaccoes-no-multicaixa-express-atingem-19-7-bilioes-kz-em-2025)
- [Meios digitais de pagamentos já movimentam metade do dinheiro da Rede MULTICAIXA — Multicaixa](https://multicaixa.ao/noticias/meios-digitais-de-pagamentos-ja-movimentam-metade-do-dinheiro-da-rede-multicaixa/)
- [Angola Logistics Infrastructure Modernization: RNPL Platforms and PPP Investment Guide 2026 — IndexBox](https://www.indexbox.io/blog/angolas-logistics-platform-network-investment-opportunities-in-2026/)
