# Painel Demonstração

Painel de gestão de uma operação de vendas digitais (infoprodutos), construído para centralizar
num só lugar o que antes ficava espalhado em planilhas, prints e mensagens: vendas de duas
plataformas de pagamento, gasto com anúncios, despesas, metas, comissões da equipe e o
atendimento de pedidos de reembolso.

**Esta versão é uma demonstração.** Todos os dados — clientes, equipe, produtos e valores — são
fictícios, gerados no navegador a cada visita (`src/demo`). Não há banco nem login: o painel abre
direto como administrador, e o que for alterado some ao recarregar a página.

## O que tem

- **Dashboard** — faturamento bruto e líquido, lucro, margem, ROAS, ROI, CPA e ticket médio, com
  comparação ao período anterior, ritmo contra a meta do mês e da semana, filtro por plataforma
  e a cascata "do bruto ao lucro".
- **Vendas** — item a item, com taxa da plataforma, imposto e líquido de cada venda.
- **Produtos** — faturamento por produto, conversão de order bump e comparação mês a mês.
- **Vendedora** — o andamento do dia: fila de atendimento do CRM, leads, custo por lead e
  checkouts não concluídos.
- **Suporte** — quadro (kanban) dos pedidos de reembolso, reversões, comissão e bônus do suporte.
- **Custos** — gasto com anúncios por dia e canal, gasto por conta de anúncio, despesas e meses
  anteriores ao painel.
- **Equipe** — vendas, meta e comissão de cada vendedora, por semana e por mês.

## Regras de negócio

As contas moram em funções puras em `src/lib`, cobertas por testes (`bun test`):

- regime de competência: a venda conta no dia da aprovação e o reembolso no dia do estorno;
- taxa de gateway por faixa de faturamento mensal, ou deduzida do líquido informado pela
  plataforma;
- itens de um mesmo checkout agrupados num pedido só;
- rateio do tráfego por plataforma;
- comissão das vendedoras (15% do vendido na semana) e bônus do suporte por faixa da taxa de
  reembolso.

## Stack

React 19, TanStack Start/Router/Query, Tailwind CSS, shadcn/ui e Recharts. Na versão em
produção, Supabase (Postgres com RLS por perfil) e webhooks das plataformas de pagamento.

## Rodar

```bash
bun install
bun run dev     # http://localhost:8080
bun test
bun run build   # gera .vercel/output
```

## Publicar na Vercel

Importe o repositório na Vercel. O build (`vite build`) já sai no formato da Vercel; não precisa
de variável de ambiente.
