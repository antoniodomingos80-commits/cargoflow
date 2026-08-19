# Teste em produção — ciclo completo

**URL:** https://cargoflow-theta.vercel.app

## Contas

| Papel | Email |
|---|---|
| Comerciante | antoniodomingos80@gmail.com |
| Transportador | antoniodomingostv26@gmail.com |
| Administrador | antoniodomingos80+admin@gmail.com |

Para estar nos dois papéis ao mesmo tempo: uma janela normal do browser para o
comerciante, uma janela **anónima/privada** para o transportador. São sessões
separadas, não se atrapalham.

---

## Parte A — Testar o motor de correspondência

Já foram geradas correspondências com dados reais (4 à data de 19 de Agosto de
2026). Este guião serve agora para repetir o ciclo de ponta a ponta — em
particular o rastreamento, a prova de entrega e a avaliação, que continuam por
exercer numa operação real.

**Viagem que já existe:** `VG-2026-000005` · Benguela → Luanda · parte a
2026-08-01 · 5101 kg livres · matrícula LD-45-56

### A1. Comerciante publica uma carga compatível

*Cargas → Publicar carga*

| Campo | Valor |
|---|---|
| Título | Paletes de água engarrafada |
| Tipo de carga | Geral |
| Peso | 1500 kg |
| Origem | Benguela |
| Destino | Luanda |
| Recolha entre | 2026-08-01 e 2026-08-03 |
| Orçamento | 180 000 Kz |

**Esperado:** a carga é criada com referência `CF-2026-0000XX` e estado
*Publicada*. A distância Benguela–Luanda deve aparecer preenchida
automaticamente (~490 km).

### A2. Verificar a correspondência dos dois lados

- **Comerciante:** abrir a carga → deve aparecer o transportador sugerido, com
  pontuação e a decomposição ("Proximidade da rota", "Ajuste de datas", etc.)
- **Transportador:** abrir a viagem `VG-2026-000005` → a carga deve aparecer na
  lista de sugestões

**Se não aparecer nada dos dois lados**, o problema é no motor — anotar e parar
aqui.

---

## Parte B — Negociação e chat

### B1. Transportador faz proposta

Na carga sugerida → *Fazer proposta* → 165 000 Kz + mensagem.

### B2. Comerciante contrapropõe

Abrir a proposta → *Contrapropor* → 175 000 Kz.

### B3. Transportador aceita

**Esperado:** a carga passa a *Atribuída*, e a capacidade livre da viagem
desce de 5101 kg para 3601 kg.

### B4. Chat

Trocar mensagens nos dois sentidos. A mensagem deve aparecer do outro lado
**sem recarregar a página** (é o teste do tempo real).

---

## Parte C — Fechar o transporte que já está a meio

A carga `CF-2026-000005` (sacos de cimento, Benguela → Luanda) já está atribuída
desde o teste anterior. Serve para testar a segunda metade do ciclo.

### C1. Transportador: recolher e seguir

*Acompanhar → CF-2026-000005*

1. **Marcar como recolhida**
2. **Partilhar localização** — o browser vai pedir permissão de GPS; aceitar
3. Confirmar que aparece um ponto no mapa e que a percentagem de progresso mexe

> Em computador o GPS é impreciso (usa a rede, não satélite). Se puder, faça
> este passo no telemóvel — abra o mesmo URL e entre com a conta do
> transportador. É assim que vai ser usado na realidade.

### C2. Transportador: prova de entrega

*Marcar como entregue* → tirar/carregar 1 fotografia + assinatura + nome de quem
recebeu.

**Esperado:** a carga passa a *Entregue* e a fotografia fica visível.

### C3. Comerciante: confirmar e avaliar

Abrir a mesma carga → *Confirmar receção* → dar 5 estrelas + comentário.

### C4. Transportador: avaliar o comerciante

Dar 5 estrelas.

**Esperado:** a reputação de ambos passa a 5.00 e o contador de avaliações a 1.

---

## Parte D — Administração

Entrar com a conta de administrador.

1. Ver a lista de documentos pendentes
2. Aprovar os documentos do comerciante (a empresa está com verificação
   *PENDENTE*)
3. Confirmar que a empresa passa a *Aprovada*

---

## O que registar

Para cada passo que falhe, anotar:

- Em que passo estava e com que conta
- A mensagem exata do erro (fotografar o ecrã)
- Se o erro apareceu no ecrã ou só a página ficou parada

Erros de servidor ficam registados no Vercel
(*Project → Logs*) e no Supabase (*Logs → Postgres*).
