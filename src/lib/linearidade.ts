/**
 * Indicador de linearidade.
 *
 * Grove, sobre o processo de recrutamento que falhava sem ninguém perceber:
 * "o indicador de linearidade nos proporciona um alerta antecipado, dando
 * tempo para que tomemos as medidas corretivas necessárias. Sem monitorar
 * esse indicador, só em junho descobriríamos que deixamos de atingir a meta,
 * quando nada mais poderia ser feito."
 *
 * A ideia é simples: traça-se a reta do zero até a meta ao longo do período e
 * compara-se o acumulado real contra ela. Bater a meta no fim do mês não é
 * suficiente — é preciso saber no dia 12 que o ritmo está abaixo, enquanto
 * ainda há dezoito dias para corrigir.
 *
 * O mesmo cálculo serve para o mês e para a semana. O mês é o compromisso; a
 * semana é o ritmo que permite corrigi-lo antes que o compromisso quebre.
 */

export type PeriodoMeta = "mensal" | "semanal";

export type MetaOperacao = {
  periodo: PeriodoMeta;
  referencia: string;
  meta_faturamento: number | null;
  meta_lucro: number | null;
};

export type Linearidade = {
  meta: number;
  realizado: number;
  /** Onde o acumulado deveria estar hoje para a meta sair no ritmo. */
  esperadoHoje: number;
  /** Realizado sobre esperado. 1 é exatamente no ritmo. */
  ritmo: number;
  /** Onde o período termina se o ritmo atual continuar. */
  projecao: number;
  diasDecorridos: number;
  diasTotais: number;
  diasRestantes: number;
  /** Quanto por dia falta para chegar à meta. Zero se ela já foi batida. */
  precisaPorDia: number;
  noRitmo: boolean;
};

/**
 * Apura o ritmo contra a meta.
 *
 * `diasDecorridos` conta o dia de hoje inteiro, porque a comparação é entre
 * períodos fechados de dia: às 9h da manhã o dia mal começou, e descontá-lo
 * proporcionalmente faria o indicador oscilar ao longo do dia e acusar atraso
 * toda manhã.
 */
export function linearidade(
  meta: number,
  realizado: number,
  diasDecorridos: number,
  diasTotais: number,
): Linearidade {
  const decorridos = Math.max(1, Math.min(diasDecorridos, diasTotais));
  const totais = Math.max(1, diasTotais);
  const restantes = Math.max(0, totais - decorridos);

  const esperadoHoje = meta * (decorridos / totais);
  const projecao = (realizado / decorridos) * totais;
  const falta = Math.max(0, meta - realizado);

  return {
    meta,
    realizado,
    esperadoHoje,
    ritmo: esperadoHoje > 0 ? realizado / esperadoHoje : 0,
    projecao,
    diasDecorridos: decorridos,
    diasTotais: totais,
    diasRestantes: restantes,
    // Sem dias restantes o período acabou: não há mais "por dia" a pedir.
    precisaPorDia: restantes > 0 ? falta / restantes : 0,
    noRitmo: realizado >= esperadoHoje,
  };
}

export type PontoLinearidade = {
  data: string;
  /** Acumulado real até o dia. Fica em branco nos dias futuros. */
  realizado: number | null;
  /** A reta do Grove: onde o acumulado deveria estar naquele dia. */
  ideal: number;
};

/**
 * Série para o gráfico: a reta ideal ao longo de todo o período e o acumulado
 * real até hoje.
 *
 * Os dias futuros ficam com `realizado: null` de propósito — desenhar zero no
 * futuro criaria um mergulho na linha que parece desabamento, quando na
 * verdade é ausência de dado.
 */
export function serieLinearidade(
  dias: string[],
  valorPorDia: Map<string, number>,
  meta: number,
  hoje: string,
): PontoLinearidade[] {
  let acumulado = 0;

  return dias.map((data, i) => {
    const futuro = data > hoje;
    if (!futuro) acumulado += valorPorDia.get(data) ?? 0;

    return {
      data,
      realizado: futuro ? null : acumulado,
      ideal: (meta * (i + 1)) / dias.length,
    };
  });
}

/** Frase de diagnóstico, no mesmo espírito do veredito de saúde. */
export function lerRitmo(l: Linearidade, rotuloPeriodo: string): string {
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (l.realizado >= l.meta) {
    return `Meta ${rotuloPeriodo} batida, faltando ${l.diasRestantes} ${
      l.diasRestantes === 1 ? "dia" : "dias"
    }.`;
  }

  if (l.diasRestantes === 0) {
    const falta = l.meta - l.realizado;
    return `Período fechou ${brl(falta)} abaixo da meta.`;
  }

  if (l.noRitmo) {
    return `No ritmo. Mantendo ${brl(l.precisaPorDia)} por dia, a meta sai.`;
  }

  return `Abaixo do ritmo: faltam ${brl(l.precisaPorDia)} por dia nos ${
    l.diasRestantes
  } dias restantes, contra ${brl(l.realizado / l.diasDecorridos)} que vem saindo.`;
}
