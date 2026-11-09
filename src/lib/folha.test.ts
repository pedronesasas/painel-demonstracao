import { describe, expect, test } from "bun:test";
import {
  dataDePagamento,
  proporcaoDoMes,
  repartir,
  vigentesEm,
  type Remuneracao,
} from "@/lib/folha";

function pessoa(p: Partial<Remuneracao> & { nome: string }): Remuneracao {
  return {
    pessoa_id: p.nome,
    base: "percentual_lucro",
    classe: "colaborador",
    valor_fixo: null,
    percentual: null,
    periodicidade: "mensal",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
    ...p,
  };
}

// Mês inteiro: proporção 1, para os números baterem à mão.
const MES = { inicio: "2026-09-01", fim: "2026-09-30" };

describe("cascata do lucro", () => {
  test("os fixos saem antes da base da comissão", () => {
    const f = repartir({ faturamentoLiquido: 100_000, trafego: 30_000, despesas: 10_000, ...MES }, [
      pessoa({ nome: "Joana", base: "fixo", valor_fixo: 2_000 }),
      pessoa({ nome: "Marcos", percentual: 3 }),
    ]);

    expect(f.folhaDireta).toBe(2_000);
    // 100.000 − 30.000 − 10.000 − 2.000
    expect(f.lucroOperacional).toBe(58_000);
    // A comissão morde os 58.000, não os 60.000: é essa a regra.
    expect(f.comissoes).toBeCloseTo(1_740, 2);
  });

  test("ignorar o fixo inflaria a comissão", () => {
    // O mesmo caso sem o salário da Joana, para medir a diferença que a
    // ordem faz. 3% de 60.000 = 1.800, contra 1.740.
    const semFixo = repartir(
      { faturamentoLiquido: 100_000, trafego: 30_000, despesas: 10_000, ...MES },
      [pessoa({ nome: "Marcos", percentual: 3 })],
    );
    expect(semFixo.comissoes).toBeCloseTo(1_800, 2);
  });

  test("as sócias recebem sobre o que sobra depois das comissões", () => {
    const f = repartir({ faturamentoLiquido: 100_000, trafego: 40_000, despesas: 0, ...MES }, [
      pessoa({ nome: "Marcos", percentual: 10 }),
      pessoa({ nome: "Sócia 1", classe: "socia", percentual: 50 }),
      pessoa({ nome: "Sócia 2", classe: "socia", percentual: 50 }),
    ]);

    expect(f.lucroOperacional).toBe(60_000);
    expect(f.comissoes).toBeCloseTo(6_000, 2);
    expect(f.lucroAposComissoes).toBeCloseTo(54_000, 2);
    // 50% + 50% dos 54.000, e não dos 60.000.
    expect(f.partesSocias).toBeCloseTo(54_000, 2);
    expect(f.lucroRetido).toBeCloseTo(0, 2);
  });

  test("sócias que não dividem tudo deixam lucro retido", () => {
    const f = repartir({ faturamentoLiquido: 100_000, trafego: 50_000, despesas: 0, ...MES }, [
      pessoa({ nome: "Sócia 1", classe: "socia", percentual: 30 }),
      pessoa({ nome: "Sócia 2", classe: "socia", percentual: 30 }),
    ]);
    expect(f.partesSocias).toBeCloseTo(30_000, 2);
    expect(f.lucroRetido).toBeCloseTo(20_000, 2);
  });

  test("percentual do faturamento entra com os fixos, não com as comissões", () => {
    // Não depende do lucro, então é determinável antes dele — e por isso
    // reduz a base de quem ganha percentual do lucro.
    const f = repartir({ faturamentoLiquido: 100_000, trafego: 0, despesas: 0, ...MES }, [
      pessoa({ nome: "Afiliada", base: "percentual_faturamento", percentual: 10 }),
      pessoa({ nome: "Marcos", percentual: 3 }),
    ]);
    expect(f.folhaDireta).toBeCloseTo(10_000, 2);
    expect(f.lucroOperacional).toBeCloseTo(90_000, 2);
    expect(f.comissoes).toBeCloseTo(2_700, 2);
  });

  test("prejuízo não vira comissão negativa", () => {
    const f = repartir({ faturamentoLiquido: 10_000, trafego: 30_000, despesas: 0, ...MES }, [
      pessoa({ nome: "Marcos", percentual: 3 }),
      pessoa({ nome: "Sócia 1", classe: "socia", percentual: 50 }),
    ]);

    expect(f.lucroOperacional).toBe(-20_000);
    // Ninguém devolve dinheiro num mês ruim.
    expect(f.comissoes).toBe(0);
    expect(f.partesSocias).toBe(0);
    // Mas o prejuízo continua aparecendo inteiro.
    expect(f.lucroRetido).toBe(-20_000);
  });

  test("o fixo ainda sai no prejuízo", () => {
    // Salário não é variável: tem que aparecer como custo mesmo no mês ruim,
    // senão o painel mostra um prejuízo menor do que o real.
    const f = repartir({ faturamentoLiquido: 5_000, trafego: 20_000, despesas: 0, ...MES }, [
      pessoa({ nome: "Joana", base: "fixo", valor_fixo: 2_000 }),
    ]);
    expect(f.folhaDireta).toBe(2_000);
    expect(f.lucroOperacional).toBe(-17_000);
  });

  test("cada parcela aparece nomeada, na ordem da cascata", () => {
    const f = repartir({ faturamentoLiquido: 100_000, trafego: 40_000, despesas: 0, ...MES }, [
      pessoa({ nome: "Sócia 1", classe: "socia", percentual: 50 }),
      pessoa({ nome: "Marcos", percentual: 3 }),
      pessoa({ nome: "Joana", base: "fixo", valor_fixo: 2_000 }),
    ]);
    // Fixos primeiro, depois colaboradores, depois sócias — mesmo com a
    // entrada fora de ordem.
    expect(f.parcelas.map((p) => p.nome)).toEqual(["Joana", "Marcos", "Sócia 1"]);
  });
});

describe("rateio dos fixos", () => {
  test("mês inteiro é proporção 1", () => {
    expect(proporcaoDoMes("2026-09-01", "2026-09-30")).toBeCloseTo(1, 6);
  });

  test("um dia de setembro é um trinta avos", () => {
    expect(proporcaoDoMes("2026-09-10", "2026-09-10")).toBeCloseTo(1 / 30, 6);
  });

  test("fevereiro divide por 28, não por 30", () => {
    // Usar 30 fixo deixaria o ano sem fechar: a soma dos doze meses daria
    // mais ou menos que doze salários.
    expect(proporcaoDoMes("2026-02-01", "2026-02-28")).toBeCloseTo(1, 6);
  });

  test("uma semana desconta uma semana de salário, não um mês", () => {
    const f = repartir(
      {
        faturamentoLiquido: 10_000,
        trafego: 0,
        despesas: 0,
        inicio: "2026-09-07",
        fim: "2026-09-13",
      },
      [pessoa({ nome: "Joana", base: "fixo", valor_fixo: 3_000 })],
    );
    // 7 dias de 30: 700, e não 3.000.
    expect(f.folhaDireta).toBeCloseTo(700, 2);
  });
});

describe("vigência", () => {
  const antiga = pessoa({
    nome: "Marcos",
    percentual: 3,
    vigencia_inicio: "2026-01-01",
    vigencia_fim: "2026-08-31",
  });
  const nova = pessoa({ nome: "Marcos", percentual: 5, vigencia_inicio: "2026-09-01" });

  test("setembro usa a nova, agosto usa a antiga", () => {
    expect(vigentesEm([antiga, nova], "2026-09-15")[0]!.percentual).toBe(5);
    expect(vigentesEm([antiga, nova], "2026-08-15")[0]!.percentual).toBe(3);
  });

  test("aumento não reescreve o custo de um mês fechado", () => {
    const agosto = repartir(
      {
        faturamentoLiquido: 100_000,
        trafego: 0,
        despesas: 0,
        inicio: "2026-08-01",
        fim: "2026-08-31",
      },
      [antiga, nova],
    );
    expect(agosto.comissoes).toBeCloseTo(3_000, 2);
  });
});

describe("data de pagamento", () => {
  test("dia 5 do mês seguinte ao fim do período", () => {
    expect(dataDePagamento("2026-09-30")).toBe("2026-10-05");
  });

  test("dezembro vira janeiro do ano seguinte", () => {
    expect(dataDePagamento("2026-12-31")).toBe("2027-01-05");
  });

  test("semestre fechado em junho paga em julho", () => {
    expect(dataDePagamento("2026-06-30")).toBe("2026-07-05");
  });
});

describe("sócia com retirada fixa", () => {
  test("a retirada sai depois das comissões, não antes", () => {
    // O caso da operação: R$ 10.000 por sócia, valor fixo, todo mês. Se isso
    // entrasse com os fixos, os 3% do colaborador incidiriam sobre 40.000 em
    // vez de 60.000 — 1.200 contra 1.800.
    const f = repartir({ faturamentoLiquido: 100_000, trafego: 40_000, despesas: 0, ...MES }, [
      pessoa({ nome: "Marcos", percentual: 3 }),
      pessoa({ nome: "Sócia 1", classe: "socia", base: "fixo", valor_fixo: 10_000 }),
      pessoa({ nome: "Sócia 2", classe: "socia", base: "fixo", valor_fixo: 10_000 }),
    ]);

    expect(f.folhaDireta).toBe(0);
    expect(f.lucroOperacional).toBe(60_000);
    expect(f.comissoes).toBeCloseTo(1_800, 2);
    expect(f.partesSocias).toBe(20_000);
    expect(f.lucroRetido).toBeCloseTo(38_200, 2);
  });

  test("a retirada fixa sai mesmo no mês que fecha negativo", () => {
    // Junho/2026 fechou em -471,43 e as duas retiradas saíram assim mesmo.
    // Comissão percentual não existe sem lucro; retirada fixa existe.
    const f = repartir({ faturamentoLiquido: 30_000, trafego: 40_000, despesas: 0, ...MES }, [
      pessoa({ nome: "Marcos", percentual: 3 }),
      pessoa({ nome: "Sócia 1", classe: "socia", base: "fixo", valor_fixo: 10_000 }),
    ]);

    expect(f.comissoes).toBe(0);
    expect(f.partesSocias).toBe(10_000);
    expect(f.lucroRetido).toBe(-20_000);
  });

  test("sócia com fixo e sócia com percentual convivem", () => {
    const f = repartir({ faturamentoLiquido: 100_000, trafego: 50_000, despesas: 0, ...MES }, [
      pessoa({ nome: "Sócia 1", classe: "socia", base: "fixo", valor_fixo: 10_000 }),
      pessoa({ nome: "Sócia 2", classe: "socia", percentual: 20 }),
    ]);
    // 10.000 do fixo + 20% dos 50.000 do lucro após comissões.
    expect(f.partesSocias).toBeCloseTo(20_000, 2);
  });
});
