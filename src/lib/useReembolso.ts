import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buscarTodas } from "@/lib/buscarTodas";
import { addDias } from "@/lib/semana";
import { fimMes, inicioMes } from "@/lib/useFinanceiro";
import type { LinhaReembolso } from "@/lib/reembolso";

// Só o que a conta precisa: sem valor e sem cliente.
const COLUNAS =
  "id, plataforma, pedido_externo_id, pedido_chave, status, ocorrido_dia, reembolsado_dia";

/**
 * Vendas e reembolsos do mês e do anterior, para a taxa acumulada lado a lado.
 *
 * Duas buscas pelo mesmo motivo de `useFinanceiro`: a venda aparece pela data
 * dela, e o estorno de uma venda mais antiga só aparece pela data do estorno.
 */
export function useReembolsoMensal(mesInicio: string) {
  const inicio = inicioMes(addDias(mesInicio, -1));
  const fim = fimMes(mesInicio);

  return useQuery<LinhaReembolso[]>({
    queryKey: ["reembolso-mensal", mesInicio],
    queryFn: async () => {
      const [vendidas, devolvidasDeAntes] = await Promise.all([
        buscarTodas((de, ate) =>
          supabase
            .from("vendas")
            .select(COLUNAS)
            .gte("ocorrido_dia", inicio)
            .lte("ocorrido_dia", fim)
            .in("status", ["aprovada", "reembolsada", "chargeback"])
            .order("id")
            .range(de, ate),
        ),
        buscarTodas((de, ate) =>
          supabase
            .from("vendas")
            .select(COLUNAS)
            .gte("reembolsado_dia", inicio)
            .lte("reembolsado_dia", fim)
            .lt("ocorrido_dia", inicio)
            .order("id")
            .range(de, ate),
        ),
      ]);
      return [...vendidas, ...devolvidasDeAntes];
    },
  });
}
