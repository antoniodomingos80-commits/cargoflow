# CargoFlow — Dossier do Projeto

**A logística inteligente começa aqui.**

Versão 1.0 · Agosto de 2026 · Benguela, Angola

---

## Documentos

| # | Documento | Para quem | Conteúdo |
|---|---|---|---|
| **01** | [Dossier para Investidores](01-DOSSIER-INVESTIDORES.md) | Investidores, parceiros, clientes-âncora | Problema, mercado com dados reais, solução, modelo de negócio, roadmap, pedido |
| **02** | [Arquitetura Técnica](02-ARQUITETURA-TECNICA.md) | CTO, sócio técnico, due diligence | Stack, arquitetura, segurança, escalabilidade, custos |
| **03** | [MVP e Roadmap](03-MVP-E-ROADMAP.md) | Execução | O que se constrói primeiro, o que fica de fora, cronograma, riscos |
| **04** | [Modelo de Dados](04-MODELO-DE-DADOS.sql) | Desenvolvimento | Esquema PostgreSQL completo do MVP com RLS multi-empresa |

---

## Como usar este dossier

**Para uma reunião com investidor:** leve o documento 01. É autónomo e
completo. O 02 fica de reserva para quando aparecer alguém técnico.

**Para começar a construir:** documento 03 define o âmbito, documento 04 é o
esquema que se aplica na base de dados no primeiro dia.

**Para recrutar um sócio técnico:** documentos 02 + 03 + 04 mostram que o
projeto está pensado a sério, não é uma ideia vaga.

---

## Resumo do posicionamento

> Em Angola, camiões viajam vazios em cerca de metade dos percursos porque não
> existe forma sistemática de descobrir que carga existe no sentido inverso.
> A CargoFlow liga quem tem carga a quem tem espaço — automaticamente.

**Mercado:** intermediação digital de frete vale 4,9 mil milhões USD globalmente;
África cresce a 6,4% ao ano; startups africanas de logística captaram 1,8 mil
milhões USD em cinco anos. Nenhum operador internacional está em Angola.

**Momento:** o Multicaixa Express passou de 1,8 para 2,7 milhões de utilizadores
num ano. A infraestrutura de pagamentos digitais existe agora — não existia há
cinco anos.

**Estratégia:** um corredor de cada vez, começando por Luanda–Benguela.
Densidade antes de expansão.

---

## O que este dossier assume, e o que não assume

**Assume:** que o problema das viagens em vazio é real e significativo em Angola.
Isto está fundamentado na experiência do setor e é consistente com o que se
observa em mercados comparáveis.

**Não assume:** números específicos de dimensão do mercado angolano de
transporte rodoviário, porque não existem estatísticas públicas fiáveis. O
documento evita deliberadamente inventar projeções financeiras detalhadas —
seria mais impressionante e menos honesto.

**Recomendação:** antes de reuniões formais de investimento, fazer 15 a 20
entrevistas com transportadores e comerciantes do corredor Luanda–Benguela.
Isso produz dados primários — percentagem real de viagens em vazio, preços
praticados, tempo médio para encontrar carga — que valem mais do que qualquer
relatório de mercado e transformam o dossier.

---

## Próximos passos sugeridos

1. **Validação de terreno** — entrevistas com transportadores e comerciantes
2. **Refinar o dossier** com os dados primários recolhidos
3. **Identificar cliente-âncora** — um distribuidor com volume regular
4. **Conversas com investidores e parceiros**
5. **Piloto de terreno** — a Fase 1 está construída e em produção (ver `ESTADO-REAL.md`); falta exercê-la numa operação real

---

Antonio Domingos · antoniodomingos80@gmail.com · Benguela, Angola
