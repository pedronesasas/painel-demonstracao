import { describe, expect, test } from "bun:test";
import { lerRitmo, linearidade, serieLinearidade } from "./linearidade";

const perto = (v: number, alvo: number) => expect(v).toBeCloseTo(alvo, 2);

describe("linearidade", () => {
  test("no meio do mes, exatamente no ritmo", () => {
    const l = linearidade(100000, 50000, 15, 30);

    perto(l.esperadoHoje, 50000);
    perto(l.ritmo, 1);
    perto(l.projecao, 100000);
    expect(l.noRitmo).toBe(true);
    expect(l.diasRestantes).toBe(15);
    perto(l.precisaPorDia, 50000 / 15);
  });

  test("abaixo do ritmo avisa antes de o periodo fechar", () => {
    // O caso do Grove: em abril o recrutamento estava abaixo da reta, e era
    // essa informacao que dava tempo de corrigir.
    const l = linearidade(100000, 30000, 15, 30);

    perto(l.esperadoHoje, 50000);
    perto(l.ritmo, 0.6);
    perto(l.projecao, 60000); // termina 40% abaixo se nada mudar
    expect(l.noRitmo).toBe(false);
    // Precisa quase dobrar o ritmo: vinha fazendo 2.000/dia, precisa de 4.666.
    perto(l.realizado / l.diasDecorridos, 2000);
    perto(l.precisaPorDia, 70000 / 15);
  });

  test("acima do ritmo projeta acima da meta", () => {
    const l = linearidade(100000, 70000, 15, 30);
    perto(l.projecao, 140000);
    expect(l.noRitmo).toBe(true);
  });

  test("meta ja batida nao pede mais nada por dia", () => {
    const l = linearidade(100000, 120000, 20, 30);
    perto(l.precisaPorDia, 0);
    expect(l.noRitmo).toBe(true);
  });

  test("periodo encerrado nao divide por zero", () => {
    const l = linearidade(100000, 80000, 30, 30);
    expect(l.diasRestantes).toBe(0);
    perto(l.precisaPorDia, 0);
    perto(l.ritmo, 0.8);
  });

  test("primeiro dia nao estoura a conta", () => {
    // Dia 1 de 30: sem a guarda, dividir por zero dia decorrido.
    const l = linearidade(30000, 500, 0, 30);
    expect(l.diasDecorridos).toBe(1);
    perto(l.esperadoHoje, 1000);
    perto(l.projecao, 15000);
    expect(Number.isFinite(l.ritmo)).toBe(true);
  });

  test("meta zero nao vira ritmo infinito", () => {
    const l = linearidade(0, 5000, 10, 30);
    expect(Number.isFinite(l.ritmo)).toBe(true);
    expect(l.ritmo).toBe(0);
  });

  test("serve para a semana com a mesma conta", () => {
    // Quarta-feira: 3 de 7 dias, ritual do GPDR de checar metricas parciais.
    const l = linearidade(21000, 9000, 3, 7);
    perto(l.esperadoHoje, 9000);
    expect(l.noRitmo).toBe(true);
    expect(l.diasRestantes).toBe(4);
  });
});

describe("serie do grafico", () => {
  const dias = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];

  test("a reta ideal vai do primeiro dia ate a meta no ultimo", () => {
    const serie = serieLinearidade(dias, new Map(), 400, "2026-09-04");
    perto(serie[0]!.ideal, 100);
    perto(serie[3]!.ideal, 400);
  });

  test("acumula o realizado e deixa o futuro em branco", () => {
    const valores = new Map([
      ["2026-09-01", 50],
      ["2026-09-02", 70],
    ]);
    const serie = serieLinearidade(dias, valores, 400, "2026-09-02");

    expect(serie[0]!.realizado).toBe(50);
    expect(serie[1]!.realizado).toBe(120); // acumulado
    // Zero no futuro desenharia um mergulho que parece desabamento.
    expect(serie[2]!.realizado).toBeNull();
    expect(serie[3]!.realizado).toBeNull();
    // A reta ideal continua, porque ela é o plano e não o realizado.
    perto(serie[3]!.ideal, 400);
  });
});

describe("leitura do ritmo", () => {
  test("abaixo do ritmo compara o que falta com o que vem saindo", () => {
    const frase = lerRitmo(linearidade(100000, 30000, 15, 30), "do mês");
    expect(frase).toContain("Abaixo do ritmo");
    expect(frase).toContain("15 dias restantes");
  });

  test("meta batida antes do fim reconhece os dias que sobram", () => {
    expect(lerRitmo(linearidade(1000, 1200, 20, 30), "do mês")).toContain("batida");
  });

  test("periodo fechado abaixo relata o tamanho do buraco", () => {
    expect(lerRitmo(linearidade(1000, 700, 30, 30), "do mês")).toContain("abaixo da meta");
  });
});
