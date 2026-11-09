import { describe, expect, test } from "bun:test";
import {
  comissaoDaReversao,
  comissaoEstimada,
  faixaDaTaxa,
  liquidoDaVenda,
  mesDoPedido,
  mesesDoHistorico,
  progressoBonus,
  serieAcumulada,
  situacaoReversao,
  taxaContrato,
  contarPedidos,
  eventosDoMes,
  type LinhaReembolso,
  type VendaDaReversao,
} from "./reembolso";

describe("faixas do bonus, nas pontas da regra", () => {
  test("5,00% cravado ainda paga R$ 100; 5,01% ja fica sem bonus", () => {
    expect(faixaDaTaxa(5).bonus).toBe(100);
    expect(faixaDaTaxa(5.01).bonus).toBe(0);
  });

  test("4,50% cai na de R$ 200; 4,51% ja e a de R$ 100", () => {
    expect(faixaDaTaxa(4.5).bonus).toBe(200);
    expect(faixaDaTaxa(4.51).bonus).toBe(100);
    expect(faixaDaTaxa(4.49).bonus).toBe(200);
  });

  test("4,00% cai na de R$ 350; 4,01% ja e a de R$ 200", () => {
    expect(faixaDaTaxa(4).bonus).toBe(350);
    expect(faixaDaTaxa(4.01).bonus).toBe(200);
    expect(faixaDaTaxa(3.5).bonus).toBe(350);
    expect(faixaDaTaxa(3.49).bonus).toBe(500);
  });

  test("a taxa vem de contas reais: 12 em 300 = 4,00% e 18 em 400 = 4,50%", () => {
    expect(faixaDaTaxa(taxaContrato(12, 300)!).bonus).toBe(350);
    expect(faixaDaTaxa(taxaContrato(18, 400)!).bonus).toBe(200);
  });

  test("a taxa sai com duas casas: 5,004% e lida como 5,00%", () => {
    // 5004 reembolsos em 100000 vendas = 5,004%
    expect(taxaContrato(5004, 100_000)).toBe(5);
    expect(faixaDaTaxa(taxaContrato(5004, 100_000)!).bonus).toBe(100);
  });

  test("sem venda nao ha taxa", () => {
    expect(taxaContrato(0, 0)).toBeNull();
  });
});

describe("progresso ate a proxima faixa", () => {
  test("6% em 500 vendas", () => {
    const p = progressoBonus(500, 30);
    expect(p.taxa).toBe(6);
    expect(p.faixa?.bonus).toBe(0);
    expect(p.proxima?.bonus).toBe(100);
    // 25 reembolsos em 500 = 5,00% — o limite da faixa de R$ 100.
    expect(p.cabemNaProxima).toBe(25);
    // 30 reembolsos precisam de 600 vendas para chegar a 5,00%.
    expect(p.vendasParaProxima).toBe(100);
    expect(p.abaixoDoPiso).toBe(false);
  });

  test("abaixo de 250 vendas o bonus nao e apurado, e a tela diz quanto falta", () => {
    const p = progressoBonus(180, 5);
    expect(p.abaixoDoPiso).toBe(true);
    expect(p.faltamParaPiso).toBe(70);
  });

  test("na melhor faixa nao ha proxima", () => {
    const p = progressoBonus(500, 10); // 2%
    expect(p.faixa?.bonus).toBe(500);
    expect(p.proxima).toBeNull();
    expect(p.cabemNaProxima).toBeNull();
  });

  test("mes sem venda nao quebra", () => {
    const p = progressoBonus(0, 0);
    expect(p.taxa).toBeNull();
    expect(p.faixa).toBeNull();
    expect(p.proxima).toBeNull();
  });
});

const PLATAFORMA_B_397_PIX: VendaDaReversao = {
  valor_bruto: 397,
  juros_parcelamento: 0,
  liquido_plataforma: 372.19,
  status: "aprovada",
  perc_juros_repassado: 10,
};

describe("comissao sobre o liquido", () => {
  test("pix de R$ 397 na Plataforma B: liquido da plataforma menos 6% de imposto", () => {
    // 372,19 − 6% de 397 (23,82) = 348,37 → 10% = 34,84
    expect(liquidoDaVenda(PLATAFORMA_B_397_PIX, 6)).toBeCloseTo(348.37, 2);
    expect(comissaoDaReversao(PLATAFORMA_B_397_PIX, 6)).toBeCloseTo(34.84, 2);
  });

  test("no cartao parcelado, o imposto incide tambem sobre os juros que voltam", () => {
    // 397 + 35,24 de juros, liquido 375,72.
    const cartao = { ...PLATAFORMA_B_397_PIX, juros_parcelamento: 35.24, liquido_plataforma: 375.72 };
    const jurosRepassados = 3.524;
    const esperado = 375.72 - (397 + jurosRepassados) * 0.06;
    expect(liquidoDaVenda(cartao, 6)).toBeCloseTo(esperado, 2);
  });

  test("sem liquido informado nem estimado nao chuta: devolve nulo", () => {
    const plataforma_a = { ...PLATAFORMA_B_397_PIX, liquido_plataforma: null };
    expect(comissaoDaReversao(plataforma_a, 6)).toBeNull();
  });

  test("Plataforma A: sem liquido informado, usa o estimado pela tabela (4,69% + R$ 1,00)", () => {
    // 397 − (4,69% de 397 + 1,00) = 377,38; − 6% de 397 (23,82) = 353,56 → 10% = 35,36
    const plataforma_a: VendaDaReversao = {
      valor_bruto: 397,
      juros_parcelamento: 0,
      liquido_plataforma: null,
      liquido_estimado: 377.38,
      status: "aprovada",
      perc_juros_repassado: 0,
    };
    expect(liquidoDaVenda(plataforma_a, 6)).toBeCloseTo(353.56, 2);
    expect(comissaoDaReversao(plataforma_a, 6)).toBeCloseTo(35.36, 2);
    expect(comissaoEstimada(plataforma_a)).toBe(true);
  });

  test("o liquido informado pela plataforma vale mais que o estimado", () => {
    const plataforma_b = { ...PLATAFORMA_B_397_PIX, liquido_estimado: 300 };
    expect(liquidoDaVenda(plataforma_b, 6)).toBeCloseTo(348.37, 2);
    expect(comissaoEstimada(plataforma_b)).toBe(false);
  });
});

describe("situacao da reversao", () => {
  const base = { revertidaDia: "2026-09-10", statusVenda: "aprovada" as const, comRegistro: true };

  test("dentro dos 15 dias esta em carencia, e diz quando confirma", () => {
    const r = situacaoReversao({ ...base, hoje: "2026-09-24" });
    expect(r.situacao).toBe("em_carencia");
    expect(r.confirmaEm).toBe("2026-09-25");
  });

  test("no 15º dia de pe, confirma", () => {
    expect(situacaoReversao({ ...base, hoje: "2026-09-25" }).situacao).toBe("confirmada");
  });

  test("se a venda foi estornada depois, a reversao nao existiu", () => {
    const r = situacaoReversao({ ...base, hoje: "2026-09-30", statusVenda: "reembolsada" });
    expect(r.situacao).toBe("anulada");
  });

  test("sem registro de atendimento nao gera comissao, mesmo depois da carencia", () => {
    const r = situacaoReversao({ ...base, hoje: "2026-09-30", comRegistro: false });
    expect(r.situacao).toBe("sem_registro");
  });
});

describe("taxa acumulada no mes", () => {
  test("acumula dia a dia e conta cada pedido uma vez so", () => {
    const serie = serieAcumulada(
      "2026-09-01",
      3,
      [
        { pedido: "a", dia: "2026-09-01" },
        { pedido: "b", dia: "2026-09-01" },
        { pedido: "b", dia: "2026-09-01" }, // bump do mesmo pedido
        { pedido: "c", dia: "2026-09-03" },
      ],
      [{ pedido: "a", dia: "2026-09-02" }],
    );
    expect(serie.map((p) => p.vendas)).toEqual([2, 2, 3]);
    expect(serie.map((p) => p.reembolsos)).toEqual([0, 1, 1]);
    expect(serie[1]!.taxa).toBe(50);
    expect(serie[2]!.taxa).toBe(33.33);
  });

  test("nao passa do fim do mes", () => {
    const serie = serieAcumulada("2026-09-01", 31, [], []);
    expect(serie).toHaveLength(30);
  });
});

describe("eventos do mes", () => {
  const linha = (over: Partial<LinhaReembolso>): LinhaReembolso => ({
    id: crypto.randomUUID(),
    plataforma: "plataforma_b",
    pedido_externo_id: null,
    status: "aprovada",
    ocorrido_dia: "2026-09-10",
    reembolsado_dia: null,
    ...over,
  });

  test("mesma regra do painel: venda pela data da venda, reembolso pela data do reembolso", () => {
    const { vendidos, reembolsados } = eventosDoMes(
      [
        linha({ pedido_externo_id: "a" }),
        linha({
          pedido_externo_id: "b",
          status: "reembolsada",
          ocorrido_dia: "2026-09-02",
          reembolsado_dia: "2026-09-05",
        }),
        linha({
          pedido_externo_id: "c",
          status: "reembolsada",
          ocorrido_dia: "2026-08-28",
          reembolsado_dia: "2026-09-01",
        }),
        linha({ pedido_externo_id: "d", status: "pendente" }),
      ],
      "2026-09-01",
      "2026-09-30",
    );
    // a e b foram vendidos em setembro (b mesmo tendo voltado); c e d nao.
    expect(contarPedidos(vendidos)).toBe(2);
    // b e c voltaram em setembro, c mesmo sendo venda de agosto.
    expect(contarPedidos(reembolsados)).toBe(2);
  });

  test("filtra por plataforma", () => {
    const { vendidos } = eventosDoMes(
      [linha({ plataforma: "plataforma_b" }), linha({ plataforma: "plataforma_a" })],
      "2026-09-01",
      "2026-09-30",
      "plataforma_a",
    );
    expect(vendidos).toHaveLength(1);
  });

  test("na Plataforma A, principal e order bump com codigos diferentes sao um pedido so", () => {
    // A Plataforma A manda cada produto do checkout com codigo proprio; o banco grava
    // no bump o pedido do principal (pedido_chave).
    const { vendidos, reembolsados } = eventosDoMes(
      [
        linha({ plataforma: "plataforma_a", pedido_externo_id: "9300001", status: "reembolsada", reembolsado_dia: "2026-09-12" }),
        linha({
          plataforma: "plataforma_a",
          pedido_externo_id: "9300002",
          pedido_chave: "9300001",
          status: "reembolsada",
          reembolsado_dia: "2026-09-12",
        }),
        linha({ plataforma: "plataforma_a", pedido_externo_id: "9300010" }),
      ],
      "2026-09-01",
      "2026-09-30",
    );
    expect(contarPedidos(vendidos)).toBe(2);
    expect(contarPedidos(reembolsados)).toBe(1);
  });
});

describe("meses do historico do suporte", () => {
  test("o pedido conta no mes de Brasilia, e nao no de Greenwich", () => {
    // 01/10 02:30 em UTC ainda e 30/09 23:30 em Brasilia.
    expect(mesDoPedido("2026-10-01T02:30:00Z")).toBe("2026-09-01");
    expect(mesDoPedido("2026-10-01T12:00:00Z")).toBe("2026-10-01");
  });

  test("vai do mes atual ate o do pedido mais antigo", () => {
    expect(mesesDoHistorico(["2026-10-03T12:00:00Z", "2026-09-16T12:00:00Z"], "2026-10-06")).toEqual([
      "2026-10-01",
      "2026-09-01",
    ]);
  });

  test("sem pedido, mostra so o mes atual", () => {
    expect(mesesDoHistorico([], "2026-10-06")).toEqual(["2026-10-01"]);
  });

  test("nunca passa de 12 meses", () => {
    const meses = mesesDoHistorico(["2024-01-10T12:00:00Z"], "2026-10-06");
    expect(meses).toHaveLength(12);
    expect(meses[0]).toBe("2026-10-01");
    expect(meses[11]).toBe("2025-11-01");
  });
});

describe("piso de 250 pedidos", () => {
  test("conta pedido, e nao item: 200 pedidos com 100 order bumps seguem abaixo do piso", () => {
    expect(progressoBonus(200, 4).abaixoDoPiso).toBe(true);
    expect(progressoBonus(250, 4).abaixoDoPiso).toBe(false);
  });
});
