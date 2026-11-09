/**
 * O filtro por plataforma da dashboard.
 *
 * Receita, taxa, imposto e reembolso são de uma plataforma ou de outra — dá
 * para separar linha a linha. O TRÁFEGO NÃO É: a mesma campanha vende um produto
 * na Plataforma B e outro na Plataforma A, e não existe dado que diga quanto do
 * anúncio levou a cada checkout.
 *
 * Por isso, com uma plataforma filtrada, o tráfego entra RATEADO pela
 * participação dela no faturamento do período. Jogar o anúncio inteiro em
 * cima de uma plataforma a faria parecer dar prejuízo com uma venda que
 * também foi para a outra.
 *
 * O limite do rateio: ele dá às duas plataformas a mesma proporção de
 * anúncio por real vendido, por construção. Mostra quanto do lucro vem de
 * cada uma — não qual é mais eficiente. Para comparar eficiência, o tráfego
 * sai (`contarTrafego = false`) e sobra a margem de contribuição.
 *
 * Despesas fixas e folha são da operação inteira: saem do recorte.
 */

import {
  apurar,
  type Despesa,
  type GastoTrafego,
  type Plataforma,
  type Venda,
} from "@/lib/financeiro";
import type { DadosFinanceiros, Periodo } from "@/lib/useFinanceiro";

export type Recorte = "todas" | Plataforma;

export type DadosRecortados = {
  vendas: Venda[];
  universo: Venda[];
  gastos: GastoTrafego[];
  despesas: Despesa[];
  /**
   * Fatia da plataforma no faturamento bruto do período, de 0 a 1. Nula
   * quando não há recorte — aí não existe rateio nenhum.
   */
  participacao: number | null;
};

export function recortar(
  dados: DadosFinanceiros,
  periodo: Pick<Periodo, "inicio" | "fim">,
  recorte: Recorte,
  contarTrafego: boolean,
): DadosRecortados {
  if (recorte === "todas") {
    return {
      vendas: dados.vendas,
      universo: dados.universo,
      gastos: dados.gastos,
      despesas: dados.despesas,
      participacao: null,
    };
  }

  const daPlataforma = dados.vendas.filter((v) => v.plataforma === recorte);
  const bruto = (vendas: Venda[]) =>
    apurar(vendas, dados.taxas, [], [], dados.impostoPercentual, dados.universo, periodo)
      .faturamentoBruto;

  const total = bruto(dados.vendas);
  // Plataforma que só teve estorno no período fatura negativo; rateio
  // negativo daria anúncio negativo, que não existe.
  const participacao = total > 0 ? Math.max(0, bruto(daPlataforma)) / total : 0;

  return {
    vendas: daPlataforma,
    // O universo segue inteiro: a faixa de taxa já é decidida por plataforma
    // lá dentro, e cortar aqui não muda nada além de esconder informação.
    universo: dados.universo,
    gastos: contarTrafego ? dados.gastos.map((g) => ({ ...g, valor: g.valor * participacao })) : [],
    despesas: [],
    participacao,
  };
}
