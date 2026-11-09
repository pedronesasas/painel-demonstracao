import { describe, expect, test } from "bun:test";
import {
  apurar,
  faixasEstouradas,
  serieDiaria,
  taxaDoItem,
  taxaVigente,
  type Despesa,
  type GastoTrafego,
  type Taxa,
  type Venda,
} from "./financeiro";

const PLATAFORMA_A: Taxa = {
  plataforma: "plataforma_a",
  vigencia_inicio: "2020-01-01",
  faixa_min: 0,
  faixa_max: 30000,
  percentual: 4.69,
  fixo_por_venda: 1,
  fixo_so_no_principal: false,
  perc_juros_repassado: 0,
};

const PLATAFORMA_B: Taxa = {
  plataforma: "plataforma_b",
  vigencia_inicio: "2020-01-01",
  faixa_min: 0,
  faixa_max: null,
  percentual: 6,
  fixo_por_venda: 0.99,
  fixo_so_no_principal: true,
  perc_juros_repassado: 10,
};

const TAXAS = [PLATAFORMA_A, PLATAFORMA_B];

function venda(over: Partial<Venda> = {}): Venda {
  return {
    id: crypto.randomUUID(),
    plataforma: "plataforma_b",
    pedido_externo_id: "pedido-1",
    produto_nome: "Produto",
    tipo: "principal",
    valor_bruto: 497,
    juros_parcelamento: 0,
    taxa_coprodutor: 0,
    taxa_afiliado: 0,
    custo_produto: 0,
    liquido_plataforma: null,
    parcelas: 1,
    metodo_pagamento: "credit_card",
    status: "aprovada",
    ocorrido_em: "2026-09-10T14:00:00Z",
    ocorrido_dia: "2026-09-10",
    reembolsado_dia: null,
    cliente_email: "cliente@exemplo.com",
    cliente_nome: "Cliente",
    ...over,
  };
}

function despesa(over: Partial<Despesa> = {}): Despesa {
  return {
    id: crypto.randomUUID(),
    data: "2026-09-10",
    categoria: "ferramenta",
    descricao: "Ferramenta",
    valor: 100,
    recorrente: false,
    ...over,
  };
}

const perto = (v: number, alvo: number) => expect(v).toBeCloseTo(alvo, 2);

describe("taxa do gateway", () => {
  test("Plataforma A cobra percentual mais fixo em qualquer item", () => {
    perto(taxaDoItem(venda({ plataforma: "plataforma_a", valor_bruto: 297 }), PLATAFORMA_A), 14.93);
    perto(taxaDoItem(venda({ plataforma: "plataforma_a", valor_bruto: 97, tipo: "bump" }), PLATAFORMA_A), 5.55);
  });

  test("o fixo da Plataforma B pega o principal e poupa o order bump", () => {
    perto(taxaDoItem(venda({ valor_bruto: 497 }), PLATAFORMA_B), 30.81);
    perto(taxaDoItem(venda({ valor_bruto: 97, tipo: "bump" }), PLATAFORMA_B), 5.82);
    perto(taxaDoItem(venda({ valor_bruto: 97, tipo: "upsell" }), PLATAFORMA_B), 5.82);
  });
});

describe("faixa de taxa", () => {
  test("Plataforma A fica na faixa de 4,69% abaixo de 30 mil no mês", () => {
    expect(taxaVigente(TAXAS, "plataforma_a", "2026-09-10", 12000)?.percentual).toBe(4.69);
  });

  test("acima do teto cadastrado cai na faixa mais alta conhecida", () => {
    expect(taxaVigente(TAXAS, "plataforma_a", "2026-09-10", 45000)?.percentual).toBe(4.69);
    expect(faixasEstouradas([venda({ plataforma: "plataforma_a", valor_bruto: 45000 })], TAXAS)).toEqual([
      { plataforma: "plataforma_a", mes: "2026-09", faturamento: 45000 },
    ]);
  });

  test("Plataforma B nao tem teto, entao nunca alerta", () => {
    expect(faixasEstouradas([venda({ valor_bruto: 500000 })], TAXAS)).toEqual([]);
  });

  test("taxa renegociada nao reescreve o passado", () => {
    const nova: Taxa = { ...PLATAFORMA_B, vigencia_inicio: "2026-10-01", percentual: 4.9 };
    expect(taxaVigente([PLATAFORMA_B, nova], "plataforma_b", "2026-09-30", 0)?.percentual).toBe(6);
    expect(taxaVigente([PLATAFORMA_B, nova], "plataforma_b", "2026-10-01", 0)?.percentual).toBe(4.9);
  });
});

describe("faturamento bruto e liquido", () => {
  test("pedido Plataforma B com order bump", () => {
    const a = apurar(
      [venda({ valor_bruto: 497 }), venda({ valor_bruto: 97, tipo: "bump" })],
      TAXAS,
      [],
    );

    perto(a.faturamentoBruto, 594);
    perto(a.taxaGateway, 36.63); // 30,81 do principal + 5,82 do bump
    perto(a.imposto, 35.64); // 6% de 594
    perto(a.faturamentoLiquido, 521.73);
    expect(a.pedidos).toBe(1); // mesmo pedido_externo_id
    expect(a.itens).toBe(2);
  });

  test("reembolso e chargeback saem do faturamento bruto", () => {
    const a = apurar(
      [
        venda({ valor_bruto: 497 }),
        venda({ valor_bruto: 297, pedido_externo_id: "p2", status: "reembolsada" }),
        venda({ valor_bruto: 100, pedido_externo_id: "p3", status: "chargeback" }),
      ],
      TAXAS,
      [],
    );

    // As tres foram vendidas; duas voltaram. Sobra a de 497. Esta conta ja
    // afirmou 100 — a venda reembolsada sumia da receita E saia como
    // reembolso, e cada devolucao era descontada duas vezes.
    perto(a.vendasBrutas, 894);
    perto(a.reembolsos, 397);
    perto(a.faturamentoBruto, 497);
    expect(a.pedidos).toBe(1); // ticket e CPA contam so o que ficou de pe
  });

  test("vender e devolver no mesmo periodo da zero, e nao prejuizo", () => {
    const a = apurar([venda({ valor_bruto: 297, status: "reembolsada" })], TAXAS, []);
    perto(a.faturamentoBruto, 0);
  });

  test("venda de um mes devolvida no seguinte: venda no primeiro, devolucao no segundo", () => {
    const linha = venda({
      valor_bruto: 397,
      status: "reembolsada",
      ocorrido_dia: "2026-08-28",
      reembolsado_dia: "2026-09-02",
    });

    const agosto = apurar([linha], TAXAS, [], [], 6, [linha], {
      inicio: "2026-08-01",
      fim: "2026-08-31",
    });
    perto(agosto.vendasBrutas, 397);
    perto(agosto.reembolsos, 0);
    perto(agosto.faturamentoBruto, 397);

    const setembro = apurar([linha], TAXAS, [], [], 6, [linha], {
      inicio: "2026-09-01",
      fim: "2026-09-30",
    });
    perto(setembro.vendasBrutas, 0);
    perto(setembro.reembolsos, 397);
    perto(setembro.faturamentoBruto, -397);
    // Somando os dois meses, a venda devolvida da zero, como na vida real.
  });

  test("registro antigo sem data de reembolso cai na data da venda", () => {
    const linha = venda({ valor_bruto: 100, status: "reembolsada", ocorrido_dia: "2026-09-05" });
    const a = apurar([linha], TAXAS, [], [], 6, [linha], {
      inicio: "2026-09-05",
      fim: "2026-09-05",
    });
    perto(a.reembolsos, 100);
    perto(a.faturamentoBruto, 0);
  });

  test("juros de parcelamento entram como receita, nao como custo", () => {
    const semJuros = apurar([venda({ valor_bruto: 497 })], TAXAS, []);
    const comJuros = apurar(
      [venda({ valor_bruto: 497, juros_parcelamento: 100, parcelas: 6 })],
      TAXAS,
      [],
    );

    perto(comJuros.receitaJuros, 10); // 10% dos R$100 de juros
    expect(comJuros.faturamentoLiquido).toBeGreaterThan(semJuros.faturamentoLiquido);
    // A taxa do gateway nao muda: incide sobre o preco, nao sobre os juros.
    perto(comJuros.taxaGateway, semJuros.taxaGateway);
    perto(comJuros.imposto, (497 + 10) * 0.06);
  });

  test("coprodutor, afiliado e custo de produto deduzem do liquido", () => {
    // A operacao hoje nao tem nenhum dos tres, mas a cascata desconta quando
    // existirem — e este teste e o que garante que continuam somando certo.
    const sem = apurar([venda({ valor_bruto: 1000 })], TAXAS, []);
    const com = apurar(
      [
        venda({
          valor_bruto: 1000,
          taxa_coprodutor: 200,
          taxa_afiliado: 50,
          custo_produto: 30,
        }),
      ],
      TAXAS,
      [],
    );

    perto(com.taxaCoprodutores, 250);
    perto(com.custoProduto, 30);
    perto(com.faturamentoLiquido, sem.faturamentoLiquido - 280);
    // Nao mexem no bruto nem no imposto: sao deducoes, nao devolucao de venda.
    perto(com.faturamentoBruto, sem.faturamentoBruto);
    perto(com.imposto, sem.imposto);
  });
});

describe("liquido informado pela plataforma", () => {
  // Venda real da Plataforma B: R$137,00, e ela depositou R$126,18.
  const REAL = { valor_bruto: 137, liquido_plataforma: 126.18 };

  test("a taxa vem do liquido informado, nao da tabela", () => {
    const informado = apurar([venda(REAL)], TAXAS, []);
    const estimado = apurar([venda({ valor_bruto: 137 })], TAXAS, []);

    perto(informado.taxaGateway, 10.82); // 137 - 126,18
    perto(estimado.taxaGateway, 9.21); // 6% + R$0,99 da tabela
    // A tabela subestimava em 17,5%: e essa diferenca ia direto pro lucro.
    expect(informado.taxaGateway).toBeGreaterThan(estimado.taxaGateway);
  });

  test("o faturamento liquido fecha com o que a plataforma depositou", () => {
    const a = apurar([venda(REAL)], TAXAS, [], [], 0); // sem imposto, para isolar
    perto(a.faturamentoLiquido, 126.18);
  });

  test("com juros, o liquido informado ainda fecha a conta", () => {
    // Cliente pagou juros; parte volta como receita e o resto a Plataforma B reteve.
    // O liquido informado absorve o rateio real, seja ele qual for.
    const a = apurar(
      [venda({ valor_bruto: 960, juros_parcelamento: 163.2, liquido_plataforma: 900 })],
      TAXAS,
      [],
      [],
      0,
    );
    perto(a.receitaJuros, 16.32); // 10% dos juros, da tabela
    perto(a.taxaGateway, 960 + 16.32 - 900);
    perto(a.faturamentoLiquido, 900); // bate com o deposito
  });

  test("sem liquido informado cai na tabela", () => {
    const a = apurar([venda({ valor_bruto: 137 })], TAXAS, []);
    perto(a.taxaGateway, 9.21);
    expect(a.porPlataforma.plataforma_b.comLiquidoInformado).toBe(0);
  });

  test("liquido maior que o bruto nao vira taxa negativa", () => {
    const a = apurar([venda({ valor_bruto: 100, liquido_plataforma: 150 })], TAXAS, []);
    expect(a.taxaGateway).toBeGreaterThanOrEqual(0);
    perto(a.taxaGateway, 6.99); // volta para a tabela
  });

  test("taxa efetiva media sai medida, e diz quantas vendas a sustentam", () => {
    const a = apurar(
      [
        venda({ ...REAL, pedido_externo_id: "p1" }),
        venda({ valor_bruto: 137, liquido_plataforma: 120, pedido_externo_id: "p2" }),
      ],
      TAXAS,
      [],
    );

    perto(a.porPlataforma.plataforma_b.faturamento, 274);
    perto(a.porPlataforma.plataforma_b.taxas, 10.82 + 17);
    perto(a.porPlataforma.plataforma_b.taxaEfetiva, (10.82 + 17) / 274);
    expect(a.porPlataforma.plataforma_b.comLiquidoInformado).toBe(2);
    expect(a.porPlataforma.plataforma_b.itens).toBe(2);
  });
});

describe("pendentes e nao pagas", () => {
  test("pendente nao derruba o faturamento", () => {
    // Era assim que a conta quebrava: tudo que nao fosse aprovada virava
    // devolucao, e cada pix gerado subtraia do dia.
    const a = apurar(
      [
        venda({ valor_bruto: 500 }),
        venda({ valor_bruto: 300, pedido_externo_id: "p2", status: "pendente" }),
      ],
      TAXAS,
      [],
    );

    perto(a.faturamentoBruto, 500);
    perto(a.reembolsos, 0);
    expect(a.pendentes).toBe(1);
    perto(a.valorPendente, 300);
  });

  test("nao paga tambem nao vira devolucao", () => {
    const a = apurar(
      [
        venda({ valor_bruto: 500 }),
        venda({ valor_bruto: 200, pedido_externo_id: "p2", status: "nao_paga" }),
      ],
      TAXAS,
      [],
    );
    perto(a.faturamentoBruto, 500);
    perto(a.reembolsos, 0);
    expect(a.naoPagas).toBe(1);
  });

  test("pendente nao entra na taxa de aprovacao", () => {
    // Um boleto recem-gerado nao pode piorar a conversao: ele ainda pode ser
    // pago. So conta o que ja teve desfecho.
    const base = [
      venda({ valor_bruto: 100, pedido_externo_id: "a1" }),
      venda({ valor_bruto: 100, pedido_externo_id: "a2" }),
      venda({ valor_bruto: 100, pedido_externo_id: "n1", status: "nao_paga" }),
    ];
    const semPendente = apurar(base, TAXAS, []);
    const comPendente = apurar(
      [...base, venda({ valor_bruto: 100, pedido_externo_id: "p9", status: "pendente" })],
      TAXAS,
      [],
    );

    perto(semPendente.taxaAprovacao, 2 / 3);
    perto(comPendente.taxaAprovacao, 2 / 3); // inalterada
  });

  test("separa chargeback de reembolso e calcula as duas taxas", () => {
    const a = apurar(
      [
        venda({ valor_bruto: 1000 }),
        venda({ valor_bruto: 100, pedido_externo_id: "r1", status: "reembolsada" }),
        venda({ valor_bruto: 50, pedido_externo_id: "c1", status: "chargeback" }),
      ],
      TAXAS,
      [],
    );

    perto(a.reembolsos, 150); // os dois saem do faturamento
    perto(a.chargebacks, 50); // mas o chargeback e destacado
    perto(a.faturamentoBruto, 1000);
    // Taxa do contrato: 2 pedidos devolvidos em 3 vendidos.
    perto(a.taxaReembolso, 2 / 3);
    perto(a.taxaReembolsoValor, 150 / 1150);
    perto(a.taxaChargeback, 50 / 1150);
  });

  test("pendente nao gera taxa de gateway nem imposto", () => {
    const a = apurar([venda({ valor_bruto: 1000, status: "pendente" })], TAXAS, []);
    perto(a.taxaGateway, 0);
    perto(a.imposto, 0);
    perto(a.faturamentoLiquido, 0);
    expect(a.itens).toBe(0); // itens conta so o que virou receita
  });
});

describe("lucro e indicadores", () => {
  const gastos: GastoTrafego[] = [
    { id: "g1", data: "2026-09-10", canal: "meta", valor: 200 },
    { id: "g2", data: "2026-09-10", canal: "google", valor: 100 },
  ];

  test("lucro desconta anuncios e despesas adicionais", () => {
    const a = apurar([venda({ valor_bruto: 1000 })], TAXAS, gastos, [despesa({ valor: 100 })]);

    perto(a.trafego, 300);
    perto(a.despesasAdicionais, 100);
    perto(a.gastosTotais, 400);
    perto(a.faturamentoLiquido, 1000 - 60.99 - 60); // taxa + imposto
    perto(a.lucro, a.faturamentoLiquido - 400);
  });

  test("ROAS usa o bruto e ROI usa o liquido", () => {
    const a = apurar([venda({ valor_bruto: 1000 })], TAXAS, gastos, [despesa({ valor: 100 })]);

    // ROAS mede o anuncio: faturamento bruto sobre o que foi gasto em anuncio.
    perto(a.roas, 1000 / 300);
    // ROI mede o negocio: faturamento liquido sobre todos os gastos.
    perto(a.roi, a.faturamentoLiquido / 400);
    expect(a.roas).not.toBeCloseTo(a.roi, 2);
  });

  test("margem e o percentual do liquido que virou lucro", () => {
    const a = apurar([venda({ valor_bruto: 1000 })], TAXAS, gastos);
    perto(a.margem, a.lucro / a.faturamentoLiquido);
  });

  test("CPA e ticket medio contam pedido, nao item", () => {
    const a = apurar(
      [venda({ valor_bruto: 900 }), venda({ valor_bruto: 100, tipo: "bump" })],
      TAXAS,
      gastos,
    );

    expect(a.pedidos).toBe(1);
    expect(a.itens).toBe(2);
    perto(a.cpa, 300); // os R$300 de anuncio para um pedido
    perto(a.ticketMedio, 1000);
  });

  test("na Plataforma A, o order bump com codigo proprio conta no pedido do principal", () => {
    const a = apurar(
      [
        venda({ plataforma: "plataforma_a", valor_bruto: 397, pedido_externo_id: "9300001" }),
        venda({
          plataforma: "plataforma_a",
          valor_bruto: 137,
          tipo: "bump",
          pedido_externo_id: "9300002",
          pedido_chave: "9300001",
        }),
      ],
      TAXAS,
      gastos,
    );

    expect(a.pedidos).toBe(1);
    expect(a.itens).toBe(2);
    perto(a.ticketMedio, 534);
  });

  test("receita por cliente junta as compras do mesmo e-mail", () => {
    const a = apurar(
      [
        venda({ valor_bruto: 500, pedido_externo_id: "p1", cliente_email: "ana@x.com" }),
        venda({ valor_bruto: 300, pedido_externo_id: "p2", cliente_email: "ANA@x.com" }),
        venda({ valor_bruto: 200, pedido_externo_id: "p3", cliente_email: "bia@x.com" }),
      ],
      TAXAS,
      [],
    );

    expect(a.pedidos).toBe(3);
    expect(a.clientes).toBe(2); // ana comprou duas vezes, e-mail normalizado
    perto(a.ticketMedio, 1000 / 3);
    perto(a.receitaPorCliente, 1000 / 2);
  });

  test("periodo vazio nao vira divisao por zero", () => {
    const a = apurar([], TAXAS, []);
    expect(a.roas).toBe(0);
    expect(a.roi).toBe(0);
    expect(a.cpa).toBe(0);
    expect(a.margem).toBe(0);
    expect(a.ticketMedio).toBe(0);
    expect(a.receitaPorCliente).toBe(0);
  });

  test("separa faturamento e custo por plataforma", () => {
    const a = apurar(
      [
        venda({ valor_bruto: 497 }),
        venda({ plataforma: "plataforma_a", pedido_externo_id: "g1", valor_bruto: 297 }),
      ],
      TAXAS,
      [],
    );

    perto(a.porPlataforma.plataforma_b.faturamento, 497);
    perto(a.porPlataforma.plataforma_b.taxas, 30.81);
    perto(a.porPlataforma.plataforma_a.faturamento, 297);
    perto(a.porPlataforma.plataforma_a.taxas, 14.93);
    expect(a.porPlataforma.plataforma_a.pedidos).toBe(1);
  });
});

describe("serie diaria", () => {
  test("preenche dia sem venda com zero e casa gasto e despesa do dia", () => {
    const vendas = [
      venda({ valor_bruto: 1000, ocorrido_dia: "2026-09-10" }),
      venda({ valor_bruto: 500, pedido_externo_id: "p2", ocorrido_dia: "2026-09-12" }),
    ];
    const gastos: GastoTrafego[] = [{ id: "g1", data: "2026-09-11", canal: "meta", valor: 80 }];
    const despesas = [despesa({ data: "2026-09-11", valor: 20 })];

    const serie = serieDiaria(
      ["2026-09-10", "2026-09-11", "2026-09-12"],
      vendas,
      TAXAS,
      gastos,
      despesas,
    );

    perto(serie[0]!.faturamento, 1000);
    perto(serie[1]!.faturamento, 0);
    perto(serie[1]!.trafego, 80);
    perto(serie[1]!.lucro, -100); // dia so de saida: 80 de anuncio + 20 de despesa
    perto(serie[2]!.faturamento, 500);
  });
});

describe("taxa de reembolso da regra do suporte", () => {
  test("30 reembolsos em 500 vendas e 6%, e nao 30 em 470", () => {
    // O exemplo do proprio plano de bonificacao. A venda reembolsada continua
    // no denominador: ela foi venda.
    const vendas = [
      ...Array.from({ length: 470 }, (_, i) => venda({ pedido_externo_id: `ok-${i}` })),
      ...Array.from({ length: 30 }, (_, i) =>
        venda({ pedido_externo_id: `rb-${i}`, status: "reembolsada" }),
      ),
    ];
    const a = apurar(vendas, TAXAS, []);
    expect(a.pedidosVendidos).toBe(500);
    expect(a.pedidosReembolsados).toBe(30);
    perto(a.taxaReembolso, 0.06);
  });

  test("conta pedidos, nao reais: um reembolso de R$ 497 pesa o mesmo que um de R$ 47", () => {
    const a = apurar(
      [
        venda({ pedido_externo_id: "a", valor_bruto: 497, status: "reembolsada" }),
        venda({ pedido_externo_id: "b", valor_bruto: 47 }),
      ],
      TAXAS,
      [],
    );
    perto(a.taxaReembolso, 1 / 2);
    perto(a.taxaReembolsoValor, 497 / 544);
  });

  test("pedido com order bump e uma venda so, e o reembolso dele e um so", () => {
    const a = apurar(
      [
        venda({ pedido_externo_id: "p1", valor_bruto: 397, status: "reembolsada" }),
        venda({ pedido_externo_id: "p1", tipo: "bump", valor_bruto: 97, status: "reembolsada" }),
        venda({ pedido_externo_id: "p2", valor_bruto: 397 }),
      ],
      TAXAS,
      [],
    );
    expect(a.pedidosVendidos).toBe(2);
    expect(a.pedidosReembolsados).toBe(1);
  });

  test("reembolso de venda antiga entra no numerador do mes, mas a venda nao entra no denominador", () => {
    // Reembolsos concluidos no mes / vendas aprovadas no mes — cada um pela
    // sua data, como o contrato define.
    const periodo = { inicio: "2026-09-01", fim: "2026-09-30" };
    const linhas = [
      venda({
        pedido_externo_id: "velha",
        status: "reembolsada",
        ocorrido_dia: "2026-08-20",
        reembolsado_dia: "2026-09-03",
      }),
      venda({ pedido_externo_id: "nova-1", ocorrido_dia: "2026-09-05" }),
      venda({ pedido_externo_id: "nova-2", ocorrido_dia: "2026-09-06" }),
    ];
    const a = apurar(linhas, TAXAS, [], [], 6, linhas, periodo);
    expect(a.pedidosVendidos).toBe(2);
    expect(a.pedidosReembolsados).toBe(1);
    perto(a.taxaReembolso, 1 / 2);
  });

  test("separa por plataforma", () => {
    const a = apurar(
      [
        venda({ pedido_externo_id: "h1", plataforma: "plataforma_b", status: "reembolsada" }),
        venda({ pedido_externo_id: "h2", plataforma: "plataforma_b" }),
        venda({ pedido_externo_id: "g1", plataforma: "plataforma_a" }),
      ],
      TAXAS,
      [],
    );
    expect(a.porPlataforma.plataforma_b.pedidosVendidos).toBe(2);
    expect(a.porPlataforma.plataforma_b.pedidosReembolsados).toBe(1);
    expect(a.porPlataforma.plataforma_a.pedidosReembolsados).toBe(0);
  });
});

describe("serie diaria com reembolso", () => {
  test("a devolucao aparece no dia em que aconteceu, e nao no dia da venda", () => {
    const linhas = [
      venda({
        valor_bruto: 300,
        status: "reembolsada",
        ocorrido_dia: "2026-09-01",
        reembolsado_dia: "2026-09-03",
      }),
    ];
    const serie = serieDiaria(["2026-09-01", "2026-09-02", "2026-09-03"], linhas, TAXAS, []);
    perto(serie[0]!.faturamento, 300);
    perto(serie[1]!.faturamento, 0);
    perto(serie[2]!.faturamento, -300);
  });
});
