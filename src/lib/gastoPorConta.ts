/**
 * De qual conta de anúncios veio o gasto da Meta.
 *
 * Duas fontes, com papéis diferentes:
 *
 *   gastos_trafego         o total OFICIAL do dia e canal. É ele que entra no
 *                          lucro, no ROAS e no ROI — e ele inclui contas que a
 *                          UTMify não enxerga.
 *   gastos_trafego_contas  o mesmo gasto aberto por conta, puxado da UTMify,
 *                          que só vê as contas de anúncio habilitadas nela.
 *
 * Por isso a segunda DETALHA a primeira e nunca a substitui: o que as contas
 * não explicam aparece como "Sem conta identificada".
 *
 * A comparação é DIA A DIA, e não no total do mês. Quando as contas somam
 * mais que o lançado num dia — acontece quando o gasto de uma conta entrou no
 * total só depois, ou ainda não entrou —, a sobra não é abatida do gasto sem
 * conta dos outros dias: vira excedente e vai para um aviso. Compensar um dia
 * com o outro faria gasto sem dono sumir da tela justamente quando há dois
 * problemas em vez de um.
 *
 * As somas são feitas em centavos. Em ponto flutuante 0,1 + 0,2 não dá 0,3, e
 * um dia que bate ao centavo apareceria no aviso com uma diferença de
 * R$ 0,00000000000004.
 */

import type { CanalTrafego } from "@/lib/financeiro";

/** Uma linha de `gastos_trafego`: o total oficial de um dia e canal. */
export type GastoLancado = {
  data: string;
  canal: CanalTrafego;
  valor: number;
};

/** Uma linha de `gastos_trafego_contas`: o gasto de uma conta num dia. */
export type GastoDaConta = {
  data: string;
  canal: CanalTrafego;
  conta_id: string;
  conta_nome: string;
  valor: number;
  /** Falso enquanto o dia está em curso e o valor ainda pode mudar. */
  fechado: boolean;
  /** Última gravação da linha — decide qual nome a conta mostra. */
  atualizado_em: string;
};

/**
 * `numeric` do Postgres pode chegar como texto, e texto somado com `+`
 * concatena. Toda linha lida do banco passa por aqui antes de ser somada.
 */
export function comValorNumerico<T extends { valor: number | string }>(
  linhas: readonly T[],
): (Omit<T, "valor"> & { valor: number })[] {
  return linhas.map((l) => ({ ...l, valor: Number(l.valor) }));
}

export type ResumoConta = {
  contaId: string;
  /** O nome gravado por último: a conta pode ter sido renomeada no meio do mês. */
  nome: string;
  valor: number;
  /**
   * Fatia do gasto lançado, de 0 a 1. Passa de 1 quando a conta gastou mais
   * que o lançado inteiro; nula quando não há gasto lançado para comparar.
   */
  participacao: number | null;
  diasComGasto: number;
  /** Algum dia da conta ainda não foi fechado. */
  parcial: boolean;
};

export type DiaPorConta = {
  data: string;
  lancado: number;
  /** Soma das contas no dia. */
  identificado: number;
  /** Lançado que nenhuma conta explica. Nunca negativo. */
  semConta: number;
  /** Quanto as contas passam do lançado. Zero quando não passam. */
  excedente: number;
  /** Gasto de cada conta no dia, pelo `conta_id`. Só as que gastaram. */
  porConta: Record<string, number>;
  /** Alguma conta do dia ainda não foi fechada. */
  parcial: boolean;
};

export type ApuracaoPorConta = {
  totalLancado: number;
  totalIdentificado: number;
  /** Soma dia a dia do gasto sem conta — ver o topo do arquivo. */
  semConta: number;
  /** Soma do que as contas passaram do lançado, nos dias em que passaram. */
  excedente: number;
  /** Contas com gasto no período, da que mais gastou para a que menos. */
  contas: ResumoConta[];
  /** Um item por dia pedido, inclusive os sem gasto: é a série do gráfico. */
  dias: DiaPorConta[];
  /**
   * Dias em que as contas somam mais que o lançado — inclusive os parciais,
   * marcados em `parcial`: num dia que ainda não fechou, a diferença pode
   * sumir na reconferência.
   */
  diasComExcedente: DiaPorConta[];
  diasComLancado: number;
  diasSemConta: number;
};

const emCentavos = (reais: number) => Math.round(reais * 100);
const emReais = (centavos: number) => centavos / 100;

/** Comparação de texto que não depende do idioma do navegador. */
function compararTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function instante(linha: GastoDaConta): number {
  const t = Date.parse(linha.atualizado_em);
  return Number.isNaN(t) ? 0 : t;
}

/** Se `a` foi gravada depois de `b`; no empate, vale o dia mais novo. */
function maisRecente(a: GastoDaConta, b: GastoDaConta): boolean {
  const diferenca = instante(a) - instante(b);
  return diferenca !== 0 ? diferenca > 0 : a.data > b.data;
}

type Acumulado = {
  centavos: number;
  parcial: boolean;
  /** A linha de onde sai o nome da conta. */
  ultima: GastoDaConta;
};

/**
 * Até que dia vai a aba: o último dia do mês, ou hoje no mês corrente — o
 * mesmo corte da aba Anúncios. Dia que ainda não chegou não tem gasto para
 * comparar.
 */
export function fimDoPeriodo(fimDoMes: string, hoje: string): string {
  return fimDoMes > hoje ? hoje : fimDoMes;
}

/**
 * Compara o gasto lançado com o gasto por conta, dia a dia.
 *
 * `dias` define o período e a série: um item por dia, inclusive os sem gasto,
 * como o gráfico precisa. Linhas de outro canal ou de fora desses dias ficam
 * de fora de tudo — dos totais também, para os cartões baterem com a série.
 */
export function apurarPorConta(
  lancados: GastoLancado[],
  contas: GastoDaConta[],
  dias: string[],
  canal: CanalTrafego = "meta",
): ApuracaoPorConta {
  const periodo = [...new Set(dias)];
  const noPeriodo = new Set(periodo);
  const entra = (l: { data: string; canal: CanalTrafego }) =>
    l.canal === canal && noPeriodo.has(l.data);

  const lancadoNoDia = new Map<string, number>();
  for (const l of lancados) {
    if (!entra(l)) continue;
    lancadoNoDia.set(l.data, (lancadoNoDia.get(l.data) ?? 0) + emCentavos(l.valor));
  }

  const contasNoDia = new Map<string, Map<string, number>>();
  const diasParciais = new Set<string>();
  const porConta = new Map<string, Acumulado>();

  for (const l of contas) {
    if (!entra(l)) continue;
    const centavos = emCentavos(l.valor);

    const doDia = contasNoDia.get(l.data) ?? new Map<string, number>();
    doDia.set(l.conta_id, (doDia.get(l.conta_id) ?? 0) + centavos);
    contasNoDia.set(l.data, doDia);
    if (!l.fechado) diasParciais.add(l.data);

    const acumulado = porConta.get(l.conta_id);
    if (!acumulado) {
      porConta.set(l.conta_id, { centavos, parcial: !l.fechado, ultima: l });
      continue;
    }
    acumulado.centavos += centavos;
    if (!l.fechado) acumulado.parcial = true;
    if (maisRecente(l, acumulado.ultima)) acumulado.ultima = l;
  }

  // Tudo em centavos até a saída.
  let somaLancado = 0;
  let somaIdentificado = 0;
  let somaSemConta = 0;
  let somaExcedente = 0;

  const serie = periodo.map((data): DiaPorConta => {
    const lancado = lancadoNoDia.get(data) ?? 0;
    const doDia: Record<string, number> = {};
    let identificado = 0;
    for (const [contaId, centavos] of contasNoDia.get(data) ?? []) {
      if (centavos <= 0) continue;
      doDia[contaId] = emReais(centavos);
      identificado += centavos;
    }
    const semConta = Math.max(0, lancado - identificado);
    const excedente = Math.max(0, identificado - lancado);

    somaLancado += lancado;
    somaIdentificado += identificado;
    somaSemConta += semConta;
    somaExcedente += excedente;

    return {
      data,
      lancado: emReais(lancado),
      identificado: emReais(identificado),
      semConta: emReais(semConta),
      excedente: emReais(excedente),
      porConta: doDia,
      parcial: diasParciais.has(data),
    };
  });

  const resumo = [...porConta.entries()]
    // Conta que só tem linha zerada no período não gastou nada: listá-la
    // seria ruído, e ela não tem fatia nem cor para ocupar.
    .filter(([, a]) => a.centavos > 0)
    .map(([contaId, a]): ResumoConta => {
      let diasComGasto = 0;
      for (const doDia of contasNoDia.values()) {
        if ((doDia.get(contaId) ?? 0) > 0) diasComGasto += 1;
      }
      return {
        contaId,
        nome: a.ultima.conta_nome.trim() || contaId,
        valor: emReais(a.centavos),
        participacao: somaLancado > 0 ? a.centavos / somaLancado : null,
        diasComGasto,
        parcial: a.parcial,
      };
    })
    .sort((a, b) => b.valor - a.valor || compararTexto(a.contaId, b.contaId));

  return {
    totalLancado: emReais(somaLancado),
    totalIdentificado: emReais(somaIdentificado),
    semConta: emReais(somaSemConta),
    excedente: emReais(somaExcedente),
    contas: resumo,
    dias: serie,
    diasComExcedente: serie.filter((d) => d.excedente > 0),
    diasComLancado: serie.filter((d) => d.lancado > 0).length,
    diasSemConta: serie.filter((d) => d.semConta > 0).length,
  };
}

export type SerieConta = {
  /** Chave da série no gráfico. Sem ponto: o recharts lê ponto como caminho. */
  chave: string;
  nome: string;
  /** As contas que a série soma: uma, ou várias em "Outras contas". */
  contaIds: string[];
};

/**
 * As séries do gráfico empilhado, uma por conta.
 *
 * A ordem é a do `conta_id`, e não a do gasto, porque a cor sai da posição:
 * ordenar por gasto faria a mesma conta trocar de cor de um mês para o outro
 * só por ter gastado mais ou menos. Pela identidade, a cor só muda quando
 * entra ou sai conta — e, com mais contas que cores, também quando uma conta
 * entra ou sai de "Outras contas", porque as que ficam sozinhas são escolhidas
 * pelo gasto.
 *
 * Cores são poucas (`cores`). Com mais contas que isso, as que menos gastaram
 * se juntam em "Outras contas", a última série — repetir cor faria duas contas
 * parecerem uma só.
 */
export function seriesDoGrafico(contas: ResumoConta[], cores: number): SerieConta[] {
  const porId = (a: ResumoConta, b: ResumoConta) => compararTexto(a.contaId, b.contaId);
  const porGasto = [...contas].sort((a, b) => b.valor - a.valor || porId(a, b));
  const cabem = Math.max(1, cores);
  const sozinhas = porGasto.length <= cabem ? porGasto : porGasto.slice(0, cabem - 1);
  const juntas = porGasto.slice(sozinhas.length);

  const series: SerieConta[] = [...sozinhas]
    .sort(porId)
    .map((c, i) => ({ chave: `conta${i}`, nome: c.nome, contaIds: [c.contaId] }));
  if (juntas.length > 0) {
    series.push({
      chave: "outras",
      nome: `Outras ${juntas.length} contas`,
      contaIds: juntas.map((c) => c.contaId),
    });
  }
  return series;
}

/** Gasto de uma série num dia: a conta dela, ou a soma das que ela junta. */
export function valorDaSerie(dia: DiaPorConta, serie: SerieConta): number {
  return emReais(
    serie.contaIds.reduce((total, id) => total + emCentavos(dia.porConta[id] ?? 0), 0),
  );
}

/**
 * Rótulo do eixo em reais: "1,5k" em vez de "1500". São duas casas no "k"
 * porque as marcas de `marcasDoEixo` pedem até duas — com uma, a linha de
 * R$ 1.250 saía escrita "1,3k".
 */
export function eixoReais(v: number): string {
  return v >= 1000
    ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}k`
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/**
 * Marcas redondas para o eixo: 0, 500, 1.000… O recharts sozinho escolhe
 * 0, 550, 1.100, 1.650 — números que ninguém usa para ler gasto.
 */
export function marcasDoEixo(maximo: number): number[] {
  if (!(maximo > 0)) return [0];
  const potencia = 10 ** Math.floor(Math.log10(maximo / 5));
  const passo =
    [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => Math.ceil(maximo / p) <= 5) ??
    20 * potencia;
  return Array.from({ length: Math.ceil(maximo / passo) + 1 }, (_, i) => i * passo);
}
