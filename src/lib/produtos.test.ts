import { describe, expect, test } from "bun:test";
import { apurar, type Taxa, type Venda } from "./financeiro";
import {
  SEM_NOME,
  abrirFaturas,
  apurarPorProduto,
  chaveProduto,
  comparacaoMensal,
  conversaoDosBumps,
  conversaoMensal,
  itensDaFatura,
  mesesDaComparacao,
  type ItemDaFatura,
} from "./produtos";

const PLATAFORMA_A: Taxa = {
  plataforma: "plataforma_a",
  vigencia_inicio: "2020-01-01",
  faixa_min: 0,
  faixa_max: null,
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
const SETEMBRO = { inicio: "2026-09-01", fim: "2026-09-30" };

function venda(over: Partial<Venda> = {}): Venda {
  return {
    id: crypto.randomUUID(),
    plataforma: "plataforma_a",
    pedido_externo_id: crypto.randomUUID(),
    produto_nome: "PRODUTO 1",
    tipo: "principal",
    valor_bruto: 397,
    juros_parcelamento: 0,
    taxa_coprodutor: 0,
    taxa_afiliado: 0,
    custo_produto: 0,
    liquido_plataforma: null,
    parcelas: 1,
    metodo_pagamento: "pix",
    status: "aprovada",
    ocorrido_em: "2026-09-10T14:00:00Z",
    ocorrido_dia: "2026-09-10",
    reembolsado_dia: null,
    cliente_email: "cliente@exemplo.com",
    cliente_nome: "Cliente",
    ...over,
  };
}

const porProduto = (vendas: Venda[], periodo = SETEMBRO) =>
  apurarPorProduto(vendas, TAXAS, 6, vendas, periodo);

describe("nome do produto", () => {
  test("caixa, acento e espaço repetido não separam o mesmo produto", () => {
    expect(chaveProduto("PRODUTO 1")).toBe(chaveProduto("Produto 1"));
    expect(chaveProduto("PRODUTO 3  (KIT)")).toBe(
      chaveProduto("PRODUTO 3 (KIT)"),
    );
    expect(chaveProduto("PRODUTO 5 EDIÇÃO")).toBe(chaveProduto("Produto 5 Edicao"));
    expect(chaveProduto("  Produto 7 ")).toBe("PRODUTO 7");
  });

  test("produtos diferentes continuam separados", () => {
    expect(chaveProduto("PRODUTO 1")).not.toBe(chaveProduto("PRODUTO 2"));
  });

  test("sem nome vira chave vazia", () => {
    expect(chaveProduto(null)).toBe("");
    expect(chaveProduto("   ")).toBe("");
  });
});

describe("tabela por produto", () => {
  test("junta as grafias e mostra a mais comum, sem o espaço duplo", () => {
    const { linhas } = porProduto([
      venda({ produto_nome: "PRODUTO 1" }),
      venda({ produto_nome: "PRODUTO 1" }),
      venda({ produto_nome: "Produto 1", plataforma: "plataforma_b" }),
      venda({ produto_nome: "PRODUTO 3  (KIT)", valor_bruto: 137 }),
    ]);
    expect(linhas.map((l) => [l.nome, l.vendas])).toEqual([
      ["PRODUTO 1", 3],
      ["PRODUTO 3 (KIT)", 1],
    ]);
    expect(linhas[0]!.plataformas).toEqual(["plataforma_a", "plataforma_b"]);
  });

  test("a soma dos produtos dá o Dashboard", () => {
    const vendas = [
      venda({ valor_bruto: 397 }),
      venda({ valor_bruto: 197 }),
      venda({ produto_nome: "PRODUTO 3", valor_bruto: 137 }),
      venda({
        plataforma: "plataforma_b",
        produto_nome: "PRODUTO 2",
        valor_bruto: 397,
        juros_parcelamento: 35.24,
        liquido_plataforma: 375.72,
      }),
      venda({
        produto_nome: "PRODUTO 6",
        valor_bruto: 47,
        status: "reembolsada",
        reembolsado_dia: "2026-09-12",
      }),
    ];
    const { linhas, total } = porProduto(vendas);
    const dashboard = apurar(vendas, TAXAS, [], [], 6, vendas, SETEMBRO);

    const soma = (f: (l: (typeof linhas)[number]) => number) =>
      linhas.reduce((s, l) => s + f(l), 0);
    expect(soma((l) => l.faturamentoBruto)).toBeCloseTo(dashboard.faturamentoBruto, 2);
    expect(soma((l) => l.faturamentoLiquido)).toBeCloseTo(dashboard.faturamentoLiquido, 2);
    expect(total.faturamentoBruto).toBeCloseTo(dashboard.faturamentoBruto, 2);
    expect(total.faturamentoLiquido).toBeCloseTo(dashboard.faturamentoLiquido, 2);
    expect(soma((l) => l.participacao ?? 0)).toBeCloseTo(1, 6);
  });

  test("ordena pelo faturamento e calcula preço médio e reembolso", () => {
    const { linhas } = porProduto([
      venda({ valor_bruto: 397 }),
      venda({ valor_bruto: 197 }),
      venda({ valor_bruto: 147, status: "reembolsada", reembolsado_dia: "2026-09-20" }),
      venda({ produto_nome: "PRODUTO 7", valor_bruto: 54.9 }),
    ]);
    const p1 = linhas[0]!;
    expect(p1.nome).toBe("PRODUTO 1");
    expect(p1.vendas).toBe(3);
    expect(p1.precoMedio).toBeCloseTo((397 + 197 + 147) / 3, 2);
    expect(p1.reembolsos).toBe(1);
    expect(p1.valorReembolsado).toBe(147);
    expect(p1.taxaReembolso).toBeCloseTo(1 / 3, 6);
    expect(p1.faturamentoBruto).toBeCloseTo(397 + 197, 2);
    expect(linhas[1]!.nome).toBe("PRODUTO 7");
  });

  test("venda pela data dela, reembolso pela data do estorno", () => {
    const vendas = [
      // Vendida em agosto e devolvida em setembro: em setembro só é devolução.
      venda({ ocorrido_dia: "2026-08-28", status: "reembolsada", reembolsado_dia: "2026-09-02" }),
      venda({ ocorrido_dia: "2026-09-05" }),
    ];
    const p1 = porProduto(vendas).linhas[0]!;
    expect(p1.vendas).toBe(1);
    expect(p1.reembolsos).toBe(1);
    expect(p1.faturamentoBruto).toBeCloseTo(0, 2);
  });

  test("produto que só teve pix em aberto ou cobrança recusada não aparece", () => {
    const { linhas } = porProduto([
      venda(),
      venda({ produto_nome: "PRODUTO 5 EDIÇÃO", status: "pendente" }),
      venda({ produto_nome: "PRODUTO 5 EDIÇÃO", status: "nao_paga" }),
    ]);
    expect(linhas.map((l) => l.nome)).toEqual(["PRODUTO 1"]);
  });

  test("venda sem nome de produto ganha uma linha própria", () => {
    const { linhas } = porProduto([venda({ produto_nome: null })]);
    expect(linhas[0]!.nome).toBe(SEM_NOME);
  });

  test("período sem venda não divide por zero", () => {
    const { linhas, total } = porProduto([]);
    expect(linhas).toEqual([]);
    expect(total.participacao).toBeNull();
    expect(total.precoMedio).toBeNull();
    expect(total.taxaReembolso).toBeNull();
  });
});

describe("meses da comparação", () => {
  test("começa no início dos dados, e o mês atual vai até hoje", () => {
    expect(mesesDaComparacao("2026-10-06", 6, "2026-09-01")).toEqual([
      { inicio: "2026-09-01", fim: "2026-09-30" },
      { inicio: "2026-10-01", fim: "2026-10-06" },
    ]);
  });

  test("nunca passa do número de meses pedido", () => {
    const meses = mesesDaComparacao("2027-06-15", 6, "2026-09-01");
    expect(meses).toHaveLength(6);
    expect(meses[0]!.inicio).toBe("2027-01-01");
    expect(meses[5]).toEqual({ inicio: "2027-06-01", fim: "2027-06-15" });
  });

  test("atravessa a virada do ano", () => {
    expect(mesesDaComparacao("2027-01-10", 3, "2026-09-01").map((m) => m.inicio)).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
    ]);
  });
});

describe("comparação mês a mês", () => {
  const AGOSTO = { inicio: "2026-08-01", fim: "2026-08-31" };

  test("cada coluna bate com a tabela do mês", () => {
    const vendas = [
      venda({ ocorrido_dia: "2026-08-10", valor_bruto: 397 }),
      venda({ ocorrido_dia: "2026-09-10", valor_bruto: 197 }),
      venda({ ocorrido_dia: "2026-09-11", produto_nome: "PRODUTO 3", valor_bruto: 137 }),
    ];
    const { linhas, totais } = comparacaoMensal(vendas, TAXAS, 6, [AGOSTO, SETEMBRO]);

    const p1 = linhas.find((l) => l.nome === "PRODUTO 1")!;
    expect(p1.meses.map((c) => c?.faturamentoBruto)).toEqual([397, 197]);
    expect(p1.meses.map((c) => c?.vendas)).toEqual([1, 1]);

    // O kit não vendeu em agosto: a célula fica vazia, e não zerada.
    const kit = linhas.find((l) => l.nome === "PRODUTO 3")!;
    expect(kit.meses[0]).toBeNull();

    const setembro = porProduto(vendas, SETEMBRO);
    expect(totais[1]!.faturamentoBruto).toBeCloseTo(setembro.total.faturamentoBruto, 2);
    expect(totais[1]!.faturamentoLiquido).toBeCloseTo(setembro.total.faturamentoLiquido, 2);
  });

  test("ordena pelo faturamento somado dos meses", () => {
    const vendas = [
      venda({ ocorrido_dia: "2026-08-10", produto_nome: "PRODUTO 7", valor_bruto: 54.9 }),
      venda({ ocorrido_dia: "2026-09-10", valor_bruto: 397 }),
    ];
    const { linhas } = comparacaoMensal(vendas, TAXAS, 6, [AGOSTO, SETEMBRO]);
    expect(linhas.map((l) => l.nome)).toEqual(["PRODUTO 1", "PRODUTO 7"]);
  });
});

/** Os produtos de uma fatura da Plataforma B como o aviso traz, em `event.products`. */
function produtosDoAviso(...itens: [nome: string, centavos: number, orderBump: boolean][]) {
  return itens.map(([name, amountCents, isOrderBump]) => ({
    id: name,
    name,
    offers: [{ id: `oferta-${name}`, name, cohorts: [], amountCents, isOrderBump }],
  }));
}

const FATURA_P2_COMPLETA = produtosDoAviso(
  ["PRODUTO 2", 39700, false],
  ["PRODUTO 7", 5990, true],
  ["PRODUTO 5 EDIÇÃO", 9990, true],
  ["PRODUTO 3 (KIT)", 13700, true],
);

const FATURA_P2_COM_P3 = produtosDoAviso(
  ["PRODUTO 2", 39700, false],
  ["PRODUTO 3 (KIT)", 13700, true],
);

const FATURA_P2_SOZINHO: ItemDaFatura[] = [
  { nome: "PRODUTO 2", valor: 397, orderBump: false },
];

function plataforma_b(over: Partial<Venda> = {}): Venda {
  return venda({ plataforma: "plataforma_b", produto_nome: "PRODUTO 2", ...over });
}

describe("produtos da fatura da Plataforma B", () => {
  test("lê nome, preço e order bump de cada produto", () => {
    expect(itensDaFatura(FATURA_P2_COMPLETA)).toEqual([
      { nome: "PRODUTO 2", valor: 397, orderBump: false },
      { nome: "PRODUTO 7", valor: 59.9, orderBump: true },
      { nome: "PRODUTO 5 EDIÇÃO", valor: 99.9, orderBump: true },
      { nome: "PRODUTO 3 (KIT)", valor: 137, orderBump: true },
    ]);
  });

  test("venda importada por planilha, sem o detalhe, devolve nulo", () => {
    expect(itensDaFatura(null)).toBeNull();
    expect(itensDaFatura([])).toBeNull();
    expect(itensDaFatura([{ name: "PRODUTO 2" }])).toBeNull();
    expect(itensDaFatura([{ name: "PRODUTO 2", offers: [{ amountCents: "abc" }] }])).toBeNull();
  });
});

describe("fatura aberta nos produtos", () => {
  test("cada produto fica com a fatia dele, e a soma continua dando a fatura", () => {
    const fatura = plataforma_b({ valor_bruto: 693.8, juros_parcelamento: 70, liquido_plataforma: 680 });
    const { vendas, semDetalhe } = abrirFaturas(
      [fatura],
      new Map([[fatura.id, itensDaFatura(FATURA_P2_COMPLETA)!]]),
    );

    expect(semDetalhe.size).toBe(0);
    expect(vendas.map((v) => [v.produto_nome, v.tipo])).toEqual([
      ["PRODUTO 2", "principal"],
      ["PRODUTO 7", "bump"],
      ["PRODUTO 5 EDIÇÃO", "bump"],
      ["PRODUTO 3 (KIT)", "bump"],
    ]);
    expect(vendas[0]!.valor_bruto).toBeCloseTo(397, 6);
    expect(vendas[3]!.valor_bruto).toBeCloseTo(137, 6);
    const soma = (f: (v: Venda) => number) => vendas.reduce((s, v) => s + f(v), 0);
    expect(soma((v) => v.valor_bruto)).toBeCloseTo(693.8, 6);
    expect(soma((v) => v.juros_parcelamento)).toBeCloseTo(70, 6);
    expect(soma((v) => v.liquido_plataforma ?? 0)).toBeCloseTo(680, 6);
    // O pedido continua um só: ticket médio e CPA não mudam.
    expect(new Set(vendas.map((v) => v.pedido_externo_id)).size).toBe(1);
    expect(new Set(vendas.map((v) => v.id)).size).toBe(4);
  });

  test("a tabela por produto continua batendo com o Dashboard", () => {
    const fatura = plataforma_b({ valor_bruto: 693.8, liquido_plataforma: 650 });
    const { vendas } = abrirFaturas(
      [fatura],
      new Map([[fatura.id, itensDaFatura(FATURA_P2_COMPLETA)!]]),
    );
    const dashboard = apurar([fatura], TAXAS, [], [], 6, [fatura], SETEMBRO);
    const { linhas, total } = porProduto(vendas);

    expect(total.faturamentoBruto).toBeCloseTo(dashboard.faturamentoBruto, 6);
    expect(total.faturamentoLiquido).toBeCloseTo(dashboard.faturamentoLiquido, 6);
    const kit = linhas.find((l) => l.nome === "PRODUTO 3 (KIT)")!;
    expect(kit.faturamentoBruto).toBeCloseTo(137, 6);
  });

  test("sem o líquido informado, o fixo da Plataforma B continua cobrado uma vez por fatura", () => {
    const fatura = plataforma_b({ valor_bruto: 534, liquido_plataforma: null });
    const { vendas } = abrirFaturas([fatura], new Map([[fatura.id, itensDaFatura(FATURA_P2_COM_P3)!]]));
    const antes = apurar([fatura], TAXAS, [], [], 6, [fatura], SETEMBRO);
    const depois = apurar(vendas, TAXAS, [], [], 6, vendas, SETEMBRO);
    expect(depois.taxaGateway).toBeCloseTo(antes.taxaGateway, 6);
  });

  test("Plataforma A e fatura de um produto só não mudam; venda sem detalhe fica marcada", () => {
    const plataforma_a = venda();
    const sozinho = plataforma_b();
    const importada = plataforma_b({ valor_bruto: 534 });
    const { vendas, semDetalhe } = abrirFaturas(
      [plataforma_a, sozinho, importada],
      new Map([[sozinho.id, FATURA_P2_SOZINHO]]),
    );
    expect(vendas).toEqual([plataforma_a, sozinho, importada]);
    expect([...semDetalhe]).toEqual([importada.pedido_externo_id!]);
  });

  test("um reembolso da fatura devolve todos os produtos dela", () => {
    const fatura = plataforma_b({
      valor_bruto: 534,
      status: "reembolsada",
      reembolsado_dia: "2026-09-15",
    });
    const { vendas } = abrirFaturas([fatura], new Map([[fatura.id, itensDaFatura(FATURA_P2_COM_P3)!]]));
    const { linhas } = porProduto(vendas);
    expect(linhas.map((l) => [l.nome, l.reembolsos])).toEqual([
      ["PRODUTO 2", 1],
      ["PRODUTO 3 (KIT)", 1],
    ]);
    expect(linhas[0]!.valorReembolsado).toBeCloseTo(397, 6);
  });
});

describe("conversão dos order bumps", () => {
  /** Pedido da Plataforma A: cada produto é uma venda, agrupada pelo `pedido_chave`. */
  function pedidoPlataformaA(itens: [nome: string, numero: number, valor: number][], cabeca = 0) {
    const chave = String(itens[cabeca]![1]);
    return itens.map(([produto_nome, numero, valor_bruto], i) =>
      venda({
        produto_nome,
        pedido_externo_id: String(numero),
        pedido_chave: i === cabeca ? null : chave,
        valor_bruto,
      }),
    );
  }

  const conversao = (vendas: Venda[], itens = new Map<string, ItemDaFatura[]>()) =>
    conversaoDosBumps(abrirFaturas(vendas, itens), SETEMBRO);

  test("na Plataforma A, o principal é a venda de menor número, mesmo com o pedido agrupado pelo order bump", () => {
    // O banco agrupou o pedido no order bump (10089956), com o principal
    // (10089955) apontando para ele.
    const vendas = pedidoPlataformaA(
      [
        ["PRODUTO 1", 10089955, 397],
        ["PRODUTO 3  (KIT)", 10089956, 137],
      ],
      1,
    );
    const { produtos } = conversao(vendas);
    expect(produtos.map((p) => [p.nome, p.pedidos, p.bumps.map((b) => b.nome)])).toEqual([
      ["PRODUTO 1", 1, ["PRODUTO 3 (KIT)"]],
    ]);
  });

  test("o order bump de R$ 49,90 continua sendo bump do principal de R$ 47", () => {
    const { produtos } = conversao(
      pedidoPlataformaA([
        ["PRODUTO 6", 10082017, 47],
        ["PRODUTO 3  (KIT)", 10082018, 49.9],
      ]),
    );
    expect(produtos[0]!.nome).toBe("PRODUTO 6");
    expect(produtos[0]!.bumps[0]!.nome).toBe("PRODUTO 3 (KIT)");
  });

  test("conta a conversão de cada order bump sobre os pedidos do principal", () => {
    const comKit = plataforma_b({ valor_bruto: 534 });
    const comTudo = plataforma_b({ valor_bruto: 693.8 });
    const sozinhos = [plataforma_b(), plataforma_b(), plataforma_b()];
    const itens = new Map<string, ItemDaFatura[]>([
      [comKit.id, itensDaFatura(FATURA_P2_COM_P3)!],
      [comTudo.id, itensDaFatura(FATURA_P2_COMPLETA)!],
      ...sozinhos.map((v): [string, ItemDaFatura[]] => [v.id, FATURA_P2_SOZINHO]),
    ]);
    const { produtos, semDetalhe } = conversao([comKit, comTudo, ...sozinhos], itens);

    expect(semDetalhe).toBe(0);
    const p2 = produtos[0]!;
    expect(p2.nome).toBe("PRODUTO 2");
    expect(p2.pedidos).toBe(5);
    expect(p2.bumps.map((b) => [b.nome, b.pedidos, b.taxa])).toEqual([
      ["PRODUTO 3 (KIT)", 2, 0.4],
      ["PRODUTO 5 EDIÇÃO", 1, 0.2],
      ["PRODUTO 7", 1, 0.2],
    ]);
  });

  test("pedido reembolsado conta; pix em aberto, cobrança recusada e outro mês não", () => {
    const { produtos } = conversao([
      ...pedidoPlataformaA([
        ["PRODUTO 1", 1, 397],
        ["PRODUTO 3", 2, 137],
      ]),
      venda({ status: "reembolsada", reembolsado_dia: "2026-09-20" }),
      venda({ status: "pendente" }),
      venda({ status: "nao_paga" }),
      venda({ ocorrido_dia: "2026-10-01" }),
    ]);
    expect(produtos[0]!.pedidos).toBe(2);
    expect(produtos[0]!.bumps[0]!.taxa).toBe(0.5);
  });

  test("pedido da Plataforma B sem o detalhe fica fora da conta, e a tela diz quantos", () => {
    const { produtos, semDetalhe } = conversao([plataforma_b({ valor_bruto: 534 }), venda()]);
    expect(semDetalhe).toBe(1);
    expect(produtos.map((p) => [p.nome, p.pedidos])).toEqual([["PRODUTO 1", 1]]);
  });

  test("mês a mês: sem order bump aparece 0%, e sem pedido do principal fica vazio", () => {
    const OUTUBRO = { inicio: "2026-10-01", fim: "2026-10-31" };
    const NOVEMBRO = { inicio: "2026-11-01", fim: "2026-11-30" };
    const vendas = [
      ...pedidoPlataformaA([
        ["PRODUTO 1", 1, 397],
        ["PRODUTO 3", 2, 137],
      ]),
      venda(),
      venda({ ocorrido_dia: "2026-10-05" }),
    ];
    const { linhas, semDetalhe } = conversaoMensal(abrirFaturas(vendas, new Map()), [
      SETEMBRO,
      OUTUBRO,
      NOVEMBRO,
    ]);
    expect(semDetalhe).toEqual([0, 0, 0]);
    expect(linhas.map((l) => [l.bump, l.principal])).toEqual([["PRODUTO 3", "PRODUTO 1"]]);
    expect(linhas[0]!.meses).toEqual([
      { pedidos: 2, comBump: 1, taxa: 0.5 },
      { pedidos: 1, comBump: 0, taxa: 0 },
      null,
    ]);
  });
});
