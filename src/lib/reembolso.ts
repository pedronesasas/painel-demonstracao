/**
 * As regras de remuneração do suporte.
 *
 * A tela tem que chegar exatamente no número que a regra manda pagar, então
 * a regra mora aqui, num lugar só, e é testada:
 *
 *   Comissão  10% sobre o VALOR LÍQUIDO de cada reembolso revertido.
 *             Líquido = o que a operação recebe da venda, já sem a taxa da
 *             plataforma e sem os tributos. Só vale se o estorno não
 *             acontecer em 15 dias da desistência, e se a reversão foi
 *             trabalho do suporte (há registro de atendimento).
 *
 *   Bônus     valor fixo pela faixa da taxa de reembolso do mês. Taxa =
 *             reembolsos concluídos no mês ÷ vendas aprovadas no mês, todas
 *             as plataformas, duas casas decimais.
 *
 *   Piso      abaixo de 250 vendas no mês, o bônus não é apurado.
 */

import { FUSO_OPERACAO, addDias } from "@/lib/semana";
import { inicioDaDemo } from "@/demo/dados";
import {
  APROVADAS_ALGUM_DIA,
  DEVOLUCOES,
  chavePedido,
  diaDaDevolucao,
  type Plataforma,
  type StatusVenda,
} from "@/lib/financeiro";

export const PERCENTUAL_COMISSAO = 10;
export const CARENCIA_DIAS = 15;
export const PISO_VENDAS_BONUS = 250;
/** Início da regra atual. Meses anteriores são só referência. */
export const INICIO_CONTRATO = inicioDaDemo();

/**
 * Taxa em porcentagem, arredondada em duas casas como a regra manda.
 *
 * O arredondamento não é detalhe: a faixa de R$ 100 vai "até 5,00%
 * inclusive", e 5,004% tem que ser lido como 5,00% para caber nela.
 */
export function taxaContrato(reembolsos: number, vendas: number): number | null {
  if (vendas <= 0) return null;
  return Math.round((reembolsos / vendas) * 10_000) / 100;
}

export type Faixa = {
  bonus: number;
  rotulo: string;
  aceita: (taxa: number) => boolean;
  /** A taxa que a faixa não pode passar. Nulo na pior, que não tem teto. */
  teto: number | null;
};

/**
 * Faixas do bônus, da pior para a melhor.
 *
 * Cada faixa inclui as duas pontas que escreve. Como a taxa sai com duas
 * casas, "acima de 4,00%" é o mesmo que "a partir de 4,01%", e a comparação
 * fica sem buraco entre as faixas.
 */
export const FAIXAS: Faixa[] = [
  { bonus: 0, rotulo: "a partir de 5,01%", aceita: (t) => t > 5, teto: null },
  { bonus: 100, rotulo: "de 4,51% a 5,00%", aceita: (t) => t > 4.5 && t <= 5, teto: 5 },
  { bonus: 200, rotulo: "de 4,01% a 4,50%", aceita: (t) => t > 4 && t <= 4.5, teto: 4.5 },
  { bonus: 350, rotulo: "de 3,50% a 4,00%", aceita: (t) => t >= 3.5 && t <= 4, teto: 4 },
  { bonus: 500, rotulo: "abaixo de 3,50%", aceita: (t) => t < 3.5, teto: 3.5 },
];

export function faixaDaTaxa(taxa: number): Faixa {
  // As faixas cobrem a reta inteira sem buraco; o fallback é defesa, não caso.
  return FAIXAS.find((f) => f.aceita(taxa)) ?? FAIXAS[0]!;
}

export type ProgressoBonus = {
  vendas: number;
  reembolsos: number;
  /** Nula enquanto não houver venda no mês. */
  taxa: number | null;
  faixa: Faixa | null;
  /** Abaixo do piso, o bônus não é apurado — a faixa é só indicativa. */
  abaixoDoPiso: boolean;
  faltamParaPiso: number;
  /** A faixa seguinte, que paga mais. Nula quando já está na melhor. */
  proxima: Faixa | null;
  /** Com as vendas de hoje, quantos reembolsos no mês a próxima faixa comporta. */
  cabemNaProxima: number | null;
  /** Quantas vendas a mais, sem reembolso novo, levam à próxima faixa. */
  vendasParaProxima: number | null;
};

/**
 * Onde o mês está e o que falta para subir de faixa.
 *
 * "Quanto falta" tem duas leituras, e as duas vão para a tela: quantos
 * reembolsos o mês ainda aguenta, e quantas vendas limpas empurram a taxa
 * para baixo. Reembolso concluído não volta atrás — o que muda a taxa daqui
 * para frente é reverter os próximos e vender mais.
 */
export function progressoBonus(vendas: number, reembolsos: number): ProgressoBonus {
  const taxa = taxaContrato(reembolsos, vendas);
  const faixa = taxa === null ? null : faixaDaTaxa(taxa);
  const indice = faixa ? FAIXAS.indexOf(faixa) : -1;
  const proxima = faixa ? (FAIXAS[indice + 1] ?? null) : null;

  const naProxima = (r: number, v: number) => {
    const t = taxaContrato(r, v);
    return t !== null && proxima !== null && faixaDaTaxa(t).bonus >= proxima.bonus;
  };

  let cabemNaProxima: number | null = null;
  let vendasParaProxima: number | null = null;

  if (proxima && vendas > 0) {
    // A taxa só sobe com mais reembolso, então o primeiro que estoura é o limite.
    let k = 0;
    while (k <= vendas && naProxima(k, vendas)) k += 1;
    cabemNaProxima = k - 1 >= 0 ? k - 1 : null;

    // Ponto de partida pela conta direta, conferido pela regra da faixa por
    // causa do arredondamento em duas casas.
    const teto = proxima.teto ?? 3.5;
    let n = Math.max(vendas, Math.floor((reembolsos * 100) / teto) - 2);
    while (!naProxima(reembolsos, n)) n += 1;
    vendasParaProxima = n - vendas;
  }

  return {
    vendas,
    reembolsos,
    taxa,
    faixa,
    abaixoDoPiso: vendas < PISO_VENDAS_BONUS,
    faltamParaPiso: Math.max(0, PISO_VENDAS_BONUS - vendas),
    proxima,
    cabemNaProxima,
    vendasParaProxima,
  };
}

export type VendaDaReversao = {
  valor_bruto: number;
  juros_parcelamento: number;
  /** Líquido informado pela plataforma. Nulo na Plataforma A, que não informa. */
  liquido_plataforma: number | null;
  /**
   * Líquido calculado pela tabela de taxas no banco, quando a plataforma não
   * informa o dela. Na Plataforma A, que não informa o líquido, é a única fonte.
   */
  liquido_estimado?: number | null;
  status: StatusVenda | null;
  /** Quanto dos juros de parcelamento a plataforma devolve (10% na Plataforma B). */
  perc_juros_repassado: number;
};

/**
 * Valor líquido da venda mantida, como a regra define: o que a
 * operação recebe, sem a taxa da plataforma e sem os tributos.
 *
 * O imposto segue a mesma base da dashboard — preço mais os juros que voltam
 * —, para os dois números nunca discordarem. O líquido informado pela
 * plataforma vale primeiro; sem ele, o estimado pela tabela de taxas. Sem
 * nenhum dos dois, a função devolve nulo em vez de chutar.
 */
export function liquidoDaVenda(v: VendaDaReversao, impostoPercentual: number): number | null {
  const liquido = v.liquido_plataforma ?? v.liquido_estimado ?? null;
  if (liquido === null) return null;
  const jurosRepassados = v.juros_parcelamento * (v.perc_juros_repassado / 100);
  const imposto = (v.valor_bruto + jurosRepassados) * (impostoPercentual / 100);
  return Math.max(0, liquido - imposto);
}

/** Se a comissão saiu do líquido estimado pela tabela, e não do informado. */
export function comissaoEstimada(v: VendaDaReversao): boolean {
  return v.liquido_plataforma === null && v.liquido_estimado != null;
}

export function comissaoDaReversao(v: VendaDaReversao, impostoPercentual: number): number | null {
  const liquido = liquidoDaVenda(v, impostoPercentual);
  return liquido === null ? null : liquido * (PERCENTUAL_COMISSAO / 100);
}

export type SituacaoReversao = "confirmada" | "em_carencia" | "anulada" | "sem_registro";

export const SITUACAO_LABEL: Record<SituacaoReversao, string> = {
  confirmada: "Confirmada",
  em_carencia: "Em carência",
  anulada: "Virou estorno",
  sem_registro: "Sem registro de atendimento",
};

/**
 * Se a reversão já rende comissão.
 *
 * - `anulada`: a venda foi estornada depois — não houve reversão de fato.
 * - `sem_registro`: ninguém do suporte registrou atendimento no caso. A Plataforma B
 *   marca como revertido quando o próprio cliente cancela o pedido, e a
 *   regra exclui a desistência que aconteceu sem a atuação do suporte.
 *   O registro é o que prova a atuação.
 * - `em_carencia`: ainda dentro dos 15 dias em que o estorno pode acontecer.
 * - `confirmada`: passou a carência de pé.
 */
export function situacaoReversao(p: {
  revertidaDia: string;
  hoje: string;
  statusVenda: StatusVenda | null;
  comRegistro: boolean;
}): { situacao: SituacaoReversao; confirmaEm: string } {
  const confirmaEm = addDias(p.revertidaDia, CARENCIA_DIAS);
  if (p.statusVenda !== null && DEVOLUCOES.includes(p.statusVenda)) {
    return { situacao: "anulada", confirmaEm };
  }
  if (!p.comRegistro) return { situacao: "sem_registro", confirmaEm };
  return { situacao: p.hoje >= confirmaEm ? "confirmada" : "em_carencia", confirmaEm };
}

export type EventoDoMes = { pedido: string; dia: string };

export type PontoAcumulado = {
  /** Dia do mês, 1 a 31 — para o mês atual e o anterior caírem no mesmo eixo. */
  dia: number;
  vendas: number;
  reembolsos: number;
  taxa: number | null;
};

/**
 * Taxa acumulada no mês, dia a dia.
 *
 * Acumulada, e não a do dia: com vinte vendas num dia, um reembolso a mais
 * move a taxa em cinco pontos. O próprio histórico da operação mostra que, só por
 * acaso, o mês inteiro já oscila entre 3,9% e 8,1% — o dia isolado seria ruído
 * puro.
 */
export function serieAcumulada(
  mesInicio: string,
  ateDia: number,
  vendidos: EventoDoMes[],
  reembolsados: EventoDoMes[],
): PontoAcumulado[] {
  const primeiroDia = (eventos: EventoDoMes[]) => {
    const mapa = new Map<string, string>();
    for (const e of eventos) {
      const atual = mapa.get(e.pedido);
      if (!atual || e.dia < atual) mapa.set(e.pedido, e.dia);
    }
    return [...mapa.values()];
  };
  const diasVenda = primeiroDia(vendidos);
  const diasReembolso = primeiroDia(reembolsados);

  const pontos: PontoAcumulado[] = [];
  for (let d = 1; d <= ateDia; d += 1) {
    const limite = addDias(mesInicio, d - 1);
    if (limite.slice(0, 7) !== mesInicio.slice(0, 7)) break;
    const vendas = diasVenda.filter((x) => x <= limite).length;
    const reembolsos = diasReembolso.filter((x) => x <= limite).length;
    pontos.push({ dia: d, vendas, reembolsos, taxa: taxaContrato(reembolsos, vendas) });
  }
  return pontos;
}

/** O mínimo de uma venda para contar reembolso — sem valor, sem cliente. */
export type LinhaReembolso = {
  id: string;
  plataforma: Plataforma;
  pedido_externo_id: string | null;
  /** Pedido do primeiro item do checkout, na Plataforma A — ver `chavePedido`. */
  pedido_chave?: string | null;
  status: StatusVenda;
  ocorrido_dia: string;
  reembolsado_dia: string | null;
};

/**
 * Vendas e reembolsos de um mês, cada um pela sua data — a mesma regra de
 * `apurar` e da função `suporte_resumo_mes` no banco. Três lugares fazem esta
 * conta; os três precisam chegar no mesmo número, porque é ele que paga o
 * bônus.
 */
export function eventosDoMes(
  linhas: LinhaReembolso[],
  inicio: string,
  fim: string,
  plataforma: Plataforma | "todas" = "todas",
): { vendidos: EventoDoMes[]; reembolsados: EventoDoMes[] } {
  const vendidos: EventoDoMes[] = [];
  const reembolsados: EventoDoMes[] = [];
  const dentro = (dia: string) => dia >= inicio && dia <= fim;

  for (const l of linhas) {
    if (plataforma !== "todas" && l.plataforma !== plataforma) continue;
    const pedido = chavePedido(l);
    if (APROVADAS_ALGUM_DIA.includes(l.status) && dentro(l.ocorrido_dia)) {
      vendidos.push({ pedido, dia: l.ocorrido_dia });
    }
    if (DEVOLUCOES.includes(l.status) && dentro(diaDaDevolucao(l))) {
      reembolsados.push({ pedido, dia: diaDaDevolucao(l) });
    }
  }
  return { vendidos, reembolsados };
}

/** Pedidos distintos — um pedido com order bump é uma venda só. */
export function contarPedidos(eventos: EventoDoMes[]): number {
  return new Set(eventos.map((e) => e.pedido)).size;
}

/** Quantos meses para trás o histórico do suporte mostra, no máximo. */
export const MESES_NO_HISTORICO = 12;

/** Primeiro dia do mês de um horário, no fuso da operação. */
export function mesDoPedido(ts: string): string {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_OPERACAO }).format(new Date(ts));
  return `${dia.slice(0, 7)}-01`;
}

/**
 * Meses do histórico: do atual até o do pedido de reembolso mais antigo, do
 * mais recente para o mais antigo, com no máximo `MESES_NO_HISTORICO`.
 */
export function mesesDoHistorico(solicitadoEm: string[], hoje: string): string[] {
  const atual = `${hoje.slice(0, 7)}-01`;
  const primeiro = solicitadoEm.reduce((min, ts) => {
    const m = mesDoPedido(ts);
    return m < min ? m : min;
  }, atual);

  const meses: string[] = [];
  let m = atual;
  while (meses.length < MESES_NO_HISTORICO) {
    meses.push(m);
    if (m <= primeiro) break;
    const anterior = addDias(m, -1);
    m = `${anterior.slice(0, 7)}-01`;
  }
  return meses;
}
