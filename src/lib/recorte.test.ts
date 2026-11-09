import { describe, expect, test } from "bun:test";
import { recortar } from "./recorte";
import type { Taxa, Venda } from "./financeiro";
import type { DadosFinanceiros } from "./useFinanceiro";

const TAXAS: Taxa[] = [];

function venda(over: Partial<Venda>): Venda {
  return {
    id: crypto.randomUUID(),
    plataforma: "plataforma_b",
    pedido_externo_id: crypto.randomUUID(),
    produto_nome: null,
    tipo: "principal",
    valor_bruto: 100,
    juros_parcelamento: 0,
    taxa_coprodutor: 0,
    taxa_afiliado: 0,
    custo_produto: 0,
    liquido_plataforma: null,
    parcelas: 1,
    metodo_pagamento: null,
    status: "aprovada",
    ocorrido_em: "2026-09-10T12:00:00Z",
    ocorrido_dia: "2026-09-10",
    reembolsado_dia: null,
    cliente_email: null,
    cliente_nome: null,
    ...over,
  };
}

function dados(vendas: Venda[]): DadosFinanceiros {
  return {
    vendas,
    universo: vendas,
    gastos: [{ id: "g", data: "2026-09-10", canal: "meta", valor: 1000 }],
    despesas: [
      {
        id: "d",
        data: "2026-09-10",
        categoria: "ferramenta",
        descricao: null,
        valor: 50,
        recorrente: true,
      },
    ],
    taxas: TAXAS,
    impostoPercentual: 6,
  };
}

const PERIODO = { inicio: "2026-09-01", fim: "2026-09-30" };
// Plataforma B fatura 300, Plataforma A 700: a Plataforma B tem 30% do faturamento.
const BASE = dados([
  venda({ plataforma: "plataforma_b", valor_bruto: 300 }),
  venda({ plataforma: "plataforma_a", valor_bruto: 700 }),
]);

describe("filtro por plataforma", () => {
  test("todas: nada muda", () => {
    const r = recortar(BASE, PERIODO, "todas", true);
    expect(r.vendas).toHaveLength(2);
    expect(r.gastos[0]!.valor).toBe(1000);
    expect(r.despesas).toHaveLength(1);
    expect(r.participacao).toBeNull();
  });

  test("com tráfego: rateia pela fatia no faturamento", () => {
    const r = recortar(BASE, PERIODO, "plataforma_b", true);
    expect(r.vendas.every((v) => v.plataforma === "plataforma_b")).toBe(true);
    expect(r.participacao).toBeCloseTo(0.3, 6);
    expect(r.gastos[0]!.valor).toBeCloseTo(300, 6);
  });

  test("sem tráfego: sobra a margem de contribuição", () => {
    const r = recortar(BASE, PERIODO, "plataforma_b", false);
    expect(r.gastos).toHaveLength(0);
  });

  test("despesas fixas são da operação e saem do recorte", () => {
    expect(recortar(BASE, PERIODO, "plataforma_a", true).despesas).toHaveLength(0);
  });

  test("as duas fatias somam o tráfego inteiro", () => {
    const h = recortar(BASE, PERIODO, "plataforma_b", true).gastos[0]!.valor;
    const g = recortar(BASE, PERIODO, "plataforma_a", true).gastos[0]!.valor;
    expect(h + g).toBeCloseTo(1000, 6);
  });

  test("plataforma que só teve estorno não recebe anúncio negativo", () => {
    const d = dados([
      venda({ plataforma: "plataforma_a", valor_bruto: 700 }),
      venda({
        plataforma: "plataforma_b",
        valor_bruto: 300,
        status: "reembolsada",
        ocorrido_dia: "2026-08-20",
        reembolsado_dia: "2026-09-05",
      }),
    ]);
    const r = recortar(d, PERIODO, "plataforma_b", true);
    expect(r.participacao).toBe(0);
    expect(r.gastos[0]!.valor).toBe(0);
  });
});
