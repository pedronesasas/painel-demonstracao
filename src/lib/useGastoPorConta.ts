import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buscarTodas } from "@/lib/buscarTodas";
import { comValorNumerico, type GastoDaConta, type GastoLancado } from "@/lib/gastoPorConta";

export type DadosGastoPorConta = {
  /**
   * O período que estes dados cobrem. Vai junto porque, ao trocar de mês, os
   * dados do mês anterior continuam na tela até os novos chegarem — e têm de
   * ser apurados contra os dias DELES, não os do mês que acabou de ser pedido.
   */
  inicio: string;
  fim: string;
  lancados: GastoLancado[];
  contas: GastoDaConta[];
};

/**
 * Gasto lançado e gasto por conta do período, numa consulta só.
 *
 * As duas tabelas vêm juntas porque a tela compara uma com a outra dia a dia,
 * e compará-las em momentos diferentes inventaria diferença.
 *
 * Erro vira erro, e não lista vazia. Lista vazia é lida como "nenhum gasto
 * por conta" — e é exatamente o que a tela mostraria, sem aviso nenhum, se a
 * tabela ainda não existisse no banco ou a permissão fosse negada.
 */
export function useGastoPorConta(inicio: string, fim: string) {
  return useQuery<DadosGastoPorConta>({
    queryKey: ["trafego-contas", inicio, fim],
    queryFn: async () => {
      const [lancados, contas] = await Promise.all([
        supabase
          .from("gastos_trafego")
          .select("data, canal, valor")
          .gte("data", inicio)
          .lte("data", fim),
        // Paginado: um mês com muitas contas passa do corte de 1.000 linhas
        // do Supabase, que não avisa quando corta.
        buscarTodas((de, ate) =>
          supabase
            .from("gastos_trafego_contas")
            .select("data, canal, conta_id, conta_nome, valor, fechado, atualizado_em")
            .gte("data", inicio)
            .lte("data", fim)
            .order("id")
            .range(de, ate),
        ),
      ]);
      if (lancados.error) throw lancados.error;

      return {
        inicio,
        fim,
        lancados: comValorNumerico(lancados.data ?? []),
        contas: comValorNumerico(contas),
      };
    },
    // Trocar de mês mantém o mês anterior na tela, apagado, até o novo
    // chegar — em vez de piscar "Carregando…" a cada clique.
    placeholderData: keepPreviousData,
  });
}
