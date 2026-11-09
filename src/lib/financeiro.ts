/**
 * Apuração financeira da operação.
 *
 * Tudo aqui é função pura sobre as linhas que vieram do banco: o painel, a
 * tela de consulta e qualquer relatório futuro precisam chegar no mesmo
 * número, e a única forma de garantir isso é ter um lugar só que faz a conta.
 *
 * VOCABULÁRIO (as definições da operação, não as do gateway):
 *
 *   Faturamento Bruto  = venda aprovada − reembolso
 *   Faturamento Líquido = Bruto + juros repassados − taxa de gateway
 *                         − taxas de coprodutor/afiliado − custo de produto
 *                         − imposto
 *   Lucro   = Faturamento Líquido − gastos com anúncios − despesas adicionais
 *   Margem  = Lucro / Faturamento Líquido
 *   ROAS    = Faturamento Bruto / gastos com anúncios
 *   ROI     = Faturamento Líquido / gastos totais
 *
 * Repare que ROAS usa o BRUTO e ROI usa o LÍQUIDO — não é descuido, é a
 * diferença entre medir a eficiência do anúncio e a do negócio inteiro.
 *
 * REGIME: competência. Uma venda entra no dia em que foi aprovada
 * (`ocorrido_dia`), não no dia em que o dinheiro cai. É o que permite casar
 * a venda com o gasto de tráfego que a gerou — em caixa, o tráfego de hoje
 * apareceria contra a venda de trinta dias atrás e o ROAS não diria nada.
 *
 * O reembolso tem a SUA data (`reembolsado_dia`). Uma venda do dia 28
 * devolvida no dia 2 é venda do dia 28 e devolução do dia 2 — duas coisas
 * que aconteceram, cada uma no seu dia. Antes a devolução reusava a data da
 * venda e a venda sumia da receita: o mesmo reembolso saía duas vezes.
 */

export type Plataforma = "plataforma_a" | "plataforma_b";
export type TipoItem = "principal" | "bump" | "upsell";
export type StatusVenda = "aprovada" | "reembolsada" | "chargeback" | "pendente" | "nao_paga";
export type CanalTrafego = "meta" | "google" | "tiktok" | "outro";
export type CategoriaDespesa = "ferramenta" | "equipe" | "estrutura" | "outro";

export const PLATAFORMAS: Plataforma[] = ["plataforma_a", "plataforma_b"];

export const PLATAFORMA_LABEL: Record<Plataforma, string> = {
  plataforma_a: "Plataforma A",
  plataforma_b: "Plataforma B",
};

export const CANAL_LABEL: Record<CanalTrafego, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  outro: "Outro",
};

export const CATEGORIA_LABEL: Record<CategoriaDespesa, string> = {
  ferramenta: "Ferramentas",
  equipe: "Equipe",
  estrutura: "Estrutura",
  outro: "Outros",
};

export const STATUS_LABEL: Record<StatusVenda, string> = {
  aprovada: "Aprovada",
  reembolsada: "Reembolsada",
  chargeback: "Chargeback",
  pendente: "Aguardando pagamento",
  nao_paga: "Não paga",
};

/** Status que devolvem dinheiro que já tinha entrado. */
export const DEVOLUCOES: StatusVenda[] = ["reembolsada", "chargeback"];

/**
 * Status de quem foi venda aprovada em algum momento — inclusive as que
 * depois voltaram. É o denominador da taxa de reembolso: 30 reembolsos em 500
 * vendas é 6%, e não 30 em 470.
 */
export const APROVADAS_ALGUM_DIA: StatusVenda[] = ["aprovada", ...DEVOLUCOES];

export const TIPO_LABEL: Record<TipoItem, string> = {
  principal: "Principal",
  bump: "Order bump",
  upsell: "Upsell",
};

export type Venda = {
  id: string;
  plataforma: Plataforma;
  pedido_externo_id: string | null;
  /**
   * Pedido ao qual o item pertence quando a plataforma manda cada produto do
   * checkout como venda separada (Plataforma A). Nulo no primeiro item do pedido —
   * ver `chavePedido`.
   */
  pedido_chave?: string | null;
  produto_nome: string | null;
  tipo: TipoItem;
  valor_bruto: number;
  juros_parcelamento: number;
  /**
   * Deduções que a operação hoje não tem (sem coprodutor, sem afiliado, sem
   * custo de produto). Ficam em zero e fora da tela, mas entram na cascata:
   * no dia em que existirem, o número se corrige sozinho.
   */
  taxa_coprodutor: number;
  taxa_afiliado: number;
  custo_produto: number;
  /**
   * Líquido do vendedor informado pela plataforma. Quando presente, é ele que
   * define a taxa de gateway — ver `taxaDoItem`. NULL nas plataformas que não
   * informam, e aí vale a tabela negociada.
   */
  liquido_plataforma: number | null;
  parcelas: number;
  metodo_pagamento: string | null;
  status: StatusVenda;
  ocorrido_em: string;
  /** Dia em que a venda foi aprovada. Não muda quando ela é reembolsada. */
  ocorrido_dia: string;
  /**
   * Dia do reembolso ou chargeback. Nulo enquanto a venda está de pé — e em
   * registros antigos, gravados antes desta coluna existir, que caem na data
   * da venda.
   */
  reembolsado_dia: string | null;
  cliente_email: string | null;
  cliente_nome: string | null;
};

/**
 * O pedido de um item: um pedido com order bump é uma venda só.
 *
 * Na Plataforma B os itens do checkout já chegam com o mesmo pedido. Na Plataforma A cada
 * produto chega com código próprio, e o banco grava em `pedido_chave` o pedido
 * do primeiro item (mesmo cliente, até 60 s entre um item e outro). A mesma
 * regra conta pedidos em `suporte_resumo_mes`, e as duas contas precisam
 * chegar no mesmo número, porque é ele que paga o bônus do suporte.
 */
export function chavePedido(v: {
  id: string;
  pedido_externo_id: string | null;
  pedido_chave?: string | null;
}): string {
  return v.pedido_chave ?? v.pedido_externo_id ?? v.id;
}

/** Intervalo apurado, com as duas pontas incluídas. */
export type PeriodoApuracao = { inicio: string; fim: string };

/** Dia em que a devolução conta: o do reembolso, ou o da venda nos registros antigos. */
export function diaDaDevolucao(v: Pick<Venda, "reembolsado_dia" | "ocorrido_dia">): string {
  return v.reembolsado_dia ?? v.ocorrido_dia;
}

export type Taxa = {
  plataforma: Plataforma;
  vigencia_inicio: string;
  faixa_min: number;
  faixa_max: number | null;
  percentual: number;
  fixo_por_venda: number;
  fixo_so_no_principal: boolean;
  perc_juros_repassado: number;
};

export type GastoTrafego = {
  id: string;
  data: string;
  canal: CanalTrafego;
  valor: number;
};

export type Despesa = {
  id: string;
  data: string;
  categoria: CategoriaDespesa;
  descricao: string | null;
  valor: number;
  recorrente: boolean;
};

export const IMPOSTO_PADRAO = 6;

/**
 * Taxa que vale para uma venda.
 *
 * Duas dimensões decidem: a data (taxa renegociada não pode reescrever o
 * passado) e o quanto já se faturou naquela plataforma no mês — a Plataforma A
 * cobra 4,69% até R$30 mil/mês e muda acima disso.
 */
export function taxaVigente(
  taxas: Taxa[],
  plataforma: Plataforma,
  diaISO: string,
  faturamentoMes: number,
): Taxa | null {
  const candidatas = taxas
    .filter((t) => t.plataforma === plataforma && t.vigencia_inicio <= diaISO)
    .sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio));

  const vigencia = candidatas[0]?.vigencia_inicio;
  if (!vigencia) return null;

  const daVigencia = candidatas.filter((t) => t.vigencia_inicio === vigencia);

  const naFaixa = daVigencia.find(
    (t) => faturamentoMes >= t.faixa_min && (t.faixa_max === null || faturamentoMes < t.faixa_max),
  );
  if (naFaixa) return naFaixa;

  // Faturou acima da última faixa cadastrada: usa a faixa mais alta que
  // existe em vez de devolver zero. Subestima o custo, mas sumir com ele da
  // tela é pior — `faixasEstouradas` avisa quando isso acontece.
  return [...daVigencia].sort((a, b) => b.faixa_min - a.faixa_min)[0] ?? null;
}

/**
 * Taxa do gateway de pagamentos por item vendido.
 *
 * Quando a plataforma informa o líquido do vendedor, a taxa é DEDUZIDA dele
 * em vez de calculada pela tabela: o que a Plataforma B depositou é fato, a taxa
 * negociada é expectativa, e as duas divergiram já no primeiro evento real —
 * R$ 10,83 retidos contra R$ 9,21 previstos numa venda de R$ 137,00.
 *
 * Deduzir também captura sozinha qualquer cobrança que ninguém comunicou:
 * taxa por método de pagamento, mudança de plano, promoção que expirou.
 *
 * Os juros repassados entram na conta porque já estão dentro do líquido — o
 * que sobra é exatamente o que a plataforma reteve.
 */
export function taxaDoItem(venda: Venda, taxa: Taxa | null): number {
  if (venda.liquido_plataforma !== null) {
    const retido = venda.valor_bruto + jurosRepassados(venda, taxa) - venda.liquido_plataforma;
    // Líquido maior que o bruto não existe: se acontecer, o dado veio estranho
    // e estimar pela tabela é melhor que gravar taxa negativa.
    if (retido >= 0) return retido;
  }

  if (!taxa) return 0;
  const percentual = venda.valor_bruto * (taxa.percentual / 100);
  // O fixo da Plataforma B pega só o produto principal do pedido; o da Plataforma A pega
  // toda venda.
  const fixo = taxa.fixo_so_no_principal && venda.tipo !== "principal" ? 0 : taxa.fixo_por_venda;
  return percentual + fixo;
}

/**
 * Parte dos juros de parcelamento que volta para a operação.
 *
 * O cliente paga juros por cima do preço para parcelar; esse dinheiro é da
 * plataforma, e ela devolve uma fatia (10% na Plataforma B). Entra como receita —
 * por isso soma, e não subtrai, na cascata.
 */
export function jurosRepassados(venda: Venda, taxa: Taxa | null): number {
  if (!taxa) return 0;
  return venda.juros_parcelamento * (taxa.perc_juros_repassado / 100);
}

/** Chave `plataforma|yyyy-MM` usada para acumular faturamento do mês. */
function chaveMes(v: Venda): string {
  return `${v.plataforma}|${v.ocorrido_dia.slice(0, 7)}`;
}

/**
 * Faturamento aprovado por plataforma e por mês — insumo da escolha de faixa.
 *
 * O acumulado é do mês fechado, não "até esta venda": a fatura da plataforma
 * fecha por mês, e apurar venda a venda daria duas taxas diferentes dentro do
 * mesmo mês.
 */
export function faturamentoPorPlataformaMes(vendas: Venda[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const v of vendas) {
    if (v.status !== "aprovada") continue;
    mapa.set(chaveMes(v), (mapa.get(chaveMes(v)) ?? 0) + v.valor_bruto);
  }
  return mapa;
}

export type ResumoPlataforma = {
  faturamento: number;
  taxas: number;
  pedidos: number;
  /** Quanto do faturamento a plataforma reteve, medido e não estimado. */
  taxaEfetiva: number;
  /** Vendas em que a plataforma informou o líquido, de `itens` no total. */
  comLiquidoInformado: number;
  itens: number;
  /** Pedidos aprovados no período, inclusive os que depois voltaram. */
  pedidosVendidos: number;
  /** Pedidos com reembolso ou chargeback concluído no período. */
  pedidosReembolsados: number;
  /** Valor devolvido no período. */
  reembolsos: number;
};

export type Apuracao = {
  /**
   * Soma das vendas aprovadas no período, antes de devolver nada — inclusive
   * as que depois foram reembolsadas: elas foram venda, e a devolução sai à
   * parte, no dia dela.
   */
  vendasBrutas: number;
  /** Valor devolvido no período, pela data do reembolso. */
  reembolsos: number;
  /** Parte dos reembolsos que veio de estorno de cartão. */
  chargebacks: number;

  /** Cobranças em aberto: pix e boleto gerados, ainda sem pagamento. */
  pendentes: number;
  valorPendente: number;
  /** Cobranças que morreram: vencidas, recusadas, canceladas. */
  naoPagas: number;
  /**
   * Aprovadas sobre aprovadas mais não pagas. As pendentes ficam de fora do
   * denominador de propósito: elas ainda podem virar receita, e contá-las
   * como perda faria a taxa despencar sempre que entrasse um boleto novo.
   */
  taxaAprovacao: number;
  /**
   * Taxa de reembolso da regra do suporte: QUANTIDADE de
   * reembolsos concluídos no período sobre QUANTIDADE de vendas aprovadas no
   * período. É a que paga o bônus, então é a que o painel mostra.
   */
  taxaReembolso: number;
  /** A mesma taxa em reais: quanto do valor vendido voltou. */
  taxaReembolsoValor: number;
  taxaChargeback: number;
  /** Itens aprovados no período, inclusive os que depois voltaram. */
  itensVendidos: number;
  /** Denominador da taxa de reembolso do bônus. */
  pedidosVendidos: number;
  /** Numerador da taxa de reembolso do bônus. */
  pedidosReembolsados: number;
  /** Faturamento Bruto = vendas aprovadas − reembolsos. */
  faturamentoBruto: number;

  receitaJuros: number;
  taxaGateway: number;
  /** Coprodutores + afiliados. Zero enquanto a operação não tiver nenhum. */
  taxaCoprodutores: number;
  custoProduto: number;
  imposto: number;
  /** Faturamento Líquido: o que sobra das vendas depois de toda dedução. */
  faturamentoLiquido: number;

  trafego: number;
  despesasAdicionais: number;
  /** Gastos Totais = anúncios + despesas adicionais. Denominador do ROI. */
  gastosTotais: number;
  lucro: number;

  margem: number;
  roas: number;
  roi: number;
  cpa: number;
  ticketMedio: number;
  /**
   * Receita por cliente. Ocupa o lugar do ARPU enquanto a operação não tem
   * recorrência: sem assinante ativo o ARPU não tem denominador. Difere do
   * ticket médio quando o mesmo cliente compra mais de uma vez.
   */
  receitaPorCliente: number;

  pedidos: number;
  clientes: number;
  itens: number;
  porPlataforma: Record<Plataforma, ResumoPlataforma>;
};

/**
 * Cascata completa do período.
 *
 * `universo` existe para recortes: ao apurar um único dia, a faixa de taxa
 * ainda precisa ser decidida pelo faturamento do mês inteiro, senão um dia
 * fraco cairia na faixa barata e o custo sairia menor do que a plataforma
 * realmente vai cobrar. Por padrão o recorte é o próprio universo.
 *
 * `periodo` diz o que conta onde. Uma linha reembolsada tem duas datas: entra
 * como venda se foi aprovada dentro do período, e como devolução se foi
 * devolvida dentro dele — as duas coisas, uma só, ou nenhuma. Sem `periodo`,
 * toda linha recebida conta nos dois papéis.
 */
export function apurar(
  vendas: Venda[],
  taxas: Taxa[],
  gastos: GastoTrafego[],
  despesas: Despesa[] = [],
  impostoPercentual = IMPOSTO_PADRAO,
  universo: Venda[] = vendas,
  periodo?: PeriodoApuracao,
): Apuracao {
  const porMes = faturamentoPorPlataformaMes(universo);
  const resolverTaxa = (v: Venda) =>
    taxaVigente(taxas, v.plataforma, v.ocorrido_dia, porMes.get(chaveMes(v)) ?? 0);
  const noPeriodo = (dia: string) => !periodo || (dia >= periodo.inicio && dia <= periodo.fim);

  let vendasBrutas = 0;
  let reembolsos = 0;
  let chargebacks = 0;
  let pendentes = 0;
  let valorPendente = 0;
  let naoPagas = 0;
  let receitaJuros = 0;
  let taxaGateway = 0;
  let taxaCoprodutores = 0;
  let custoProduto = 0;
  let itens = 0;
  let itensVendidos = 0;

  const resumoVazio = (): ResumoPlataforma => ({
    faturamento: 0,
    taxas: 0,
    pedidos: 0,
    taxaEfetiva: 0,
    comLiquidoInformado: 0,
    itens: 0,
    pedidosVendidos: 0,
    pedidosReembolsados: 0,
    reembolsos: 0,
  });
  const porPlataforma: Record<Plataforma, ResumoPlataforma> = {
    plataforma_a: resumoVazio(),
    plataforma_b: resumoVazio(),
  };

  // A taxa do bônus conta pedidos: um pedido com order bump é uma venda
  // só, e o reembolso dele é um reembolso só.
  const vendidos = new Set<string>();
  const reembolsados = new Set<string>();
  const vendidosPorPlataforma: Record<Plataforma, Set<string>> = {
    plataforma_a: new Set(),
    plataforma_b: new Set(),
  };
  const reembolsadosPorPlataforma: Record<Plataforma, Set<string>> = {
    plataforma_a: new Set(),
    plataforma_b: new Set(),
  };

  // Ticket médio e CPA contam pedidos, não itens: um pedido com dois order
  // bumps é um cliente só, e contá-lo três vezes derrubaria o ticket e o CPA
  // para um terço do valor real.
  const pedidosGerais = new Set<string>();
  const clientes = new Set<string>();
  const pedidosPorPlataforma: Record<Plataforma, Set<string>> = {
    plataforma_a: new Set(),
    plataforma_b: new Set(),
  };

  for (const v of vendas) {
    const pedido = chavePedido(v);
    const vendidaNoPeriodo = noPeriodo(v.ocorrido_dia);

    // Pendente e não paga nunca foram receita, então não podem sair dela.
    // Tratar "tudo que não é aprovada" como devolução — que era como esta
    // conta funcionava — faria cada pix gerado derrubar o faturamento do dia.
    if (v.status === "pendente") {
      if (vendidaNoPeriodo) {
        pendentes += 1;
        valorPendente += v.valor_bruto;
      }
      continue;
    }
    if (v.status === "nao_paga") {
      if (vendidaNoPeriodo) naoPagas += 1;
      continue;
    }

    if (DEVOLUCOES.includes(v.status)) {
      // Foi venda antes de voltar. Se contasse só como devolução — que era
      // como esta conta funcionava —, a venda sumiria da receita e o reembolso
      // ainda sairia dela: vender e devolver R$ 297 dava −R$ 297, e não zero.
      if (vendidaNoPeriodo) {
        vendasBrutas += v.valor_bruto;
        itensVendidos += 1;
        vendidos.add(pedido);
        vendidosPorPlataforma[v.plataforma].add(pedido);
      }
      if (noPeriodo(diaDaDevolucao(v))) {
        reembolsos += v.valor_bruto;
        if (v.status === "chargeback") chargebacks += v.valor_bruto;
        porPlataforma[v.plataforma].reembolsos += v.valor_bruto;
        reembolsados.add(pedido);
        reembolsadosPorPlataforma[v.plataforma].add(pedido);
      }
      continue;
    }

    // Aprovada fora do período não tem papel nenhum aqui: sem devolução, ela
    // só existe no dia em que foi vendida.
    if (!vendidaNoPeriodo) continue;

    const taxa = resolverTaxa(v);
    const custo = taxaDoItem(v, taxa);

    vendidos.add(pedido);
    vendidosPorPlataforma[v.plataforma].add(pedido);
    itensVendidos += 1;
    vendasBrutas += v.valor_bruto;
    receitaJuros += jurosRepassados(v, taxa);
    taxaGateway += custo;
    taxaCoprodutores += v.taxa_coprodutor + v.taxa_afiliado;
    custoProduto += v.custo_produto;
    itens += 1;

    porPlataforma[v.plataforma].faturamento += v.valor_bruto;
    porPlataforma[v.plataforma].taxas += custo;
    porPlataforma[v.plataforma].itens += 1;
    if (v.liquido_plataforma !== null) porPlataforma[v.plataforma].comLiquidoInformado += 1;
    pedidosPorPlataforma[v.plataforma].add(pedido);
    pedidosGerais.add(pedido);
    // Sem e-mail não dá para saber se é o mesmo cliente; conta como cliente
    // distinto em vez de fundir gente diferente numa pessoa só.
    clientes.add(v.cliente_email?.toLowerCase() ?? pedido);
  }

  for (const p of PLATAFORMAS) {
    porPlataforma[p].pedidos = pedidosPorPlataforma[p].size;
    porPlataforma[p].pedidosVendidos = vendidosPorPlataforma[p].size;
    porPlataforma[p].pedidosReembolsados = reembolsadosPorPlataforma[p].size;
    // Taxa média do período: o que a plataforma reteve sobre o que passou por
    // ela. Com líquido informado é medição; sem, repete a tabela.
    porPlataforma[p].taxaEfetiva =
      porPlataforma[p].faturamento > 0 ? porPlataforma[p].taxas / porPlataforma[p].faturamento : 0;
  }

  const faturamentoBruto = vendasBrutas - reembolsos;

  // Imposto sobre receita bruta: o preço dos produtos mais os juros que a
  // plataforma repassou, já descontado o que voltou como reembolso.
  const imposto = (faturamentoBruto + receitaJuros) * (impostoPercentual / 100);

  const faturamentoLiquido =
    faturamentoBruto + receitaJuros - taxaGateway - taxaCoprodutores - custoProduto - imposto;

  const trafego = gastos.reduce((s, g) => s + g.valor, 0);
  const despesasAdicionais = despesas.reduce((s, d) => s + d.valor, 0);
  const gastosTotais = trafego + despesasAdicionais;
  const lucro = faturamentoLiquido - gastosTotais;

  const pedidos = pedidosGerais.size;

  const fechadas = itens + naoPagas;

  return {
    vendasBrutas,
    reembolsos,
    chargebacks,
    pendentes,
    valorPendente,
    naoPagas,
    taxaAprovacao: fechadas > 0 ? itens / fechadas : 0,
    taxaReembolso: vendidos.size > 0 ? reembolsados.size / vendidos.size : 0,
    taxaReembolsoValor: vendasBrutas > 0 ? reembolsos / vendasBrutas : 0,
    taxaChargeback: vendasBrutas > 0 ? chargebacks / vendasBrutas : 0,
    itensVendidos,
    pedidosVendidos: vendidos.size,
    pedidosReembolsados: reembolsados.size,
    faturamentoBruto,
    receitaJuros,
    taxaGateway,
    taxaCoprodutores,
    custoProduto,
    imposto,
    faturamentoLiquido,
    trafego,
    despesasAdicionais,
    gastosTotais,
    lucro,
    margem: faturamentoLiquido > 0 ? lucro / faturamentoLiquido : 0,
    roas: trafego > 0 ? faturamentoBruto / trafego : 0,
    roi: gastosTotais > 0 ? faturamentoLiquido / gastosTotais : 0,
    cpa: pedidos > 0 ? trafego / pedidos : 0,
    ticketMedio: pedidos > 0 ? faturamentoBruto / pedidos : 0,
    receitaPorCliente: clientes.size > 0 ? faturamentoBruto / clientes.size : 0,
    pedidos,
    clientes: clientes.size,
    itens,
    porPlataforma,
  };
}

export type LinhaDiaria = {
  data: string;
  faturamento: number;
  trafego: number;
  lucro: number;
  pedidos: number;
};

/** Linhas que têm algo a dizer sobre um dia: vendidas nele ou devolvidas nele. */
export function linhasDoDia(vendas: Venda[], dia: string): Venda[] {
  return vendas.filter(
    (v) => v.ocorrido_dia === dia || (DEVOLUCOES.includes(v.status) && diaDaDevolucao(v) === dia),
  );
}

/** Série diária para o gráfico, com os dias sem venda preenchidos com zero. */
export function serieDiaria(
  dias: string[],
  vendas: Venda[],
  taxas: Taxa[],
  gastos: GastoTrafego[],
  despesas: Despesa[] = [],
  impostoPercentual = IMPOSTO_PADRAO,
): LinhaDiaria[] {
  return dias.map((data) => {
    const a = apurar(
      linhasDoDia(vendas, data),
      taxas,
      gastos.filter((g) => g.data === data),
      despesas.filter((d) => d.data === data),
      impostoPercentual,
      vendas,
      { inicio: data, fim: data },
    );
    return {
      data,
      faturamento: a.faturamentoBruto,
      trafego: a.trafego,
      lucro: a.lucro,
      pedidos: a.pedidos,
    };
  });
}

/**
 * Plataformas que faturaram acima da última faixa cadastrada no mês.
 *
 * Quando isso acontece a taxa aplicada é a mais alta conhecida, que é menor
 * que a real — o custo do painel fica otimista até alguém cadastrar a faixa
 * seguinte. A tela usa isto para avisar em vez de mentir em silêncio.
 */
export function faixasEstouradas(
  vendas: Venda[],
  taxas: Taxa[],
): { plataforma: Plataforma; mes: string; faturamento: number }[] {
  const alertas: { plataforma: Plataforma; mes: string; faturamento: number }[] = [];

  for (const [chave, faturamento] of faturamentoPorPlataformaMes(vendas)) {
    const [plataforma, mes] = chave.split("|") as [Plataforma, string];
    const teto = taxas
      .filter((t) => t.plataforma === plataforma)
      .reduce<number | null>((maior, t) => {
        if (t.faixa_max === null) return null; // existe faixa sem teto
        return maior === null ? null : Math.max(maior, t.faixa_max);
      }, 0);

    if (teto !== null && faturamento >= teto) {
      alertas.push({ plataforma, mes, faturamento });
    }
  }
  return alertas;
}

export function formatPercent(v: number): string {
  return `${(v * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function formatMultiplo(v: number): string {
  return `${v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}x`;
}
