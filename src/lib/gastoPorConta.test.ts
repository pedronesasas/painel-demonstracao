import { describe, expect, test } from "bun:test";
import {
  apurarPorConta,
  comValorNumerico,
  eixoReais,
  fimDoPeriodo,
  marcasDoEixo,
  seriesDoGrafico,
  valorDaSerie,
  type GastoDaConta,
  type GastoLancado,
  type ResumoConta,
} from "./gastoPorConta";
import type { CanalTrafego } from "./financeiro";

const DIA_1 = "2026-09-10";
const DIA_2 = "2026-09-11";
const DIA_3 = "2026-09-12";

function lancado(data: string, valor: number, canal: CanalTrafego = "meta"): GastoLancado {
  return { data, canal, valor };
}

/** "conta-a" vira "Conta A", e a linha nasce fechada, gravada no fim do dia. */
function daConta(
  contaId: string,
  data: string,
  valor: number,
  outros: Partial<GastoDaConta> = {},
): GastoDaConta {
  return {
    data,
    canal: "meta",
    conta_id: contaId,
    conta_nome: `Conta ${contaId.slice(-1).toUpperCase()}`,
    valor,
    fechado: true,
    atualizado_em: `${data}T23:00:00Z`,
    ...outros,
  };
}

describe("gasto lançado contra gasto por conta", () => {
  test("o que as contas não explicam fica sem conta identificada", () => {
    const r = apurarPorConta(
      [lancado(DIA_1, 1000)],
      [daConta("conta-a", DIA_1, 600), daConta("conta-b", DIA_1, 300)],
      [DIA_1],
    );
    expect(r.totalLancado).toBe(1000);
    expect(r.totalIdentificado).toBe(900);
    expect(r.semConta).toBe(100);
    expect(r.excedente).toBe(0);
    expect(r.diasComExcedente).toHaveLength(0);
    expect(r.contas.map((c) => [c.contaId, c.valor, c.participacao])).toEqual([
      ["conta-a", 600, 0.6],
      ["conta-b", 300, 0.3],
    ]);
  });

  test("a conta é dia a dia: a sobra de um dia não esconde o gasto sem conta de outro", () => {
    // No mês, 200 lançados contra 170 das contas daria só 30 sem conta. Mas
    // no dia 2 há 50 que ninguém explica, e no dia 1 as contas passaram 20
    // do lançado — dois problemas, e não um de 30.
    const r = apurarPorConta(
      [lancado(DIA_1, 100), lancado(DIA_2, 100)],
      [daConta("conta-a", DIA_1, 120), daConta("conta-a", DIA_2, 50)],
      [DIA_1, DIA_2],
    );
    expect(r.semConta).toBe(50);
    expect(r.excedente).toBe(20);
    expect(r.diasSemConta).toBe(1);
    expect(r.diasComExcedente.map((d) => [d.data, d.lancado, d.identificado, d.excedente])).toEqual(
      [[DIA_1, 100, 120, 20]],
    );
    // O dia com excedente não tem gasto sem conta: nada ficou sem dono.
    expect(r.dias[0]!.semConta).toBe(0);
  });

  test("dia com gasto por conta e nada lançado vai para o aviso", () => {
    const r = apurarPorConta([], [daConta("conta-a", DIA_1, 80)], [DIA_1]);
    expect(r.totalLancado).toBe(0);
    expect(r.excedente).toBe(80);
    expect(r.diasComExcedente).toHaveLength(1);
    // Sem lançado não há do que tirar fatia.
    expect(r.contas[0]!.participacao).toBeNull();
  });

  test("dia parcial com contas acima do lançado continua no aviso, marcado como parcial", () => {
    // É o dia de hoje com o gasto por conta puxado depois do lançado: a
    // diferença pode sumir quando o dia fechar, e a tela precisa saber disso.
    const r = apurarPorConta(
      [lancado(DIA_1, 100)],
      [daConta("conta-a", DIA_1, 100.01, { fechado: false })],
      [DIA_1],
    );
    expect(r.diasComExcedente.map((d) => [d.data, d.excedente, d.parcial])).toEqual([
      [DIA_1, 0.01, true],
    ]);
  });

  test("soma em centavos: 0,10 + 0,20 bate com 0,30 e não gera aviso", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // o motivo do teste
    const r = apurarPorConta(
      [lancado(DIA_1, 0.3), lancado(DIA_2, 1234.56)],
      [
        daConta("conta-a", DIA_1, 0.1),
        daConta("conta-b", DIA_1, 0.2),
        daConta("conta-a", DIA_2, 1000.01),
        daConta("conta-b", DIA_2, 200.25),
        daConta("conta-c", DIA_2, 34.3),
      ],
      [DIA_1, DIA_2],
    );
    expect(r.dias[0]!.identificado).toBe(0.3);
    expect(r.totalIdentificado).toBe(1234.86);
    expect(r.semConta).toBe(0);
    expect(r.excedente).toBe(0);
    expect(r.diasComExcedente).toHaveLength(0);
  });

  test("valor de numeric que chega como texto vira número antes de somar", () => {
    const lancados = comValorNumerico([{ ...lancado(DIA_1, 0), valor: "1000.00" }]);
    const contas = comValorNumerico([
      { ...daConta("conta-a", DIA_1, 0), valor: "600.10" },
      { ...daConta("conta-b", DIA_1, 0), valor: "300.20" },
    ]);
    expect(contas.map((c) => c.valor)).toEqual([600.1, 300.2]);
    const r = apurarPorConta(lancados, contas, [DIA_1]);
    expect([r.totalLancado, r.totalIdentificado, r.semConta]).toEqual([1000, 900.3, 99.7]);
  });

  test("a série cobre todos os dias pedidos, inclusive os sem gasto", () => {
    const r = apurarPorConta(
      [lancado(DIA_2, 300)],
      [daConta("conta-a", DIA_2, 300)],
      [DIA_1, DIA_2, DIA_3],
    );
    expect(r.dias.map((d) => d.data)).toEqual([DIA_1, DIA_2, DIA_3]);
    expect(r.dias[0]).toEqual({
      data: DIA_1,
      lancado: 0,
      identificado: 0,
      semConta: 0,
      excedente: 0,
      porConta: {},
      parcial: false,
    });
    expect(r.diasComLancado).toBe(1);
  });

  test("dia repetido na lista não conta duas vezes", () => {
    const r = apurarPorConta([lancado(DIA_1, 100)], [], [DIA_1, DIA_1]);
    expect(r.dias).toHaveLength(1);
    expect(r.totalLancado).toBe(100);
  });

  test("fica de fora o que é de outro canal ou de fora do período", () => {
    const r = apurarPorConta(
      [lancado(DIA_1, 1000), lancado(DIA_1, 500, "google"), lancado(DIA_3, 700)],
      [
        daConta("conta-a", DIA_1, 400),
        daConta("conta-g", DIA_1, 500, { canal: "google" }),
        daConta("conta-a", DIA_3, 700),
      ],
      [DIA_1, DIA_2],
    );
    expect(r.totalLancado).toBe(1000);
    expect(r.totalIdentificado).toBe(400);
    expect(r.semConta).toBe(600);
    expect(r.contas.map((c) => c.contaId)).toEqual(["conta-a"]);
    expect(r.contas[0]!.valor).toBe(400);
  });

  test("o mês vai do dia 1 ao último, inclusive", () => {
    // Os dias montados aqui mesmo, e não com o helper da tela: o teste não
    // pode herdar um erro de quem ele confere.
    const setembro = Array.from(
      { length: 30 },
      (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`,
    );
    const r = apurarPorConta(
      [
        lancado("2026-08-31", 1),
        lancado("2026-09-01", 10),
        lancado("2026-09-30", 20),
        lancado("2026-10-01", 1000),
      ],
      [
        daConta("conta-a", "2026-08-31", 5),
        daConta("conta-a", "2026-09-01", 10),
        daConta("conta-a", "2026-09-30", 15),
        daConta("conta-a", "2026-10-01", 500),
      ],
      setembro,
    );
    expect([
      r.dias.length,
      r.totalLancado,
      r.totalIdentificado,
      r.semConta,
      r.contas[0]!.diasComGasto,
    ]).toEqual([30, 30, 25, 5, 2]);
  });
});

describe("contas", () => {
  test("da que mais gastou para a que menos, com os dias em que gastou", () => {
    const r = apurarPorConta(
      [lancado(DIA_1, 600), lancado(DIA_2, 100)],
      [
        daConta("conta-a", DIA_1, 100),
        daConta("conta-a", DIA_2, 100),
        daConta("conta-b", DIA_1, 500),
      ],
      [DIA_1, DIA_2],
    );
    expect(r.contas.map((c) => [c.contaId, c.valor, c.diasComGasto])).toEqual([
      ["conta-b", 500, 1],
      ["conta-a", 200, 2],
    ]);
  });

  // A tela recebe as linhas ordenadas pelo `id`, um uuid aleatório: a ordem de
  // chegada não quer dizer nada. Por isso cada caso roda nas duas ordens — numa
  // só, uma versão que ficasse com a primeira linha também passaria.
  const nasDuasOrdens = (linhas: GastoDaConta[]) => [linhas, [...linhas].reverse()];

  test("o nome é o da linha gravada por último, mesmo que seja de um dia mais antigo", () => {
    // O dia 1 foi reconferido depois que a conta foi renomeada. O carimbo vem
    // no formato do Supabase, com microssegundos e fuso.
    const linhas = [
      daConta("conta-a", DIA_1, 10, {
        conta_nome: "Conta A renomeada",
        atualizado_em: "2026-09-20T10:00:00.123456+00:00",
      }),
      daConta("conta-a", DIA_2, 10, {
        conta_nome: "Conta A",
        atualizado_em: "2026-09-12T10:00:00.654321+00:00",
      }),
    ];
    for (const ordem of nasDuasOrdens(linhas)) {
      expect(apurarPorConta([], ordem, [DIA_1, DIA_2]).contas[0]!.nome).toBe("Conta A renomeada");
    }
  });

  test("gravadas no mesmo instante, vale o nome do dia mais novo", () => {
    const instante = "2026-09-20T10:00:00.123456+00:00";
    const linhas = [
      daConta("conta-a", DIA_2, 10, { conta_nome: "Conta A nova", atualizado_em: instante }),
      daConta("conta-a", DIA_1, 10, { conta_nome: "Conta A velha", atualizado_em: instante }),
    ];
    for (const ordem of nasDuasOrdens(linhas)) {
      expect(apurarPorConta([], ordem, [DIA_1, DIA_2]).contas[0]!.nome).toBe("Conta A nova");
    }
  });

  test("nome em branco mostra o identificador", () => {
    const r = apurarPorConta([], [daConta("conta-a", DIA_1, 10, { conta_nome: "  " })], [DIA_1]);
    expect(r.contas[0]!.nome).toBe("conta-a");
  });

  test("parcial se algum dia da conta ainda não foi fechado", () => {
    const r = apurarPorConta(
      [lancado(DIA_1, 300), lancado(DIA_2, 300)],
      [
        daConta("conta-a", DIA_1, 100),
        daConta("conta-a", DIA_2, 100, { fechado: false }),
        daConta("conta-b", DIA_1, 200),
        daConta("conta-b", DIA_2, 200),
      ],
      [DIA_1, DIA_2],
    );
    const parcial = Object.fromEntries(r.contas.map((c) => [c.contaId, c.parcial]));
    expect(parcial).toEqual({ "conta-a": true, "conta-b": false });
    expect(r.dias.map((d) => d.parcial)).toEqual([false, true]);
  });

  test("conta só com gasto zerado não aparece", () => {
    const r = apurarPorConta(
      [lancado(DIA_1, 100)],
      [daConta("conta-a", DIA_1, 100), daConta("conta-z", DIA_1, 0)],
      [DIA_1],
    );
    expect(r.contas.map((c) => c.contaId)).toEqual(["conta-a"]);
    expect(r.dias[0]!.porConta).toEqual({ "conta-a": 100 });
  });

  test("dia com linha zerada não conta como dia com gasto", () => {
    const r = apurarPorConta(
      [lancado(DIA_1, 100), lancado(DIA_2, 100)],
      [daConta("conta-a", DIA_1, 100), daConta("conta-a", DIA_2, 0)],
      [DIA_1, DIA_2],
    );
    expect(r.contas[0]!.diasComGasto).toBe(1);
    expect(r.dias[1]!.porConta).toEqual({});
  });
});

function conta(contaId: string, valor: number): ResumoConta {
  return {
    contaId,
    nome: `Conta ${contaId.slice(-1).toUpperCase()}`,
    valor,
    participacao: null,
    diasComGasto: 1,
    parcial: false,
  };
}

describe("séries do gráfico", () => {
  test("em ordem de conta, e não de gasto: a cor segue a conta", () => {
    const setembro = seriesDoGrafico([conta("conta-b", 900), conta("conta-a", 100)], 5);
    const outubro = seriesDoGrafico([conta("conta-a", 900), conta("conta-b", 100)], 5);
    expect(setembro.map((s) => [s.chave, s.contaIds])).toEqual([
      ["conta0", ["conta-a"]],
      ["conta1", ["conta-b"]],
    ]);
    // Gastar mais num mês não troca a cor da conta.
    expect(outubro).toEqual(setembro);
  });

  test("com mais contas que cores, as que menos gastaram viram Outras contas", () => {
    const contas = [
      conta("conta-a", 10),
      conta("conta-b", 600),
      conta("conta-c", 500),
      conta("conta-d", 20),
      conta("conta-e", 400),
      conta("conta-f", 300),
    ];
    const series = seriesDoGrafico(contas, 5);
    expect(series).toHaveLength(5);
    // As quatro que mais gastaram, em ordem de conta...
    expect(series.slice(0, 4).map((s) => s.contaIds[0])).toEqual([
      "conta-b",
      "conta-c",
      "conta-e",
      "conta-f",
    ]);
    // ...e as duas menores juntas na última cor.
    expect(series[4]).toEqual({
      chave: "outras",
      nome: "Outras 2 contas",
      contaIds: ["conta-d", "conta-a"],
    });
  });

  test("com cores de sobra, nenhuma conta é juntada", () => {
    const series = seriesDoGrafico([conta("conta-a", 1), conta("conta-b", 2)], 5);
    expect(series.map((s) => s.chave)).toEqual(["conta0", "conta1"]);
  });

  test("com exatamente tantas contas quanto cores, nenhuma é juntada", () => {
    const cinco = ["a", "b", "c", "d", "e"].map((x, i) => conta(`conta-${x}`, 10 * (i + 1)));
    expect(seriesDoGrafico(cinco, 5).map((s) => s.chave)).toEqual([
      "conta0",
      "conta1",
      "conta2",
      "conta3",
      "conta4",
    ]);
  });

  test("o valor da série soma as contas dela no dia, em centavos", () => {
    const r = apurarPorConta(
      [lancado(DIA_1, 1)],
      [daConta("conta-a", DIA_1, 0.1), daConta("conta-b", DIA_1, 0.2)],
      [DIA_1],
    );
    const outras = { chave: "outras", nome: "Outras 2 contas", contaIds: ["conta-a", "conta-b"] };
    expect(valorDaSerie(r.dias[0]!, outras)).toBe(0.3);
    expect(valorDaSerie(r.dias[0]!, { chave: "x", nome: "X", contaIds: ["conta-x"] })).toBe(0);
  });
});

describe("eixo do gráfico", () => {
  test("marcas redondas, e nenhum rótulo arredondado", () => {
    // Com uma casa só no "k", a linha de R$ 1.250 saía escrita "1,3k".
    expect(marcasDoEixo(1100).map(eixoReais)).toEqual(["0", "250", "500", "750", "1k", "1,25k"]);
    expect(marcasDoEixo(11000).map(eixoReais)).toEqual(["0", "2,5k", "5k", "7,5k", "10k", "12,5k"]);
  });

  test("mês sem gasto fica com o eixo só no zero", () => {
    expect(marcasDoEixo(0)).toEqual([0]);
  });
});

describe("período da aba", () => {
  test("mês passado vai até o último dia; o corrente, só até hoje", () => {
    expect(fimDoPeriodo("2026-08-31", "2026-09-15")).toBe("2026-08-31");
    expect(fimDoPeriodo("2026-09-30", "2026-09-15")).toBe("2026-09-15");
    // No último dia do mês, os dois cortes caem no mesmo dia.
    expect(fimDoPeriodo("2026-09-30", "2026-09-30")).toBe("2026-09-30");
  });
});
