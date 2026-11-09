/**
 * A semana da vendedora: meta, saldo e comissão.
 *
 * A regra é simples de propósito: a comissão é 15% de tudo que ela vendeu na
 * semana, e a meta diária serve para ela saber se está no ritmo. A meta de
 * segunda a sexta acumula (o saldo de quinta compara o vendido com quatro
 * dias de meta), e sábado e domingo não somam meta nova: é onde dá para
 * recuperar um dia fraco.
 */

export type Metas = {
  meta_diaria: number;
};

export const METAS_PADRAO: Metas = {
  meta_diaria: 2500,
};

/** Percentual da comissão sobre o total vendido na semana. */
export const PERCENTUAL_COMISSAO = 15;

/** Se a semana bateu a meta. A comissão é a mesma nos dois casos. */
export type Faixa = "batida" | "abaixo";

export const FAIXA_LABEL: Record<Faixa, string> = {
  batida: "Meta batida",
  abaixo: "Abaixo da meta",
};


/**
 * Fuso da operação. Tudo que é "hoje" no sistema — a trava de lançamento na
 * tela e a política de RLS no banco (ver public.hoje_brasil()) — precisa
 * responder a partir daqui, senão a janela de hoje/ontem abre e fecha em
 * horários diferentes no celular e no servidor.
 */
export const FUSO_OPERACAO = "America/Sao_Paulo";

/**
 * Data de hoje no fuso da operação, em ISO (yyyy-MM-dd).
 * Usa o fuso explícito, e não o relógio do aparelho: o banco roda em UTC e a
 * vendedora pode estar com o celular em qualquer fuso.
 */
export function hojeISO(): string {
  // en-CA formata como yyyy-MM-dd.
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_OPERACAO }).format(
    new Date(),
  );
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const partes = iso.split("-").map(Number);
  return new Date(partes[0] ?? 1970, (partes[1] ?? 1) - 1, partes[2] ?? 1);
}

export function addDias(iso: string, dias: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + dias);
  return toISO(d);
}

/** Segunda-feira da semana que contém a data. */
export function inicioSemana(iso: string): string {
  const d = fromISO(iso);
  const dow = d.getDay(); // 0 = domingo
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toISO(d);
}

/** Os 7 dias (segunda a domingo) da semana da data informada. */
export function diasDaSemana(iso: string): string[] {
  const seg = inicioSemana(iso);
  return Array.from({ length: 7 }, (_, i) => addDias(seg, i));
}

/** Multiplicador da rampa: cresce de seg a sex e congela no fim de semana. */
export function multiplicadorDoDia(posicao: number): number {
  return Math.min(posicao + 1, 5);
}

export function metaSemanal(metaDiaria: number): number {
  return metaDiaria * 5;
}

export function faixaAtingida(totalSemana: number, metas: Metas): Faixa {
  return totalSemana >= metaSemanal(metas.meta_diaria) ? "batida" : "abaixo";
}

export function comissao(totalSemana: number): number {
  return totalSemana * (PERCENTUAL_COMISSAO / 100);
}

export type LinhaDia = {
  data: string;
  posicao: number;
  vendido: number | null;
  acumulado: number;
  /** Vendido acumulado menos a meta acumulada até o dia. */
  saldo: number;
  futuro: boolean;
  hoje: boolean;
  naoPreenchido: boolean;
};

export function montarSemana(
  refISO: string,
  vendas: Record<string, number>,
  metas: Metas,
  hoje = hojeISO(),
): LinhaDia[] {
  const dias = diasDaSemana(refISO);
  let acumulado = 0;
  return dias.map((data, posicao) => {
    const vendido = data in vendas ? (vendas[data] ?? 0) : null;
    acumulado += vendido ?? 0;
    return {
      data,
      posicao,
      vendido,
      acumulado,
      saldo: acumulado - metas.meta_diaria * multiplicadorDoDia(posicao),
      futuro: data > hoje,
      hoje: data === hoje,
      naoPreenchido: data < hoje && vendido === null,
    };
  });
}

/** Frase de próximo passo: quanto falta para a meta da semana. */
export function proximoPasso(
  totalSemana: number,
  metas: Metas,
  refISO: string,
  hoje = hojeISO(),
): string {
  const meta = metaSemanal(metas.meta_diaria);
  if (totalSemana >= meta) {
    return `Meta da semana batida. Cada venda a mais rende ${PERCENTUAL_COMISSAO}% de comissão.`;
  }

  const falta = meta - totalSemana;
  const restantes = diasDaSemana(refISO).filter((d) => d >= hoje).length;
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (restantes <= 0) return `Faltaram ${brl(falta)} para a meta da semana.`;
  return `Faltam ${brl(falta)} para a meta da semana — ${brl(falta / restantes)} por dia nos ${restantes} dia${
    restantes > 1 ? "s" : ""
  } que falta${restantes > 1 ? "m" : ""}.`;
}

/**
 * Mês a que uma semana pertence.
 *
 * REGRA DE NEGÓCIO: a semana pertence ao mês em que ela TERMINA (domingo).
 * A semana de 31/08 a 06/09, por exemplo, é de setembro.
 *
 * Isso importa porque a comissão é apurada por semana: sem um critério único,
 * a semana da virada entra na conta dos dois meses e a comissão é paga em
 * dobro. Para trocar o critério para "o mês em que a semana começa", basta
 * devolver a própria `segundaISO` aqui.
 */
function mesDaSemana(segundaISO: string): string {
  return addDias(segundaISO, 6).slice(0, 7); // yyyy-MM do domingo
}

/** Semanas (segundas-feiras) que pertencem ao mês informado, sem sobreposição. */
export function semanasDoMes(ano: number, mes: number): string[] {
  const alvo = `${ano}-${String(mes).padStart(2, "0")}`;
  const primeiro = new Date(ano, mes - 1, 1);
  const ultimo = new Date(ano, mes, 0);
  const semanas: string[] = [];
  let cursor = inicioSemana(toISO(primeiro));
  while (cursor <= toISO(ultimo)) {
    if (mesDaSemana(cursor) === alvo) semanas.push(cursor);
    cursor = addDias(cursor, 7);
  }
  return semanas;
}
