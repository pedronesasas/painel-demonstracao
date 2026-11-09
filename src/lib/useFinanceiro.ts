import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDias, hojeISO, toISO, fromISO, inicioSemana } from "@/lib/semana";
import type { MetaOperacao } from "@/lib/linearidade";
import { buscarTodas } from "@/lib/buscarTodas";
import {
  DEVOLUCOES,
  IMPOSTO_PADRAO,
  diaDaDevolucao,
  type Despesa,
  type GastoTrafego,
  type Taxa,
  type Venda,
} from "@/lib/financeiro";

export type Periodo = { inicio: string; fim: string; rotulo: string };

export function inicioMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function fimMes(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number);
  return toISO(new Date(ano!, mes!, 0));
}

/** Todos os dias de um intervalo, inclusive as pontas. */
export function diasDoIntervalo(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  for (let d = inicio; d <= fim; d = addDias(d, 1)) dias.push(d);
  return dias;
}

export function periodosPadrao(hoje = hojeISO()): Periodo[] {
  const mesPassado = addDias(inicioMes(hoje), -1);
  return [
    { inicio: hoje, fim: hoje, rotulo: "Hoje" },
    // Ontem é o primeiro dia fechado: o de hoje ainda está acontecendo, e
    // comparar meio-dia com um dia inteiro não diz nada.
    { inicio: addDias(hoje, -1), fim: addDias(hoje, -1), rotulo: "Ontem" },
    { inicio: addDias(hoje, -6), fim: hoje, rotulo: "7 dias" },
    { inicio: addDias(hoje, -29), fim: hoje, rotulo: "30 dias" },
    { inicio: inicioMes(hoje), fim: hoje, rotulo: "Este mês" },
    {
      inicio: inicioMes(mesPassado),
      fim: fimMes(mesPassado),
      rotulo: "Mês passado",
    },
  ];
}

/**
 * O mesmo recorte, imediatamente antes.
 *
 * Grove: "mensurar um output em comparação com um padrão o força a pensar nas
 * razões que levaram aos resultados reais e não ao padrão esperado". Um número
 * sozinho não diz nada — R$ 40 mil é ótimo ou é queda de 30%? Só o anterior
 * responde.
 *
 * Período que começa no dia 1 compara com o mesmo intervalo do mês passado,
 * porque é isso que as pessoas querem dizer com "este mês": dia 1 a 15 contra
 * dia 1 a 15, e não contra os quinze dias corridos anteriores, que cairiam no
 * meio do mês e misturariam duas realidades.
 */
export function periodoAnterior(p: Periodo): Periodo {
  const dias = diasDoIntervalo(p.inicio, p.fim).length;

  if (p.inicio.endsWith("-01")) {
    const fimAnterior = addDias(p.inicio, -1);
    const inicioAnterior = inicioMes(fimAnterior);
    // Recorta o mesmo número de dias, sem passar do fim do mês anterior.
    const limite = addDias(inicioAnterior, dias - 1);
    return {
      inicio: inicioAnterior,
      fim: limite < fimAnterior ? limite : fimAnterior,
      rotulo: "mês anterior",
    };
  }

  return {
    inicio: addDias(p.inicio, -dias),
    fim: addDias(p.fim, -dias),
    rotulo: `${dias} dias antes`,
  };
}

export function rotuloPeriodo(p: Periodo): string {
  const fmt = (iso: string) => {
    const d = fromISO(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  return p.inicio === p.fim ? fmt(p.inicio) : `${fmt(p.inicio)} a ${fmt(p.fim)}`;
}

export type DadosFinanceiros = {
  /** Vendas do período pedido — o que aparece na tela. */
  vendas: Venda[];
  /**
   * Vendas dos meses que o período toca, inteiras. A faixa de taxa da Plataforma A
   * depende do faturamento do mês fechado, então apurar "os últimos 7 dias"
   * ainda precisa enxergar o mês todo para escolher a taxa certa.
   */
  universo: Venda[];
  gastos: GastoTrafego[];
  despesas: Despesa[];
  taxas: Taxa[];
  impostoPercentual: number;
};

const COLUNAS_VENDA =
  "id, plataforma, pedido_externo_id, pedido_chave, produto_nome, tipo, valor_bruto, juros_parcelamento, taxa_coprodutor, taxa_afiliado, custo_produto, liquido_plataforma, parcelas, metodo_pagamento, status, ocorrido_em, ocorrido_dia, reembolsado_dia, cliente_email, cliente_nome";

/** Se a linha tem algo a dizer sobre o período: vendida nele, ou devolvida nele. */
export function tocaOPeriodo(v: Venda, inicio: string, fim: string): boolean {
  if (v.ocorrido_dia >= inicio && v.ocorrido_dia <= fim) return true;
  if (!DEVOLUCOES.includes(v.status)) return false;
  const dia = diaDaDevolucao(v);
  return dia >= inicio && dia <= fim;
}

export function useFinanceiro(periodo: Periodo) {
  return useQuery<DadosFinanceiros>({
    queryKey: ["financeiro", periodo.inicio, periodo.fim],
    queryFn: async () => {
      const janelaInicio = inicioMes(periodo.inicio);
      const janelaFim = fimMes(periodo.fim);

      const [vendidas, devolvidasDeAntes, gastosRes, despesasRes, taxasRes, configRes] =
        await Promise.all([
          buscarTodas((de, ate) =>
            supabase
              .from("vendas")
              .select(COLUNAS_VENDA)
              .gte("ocorrido_dia", janelaInicio)
              .lte("ocorrido_dia", janelaFim)
              .order("ocorrido_em", { ascending: false })
              .order("id")
              .range(de, ate),
          ),
          // Estorno concluído agora de venda feita antes da janela: a venda é
          // do mês dela, mas a devolução é daqui e precisa aparecer aqui.
          buscarTodas((de, ate) =>
            supabase
              .from("vendas")
              .select(COLUNAS_VENDA)
              .gte("reembolsado_dia", janelaInicio)
              .lte("reembolsado_dia", janelaFim)
              .lt("ocorrido_dia", janelaInicio)
              .order("id")
              .range(de, ate),
          ),
          supabase
            .from("gastos_trafego")
            .select("id, data, canal, valor")
            .gte("data", periodo.inicio)
            .lte("data", periodo.fim),
          supabase
            .from("despesas")
            .select("id, data, categoria, descricao, valor, recorrente")
            .gte("data", periodo.inicio)
            .lte("data", periodo.fim),
          supabase
            .from("plataforma_taxas")
            .select(
              "plataforma, vigencia_inicio, faixa_min, faixa_max, percentual, fixo_por_venda, fixo_so_no_principal, perc_juros_repassado",
            ),
          supabase.from("config_financeiro").select("imposto_percentual").maybeSingle(),
        ]);

      // O Postgres devolve `numeric` como string para não perder precisão; sem
      // o Number() aqui as somas do painel viravam concatenação de texto.
      const universo: Venda[] = [...vendidas, ...devolvidasDeAntes].map((v) => ({
        ...v,
        valor_bruto: Number(v.valor_bruto),
        juros_parcelamento: Number(v.juros_parcelamento),
        taxa_coprodutor: Number(v.taxa_coprodutor),
        taxa_afiliado: Number(v.taxa_afiliado),
        custo_produto: Number(v.custo_produto),
        // `numeric` nulo tem que continuar nulo: Number(null) daria 0, e um
        // líquido de zero seria lido como "a plataforma ficou com tudo".
        liquido_plataforma: v.liquido_plataforma === null ? null : Number(v.liquido_plataforma),
        parcelas: Number(v.parcelas),
      }));

      const taxas: Taxa[] = (taxasRes.data ?? []).map((t) => ({
        ...t,
        faixa_min: Number(t.faixa_min),
        faixa_max: t.faixa_max === null ? null : Number(t.faixa_max),
        percentual: Number(t.percentual),
        fixo_por_venda: Number(t.fixo_por_venda),
        perc_juros_repassado: Number(t.perc_juros_repassado),
      }));

      return {
        universo,
        vendas: universo.filter((v) => tocaOPeriodo(v, periodo.inicio, periodo.fim)),
        gastos: (gastosRes.data ?? []).map((g) => ({
          ...g,
          valor: Number(g.valor),
        })),
        despesas: (despesasRes.data ?? []).map((d) => ({
          ...d,
          valor: Number(d.valor),
        })),
        taxas,
        impostoPercentual: Number(configRes.data?.imposto_percentual ?? IMPOSTO_PADRAO),
      };
    },
  });
}

/**
 * Metas do mês e da semana correntes.
 *
 * Busca as duas de uma vez porque o indicador de ritmo mostra as duas juntas:
 * a semana é o que permite corrigir o mês antes de ele fechar.
 */
export function useMetasOperacao(hoje = hojeISO()) {
  return useQuery<{ mensal: MetaOperacao | null; semanal: MetaOperacao | null }>({
    queryKey: ["metas-operacao", hoje.slice(0, 7), inicioSemana(hoje)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas_operacao")
        .select("periodo, referencia, meta_faturamento, meta_lucro")
        .in("referencia", [inicioMes(hoje), inicioSemana(hoje)]);
      if (error) throw error;

      const converter = (m: (typeof data)[number]): MetaOperacao => ({
        periodo: m.periodo,
        referencia: m.referencia,
        meta_faturamento: m.meta_faturamento === null ? null : Number(m.meta_faturamento),
        meta_lucro: m.meta_lucro === null ? null : Number(m.meta_lucro),
      });

      const achar = (periodo: "mensal" | "semanal", ref: string) =>
        (data ?? [])
          .filter((m) => m.periodo === periodo && m.referencia === ref)
          .map(converter)[0] ?? null;

      return {
        mensal: achar("mensal", inicioMes(hoje)),
        semanal: achar("semanal", inicioSemana(hoje)),
      };
    },
  });
}
