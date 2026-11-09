/**
 * Números por produto.
 *
 * A gestão quer ver, todo mês e separado, quanto veio de cada produto. A conta é a mesma do Dashboard (`apurar`), só que feita
 * produto a produto: a soma da tabela dá o faturamento da tela principal, e
 * um número nunca contradiz o outro.
 *
 * O NOME é a chave. O mesmo produto chega escrito de jeitos diferentes:
 * "PRODUTO 1" numa plataforma e "Produto 1" na outra, nome com espaço
 * duplo, nome com e sem acento. Separar por grafia mostraria
 * o mesmo produto em duas linhas.
 *
 * Anúncio e despesa não entram: não existe dado que diga quanto do anúncio
 * levou a cada produto (ver `recorte.ts`). Por isso a conta para no
 * faturamento líquido, sem lucro nem ROAS.
 */

import {
  APROVADAS_ALGUM_DIA,
  PLATAFORMAS,
  apurar,
  chavePedido,
  type PeriodoApuracao,
  type Plataforma,
  type Taxa,
  type Venda,
} from "@/lib/financeiro";
import { addDias, toISO } from "@/lib/semana";
import { inicioDaDemo } from "@/demo/dados";

/**
 * Chave de agrupamento: sem acento, sem diferença de maiúscula e com um
 * espaço só entre as palavras.
 */
export function chaveProduto(nome: string | null): string {
  if (!nome) return "";
  return nome.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toUpperCase();
}

export const SEM_NOME = "Produto sem nome";

/** A grafia que mais aparece no grupo, com os espaços repetidos limpos. */
function nomeDoGrupo(itens: Venda[]): string {
  const contagem = new Map<string, number>();
  for (const v of itens) {
    const nome = v.produto_nome?.replace(/\s+/g, " ").trim();
    if (nome) contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
  }
  const [maisComum] = [...contagem].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return maisComum?.[0] ?? SEM_NOME;
}

/** Um produto dentro da fatura da Plataforma B. */
export type ItemDaFatura = {
  nome: string;
  /** Preço da oferta, em reais. */
  valor: number;
  orderBump: boolean;
};

/**
 * Os produtos de uma fatura da Plataforma B, lidos de `payload.event.products`.
 *
 * A Plataforma B manda uma fatura por compra, com o produto principal e os order
 * bumps juntos, e o painel grava uma linha por fatura, com o valor somado. O
 * que separa os produtos fica no aviso: cada oferta traz o preço
 * (`amountCents`) e diz se entrou como order bump (`isOrderBump`).
 *
 * Devolve nulo quando o detalhe não existe ou não tem esse formato. É o caso
 * das vendas importadas por planilha, antes da integração.
 */
export function itensDaFatura(produtos: unknown): ItemDaFatura[] | null {
  if (!Array.isArray(produtos) || produtos.length === 0) return null;
  const itens: ItemDaFatura[] = [];
  for (const produto of produtos) {
    const { name, offers } = (produto ?? {}) as { name?: unknown; offers?: unknown };
    if (typeof name !== "string" || !Array.isArray(offers) || offers.length === 0) return null;
    let centavos = 0;
    let orderBump = false;
    for (const oferta of offers) {
      const { amountCents, isOrderBump } = (oferta ?? {}) as {
        amountCents?: unknown;
        isOrderBump?: unknown;
      };
      const valor = Number(amountCents);
      if (!Number.isFinite(valor)) return null;
      centavos += valor;
      if (isOrderBump === true) orderBump = true;
    }
    itens.push({ nome: name, valor: centavos / 100, orderBump });
  }
  return itens;
}

export type VendasAbertas = {
  vendas: Venda[];
  /**
   * Pedidos da Plataforma B sem o detalhe da fatura. A linha segue inteira, com o
   * order bump somado ao principal, e o pedido fica fora da conversão.
   */
  semDetalhe: Set<string>;
};

/**
 * Abre cada fatura da Plataforma B nos produtos que ela contém.
 *
 * Cada produto vira uma linha com a sua fatia da fatura, a mesma fatia no
 * valor, nos juros e no líquido. Assim a soma das linhas continua dando a
 * fatura, e a tabela por produto continua batendo com o Dashboard. A fatia
 * segue o preço de cada oferta, o que também reparte um eventual desconto.
 *
 * A Plataforma A não muda: lá cada produto do checkout já chega como uma venda.
 */
export function abrirFaturas(
  vendas: Venda[],
  itensPorVenda: ReadonlyMap<string, ItemDaFatura[]>,
): VendasAbertas {
  const abertas: Venda[] = [];
  const semDetalhe = new Set<string>();

  for (const v of vendas) {
    if (v.plataforma !== "plataforma_b") {
      abertas.push(v);
      continue;
    }
    const itens = itensPorVenda.get(v.id);
    if (!itens) {
      semDetalhe.add(chavePedido(v));
      abertas.push(v);
      continue;
    }
    const soma = itens.reduce((s, i) => s + i.valor, 0);
    if (itens.length === 1 || soma <= 0) {
      abertas.push(v);
      continue;
    }
    itens.forEach((item, i) => {
      const fatia = item.valor / soma;
      abertas.push({
        ...v,
        id: `${v.id}#${i}`,
        produto_nome: item.nome,
        tipo: item.orderBump ? "bump" : "principal",
        valor_bruto: v.valor_bruto * fatia,
        juros_parcelamento: v.juros_parcelamento * fatia,
        liquido_plataforma: v.liquido_plataforma === null ? null : v.liquido_plataforma * fatia,
        taxa_coprodutor: v.taxa_coprodutor * fatia,
        taxa_afiliado: v.taxa_afiliado * fatia,
        custo_produto: v.custo_produto * fatia,
      });
    });
  }

  return { vendas: abertas, semDetalhe };
}

export type LinhaProduto = {
  chave: string;
  nome: string;
  /** Plataformas em que o produto vendeu ou devolveu no período. */
  plataformas: Plataforma[];
  /** Itens vendidos no período, inclusive os que depois voltaram. */
  vendas: number;
  /** Soma das vendas do período antes de devolver nada. */
  vendido: number;
  /** Quanto saiu, em média, cada venda. Nulo sem venda no período. */
  precoMedio: number | null;
  /** Pedidos com reembolso ou chargeback concluído no período. */
  reembolsos: number;
  valorReembolsado: number;
  /** Reembolsos ÷ pedidos vendidos no período, como no Dashboard. */
  taxaReembolso: number | null;
  faturamentoBruto: number;
  faturamentoLiquido: number;
  /** Fatia do faturamento bruto do período. Nula quando o total não é positivo. */
  participacao: number | null;
};

export type ApuracaoPorProduto = {
  linhas: LinhaProduto[];
  /** As mesmas contas sobre todas as vendas: confere com o Dashboard. */
  total: LinhaProduto;
};

/**
 * Cascata do Dashboard aplicada a cada produto.
 *
 * `universo` segue inteiro para a faixa de taxa da Plataforma A: ela depende do
 * faturamento do mês da plataforma, não do produto. `periodo` decide o que
 * conta onde, como no Dashboard: a venda pela data dela e o reembolso pela
 * data do estorno.
 */
export function apurarPorProduto(
  vendas: Venda[],
  taxas: Taxa[],
  impostoPercentual: number,
  universo: Venda[],
  periodo: PeriodoApuracao,
): ApuracaoPorProduto {
  const grupos = new Map<string, Venda[]>();
  for (const v of vendas) {
    const chave = chaveProduto(v.produto_nome);
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(v);
    else grupos.set(chave, [v]);
  }

  const linha = (chave: string, nome: string, itens: Venda[]): LinhaProduto => {
    const a = apurar(itens, taxas, [], [], impostoPercentual, universo, periodo);
    return {
      chave,
      nome,
      plataformas: PLATAFORMAS.filter(
        (p) => a.porPlataforma[p].pedidosVendidos > 0 || a.porPlataforma[p].pedidosReembolsados > 0,
      ),
      vendas: a.itensVendidos,
      vendido: a.vendasBrutas,
      precoMedio: a.itensVendidos > 0 ? a.vendasBrutas / a.itensVendidos : null,
      reembolsos: a.pedidosReembolsados,
      valorReembolsado: a.reembolsos,
      taxaReembolso: a.pedidosVendidos > 0 ? a.taxaReembolso : null,
      faturamentoBruto: a.faturamentoBruto,
      faturamentoLiquido: a.faturamentoLiquido,
      participacao: null,
    };
  };

  const total = linha("", "Total", vendas);
  const participacao = (bruto: number) =>
    total.faturamentoBruto > 0 ? bruto / total.faturamentoBruto : null;

  const linhas = [...grupos]
    .map(([chave, itens]) => linha(chave, nomeDoGrupo(itens), itens))
    // Produto que no período só teve pix em aberto ou cobrança recusada não
    // vendeu nada: uma linha de zeros só faria ruído.
    .filter((l) => l.vendas > 0 || l.reembolsos > 0)
    .map((l) => ({ ...l, participacao: participacao(l.faturamentoBruto) }))
    .sort(
      (a, b) =>
        b.faturamentoBruto - a.faturamentoBruto ||
        b.vendas - a.vendas ||
        a.nome.localeCompare(b.nome),
    );

  return { linhas, total: { ...total, participacao: participacao(total.faturamentoBruto) } };
}

/** Número da venda na plataforma. Sem número, vai para o fim da fila. */
function numeroDaVenda(v: Venda): number {
  const n = Number(v.pedido_externo_id);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/**
 * O produto principal do pedido e os order bumps que vieram com ele.
 *
 * Na Plataforma B, o próprio aviso marca o order bump (ver `abrirFaturas`). Na
 * Plataforma A, cada produto do checkout chega como uma venda separada e sem marca,
 * mas o checkout cria primeiro a venda do principal, que fica com o menor
 * número do pedido. Isso foi conferido em todos os pedidos com mais de um
 * item. O preço não serve de critério, porque um order bump pode custar mais
 * que o produto principal em que ele entra.
 */
function separarPrincipal(itens: Venda[]): { principal: Venda; bumps: Venda[] } {
  const marcados = itens.filter((v) => v.tipo === "bump");
  const principal = itens.find((v) => v.tipo !== "bump");
  if (marcados.length > 0 && principal) return { principal, bumps: marcados };

  const [primeira, ...demais] = [...itens].sort(
    (a, b) =>
      numeroDaVenda(a) - numeroDaVenda(b) ||
      a.ocorrido_em.localeCompare(b.ocorrido_em) ||
      a.id.localeCompare(b.id),
  );
  return { principal: primeira!, bumps: demais };
}

export type BumpDoProduto = {
  chave: string;
  nome: string;
  /** Pedidos do principal em que o cliente levou este order bump. */
  pedidos: number;
  /** `pedidos` ÷ pedidos do principal. */
  taxa: number;
};

export type ConversaoDoProduto = {
  chave: string;
  nome: string;
  /** Pedidos vendidos no período em que este foi o produto principal. */
  pedidos: number;
  bumps: BumpDoProduto[];
};

export type ConversaoDosBumps = {
  produtos: ConversaoDoProduto[];
  /** Pedidos da Plataforma B sem o detalhe da fatura, que ficaram fora da conta. */
  semDetalhe: number;
};

/**
 * Conversão dos order bumps: em quantos pedidos de cada produto principal o
 * cliente levou também cada order bump.
 *
 * É a conversão de order bump que a gestão acompanha todo mês e antes
 * contava à mão.
 *
 * Conta os pedidos vendidos no período, inclusive os que depois voltaram: a
 * conversão mede a decisão no checkout, e o reembolso tem a conta dele.
 */
export function conversaoDosBumps(
  abertas: VendasAbertas,
  periodo: PeriodoApuracao,
): ConversaoDosBumps {
  const pedidos = new Map<string, Venda[]>();
  for (const v of abertas.vendas) {
    if (!APROVADAS_ALGUM_DIA.includes(v.status)) continue;
    if (v.ocorrido_dia < periodo.inicio || v.ocorrido_dia > periodo.fim) continue;
    const chave = chavePedido(v);
    const itens = pedidos.get(chave);
    if (itens) itens.push(v);
    else pedidos.set(chave, [v]);
  }

  type Grupo = { itens: Venda[]; bumps: Map<string, Venda[]> };
  let semDetalhe = 0;
  const principais = new Map<string, Grupo>();
  for (const [chave, itens] of pedidos) {
    if (abertas.semDetalhe.has(chave)) {
      semDetalhe += 1;
      continue;
    }
    const { principal, bumps } = separarPrincipal(itens);
    const chavePrincipal = chaveProduto(principal.produto_nome);
    const grupo: Grupo = principais.get(chavePrincipal) ?? { itens: [], bumps: new Map() };
    grupo.itens.push(principal);
    // O mesmo order bump duas vezes no pedido conta uma vez só.
    const vistos = new Set<string>();
    for (const b of bumps) {
      const chaveBump = chaveProduto(b.produto_nome);
      if (chaveBump === chavePrincipal || vistos.has(chaveBump)) continue;
      vistos.add(chaveBump);
      grupo.bumps.set(chaveBump, [...(grupo.bumps.get(chaveBump) ?? []), b]);
    }
    principais.set(chavePrincipal, grupo);
  }

  const produtos = [...principais]
    .map(([chave, { itens, bumps }]) => ({
      chave,
      nome: nomeDoGrupo(itens),
      pedidos: itens.length,
      bumps: [...bumps]
        .map(([chaveBump, comBump]) => ({
          chave: chaveBump,
          nome: nomeDoGrupo(comBump),
          pedidos: comBump.length,
          taxa: comBump.length / itens.length,
        }))
        .sort((a, b) => b.pedidos - a.pedidos || a.nome.localeCompare(b.nome)),
    }))
    .sort((a, b) => b.pedidos - a.pedidos || a.nome.localeCompare(b.nome));

  return { produtos, semDetalhe };
}

/**
 * Primeiro mês com as vendas completas no painel.
 *
 * Antes dele, as vendas não estão todas no painel, e um mês pela metade
 * pareceria um mês fraco, não um mês sem dado. Na demonstração, é o primeiro
 * dia do banco gerado.
 */
export const INICIO_DOS_DADOS = inicioDaDemo();

/** Quantos meses a comparação mostra, contando o atual. */
export const MESES_NA_COMPARACAO = 6;

export type Mes = PeriodoApuracao;

/** Os meses da comparação, do mais antigo ao atual, sem passar do início dos dados. */
export function mesesDaComparacao(
  hoje: string,
  quantos = MESES_NA_COMPARACAO,
  desde = INICIO_DOS_DADOS,
): Mes[] {
  const meses: Mes[] = [];
  let inicio = `${hoje.slice(0, 7)}-01`;
  while (meses.length < quantos && inicio >= desde) {
    const [ano, mes] = inicio.split("-").map(Number);
    const fimDoMes = toISO(new Date(ano!, mes!, 0));
    meses.unshift({ inicio, fim: fimDoMes < hoje ? fimDoMes : hoje });
    inicio = `${addDias(inicio, -1).slice(0, 7)}-01`;
  }
  return meses;
}

export type CelulaMes = {
  vendas: number;
  faturamentoBruto: number;
  faturamentoLiquido: number;
};

export type LinhaMensal = {
  chave: string;
  nome: string;
  /** Uma célula por mês, na ordem de `meses`. Nula quando o produto não vendeu nem devolveu. */
  meses: (CelulaMes | null)[];
};

/**
 * Cada produto mês a mês.
 *
 * Os meses saem da mesma `apurarPorProduto`, um por vez, para a coluna de
 * setembro bater com a tabela de setembro lá em cima.
 */
export function comparacaoMensal(
  universo: Venda[],
  taxas: Taxa[],
  impostoPercentual: number,
  meses: Mes[],
): { linhas: LinhaMensal[]; totais: CelulaMes[] } {
  const porMes = meses.map((m) =>
    apurarPorProduto(universo, taxas, impostoPercentual, universo, m),
  );

  const nomes = new Map<string, string>();
  const somaBruta = new Map<string, number>();
  for (const { linhas } of porMes) {
    for (const l of linhas) {
      if (!nomes.has(l.chave)) nomes.set(l.chave, l.nome);
      somaBruta.set(l.chave, (somaBruta.get(l.chave) ?? 0) + l.faturamentoBruto);
    }
  }

  const celula = (l: LinhaProduto): CelulaMes => ({
    vendas: l.vendas,
    faturamentoBruto: l.faturamentoBruto,
    faturamentoLiquido: l.faturamentoLiquido,
  });

  const linhas = [...nomes]
    .map(([chave, nome]) => ({
      chave,
      nome,
      meses: porMes.map(({ linhas: doMes }) => {
        const l = doMes.find((x) => x.chave === chave);
        return l ? celula(l) : null;
      }),
    }))
    .sort(
      (a, b) =>
        (somaBruta.get(b.chave) ?? 0) - (somaBruta.get(a.chave) ?? 0) ||
        a.nome.localeCompare(b.nome),
    );

  return { linhas, totais: porMes.map(({ total }) => celula(total)) };
}

export type CelulaConversao = {
  /** Pedidos do principal no mês. */
  pedidos: number;
  /** Desses, quantos levaram o order bump. */
  comBump: number;
  taxa: number;
};

export type LinhaConversaoMensal = {
  chave: string;
  bump: string;
  principal: string;
  /** Uma célula por mês. Nula quando o principal não teve pedido no mês. */
  meses: (CelulaConversao | null)[];
};

/**
 * A conversão de cada order bump, mês a mês: a comparação que a gestão pediu,
 * daqui para frente sem ninguém contar à mão.
 *
 * Um mês em que o principal vendeu e ninguém levou o order bump aparece como
 * 0%, e não vazio: zero conversão é informação.
 */
export function conversaoMensal(
  abertas: VendasAbertas,
  meses: Mes[],
): { linhas: LinhaConversaoMensal[]; semDetalhe: number[] } {
  const porMes = meses.map((m) => conversaoDosBumps(abertas, m));

  const pedidosDoPrincipal = new Map<string, number>();
  const pares = new Map<
    string,
    { chavePrincipal: string; chaveBump: string; bump: string; principal: string; total: number }
  >();
  for (const { produtos } of porMes) {
    for (const p of produtos) {
      pedidosDoPrincipal.set(p.chave, (pedidosDoPrincipal.get(p.chave) ?? 0) + p.pedidos);
      for (const b of p.bumps) {
        const chave = `${p.chave}|${b.chave}`;
        const par = pares.get(chave) ?? {
          chavePrincipal: p.chave,
          chaveBump: b.chave,
          bump: b.nome,
          principal: p.nome,
          total: 0,
        };
        par.total += b.pedidos;
        pares.set(chave, par);
      }
    }
  }

  const linhas = [...pares]
    .sort(
      ([, a], [, b]) =>
        (pedidosDoPrincipal.get(b.chavePrincipal) ?? 0) -
          (pedidosDoPrincipal.get(a.chavePrincipal) ?? 0) ||
        a.principal.localeCompare(b.principal) ||
        b.total - a.total ||
        a.bump.localeCompare(b.bump),
    )
    .map(([chave, par]) => ({
      chave,
      bump: par.bump,
      principal: par.principal,
      meses: porMes.map(({ produtos }) => {
        const p = produtos.find((x) => x.chave === par.chavePrincipal);
        if (!p) return null;
        const comBump = p.bumps.find((b) => b.chave === par.chaveBump)?.pedidos ?? 0;
        return { pedidos: p.pedidos, comBump, taxa: comBump / p.pedidos };
      }),
    }));

  return { linhas, semDetalhe: porMes.map((c) => c.semDetalhe) };
}
