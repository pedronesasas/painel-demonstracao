import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDias, hojeISO } from "@/lib/semana";

/**
 * O que a coleta do CRM deixou gravado.
 *
 * Duas leituras diferentes, e a distinção importa:
 *
 * - `ultimo` é o retrato de agora. Responde "o que está pegando fogo".
 * - `serie` é um ponto por dia. Responde "isto está melhorando ou piorando",
 *   que é a pergunta que os checklists no WhatsApp nunca conseguiram
 *   responder — o número estava lá todo dia, e a linha não.
 *
 * Da série sai um ponto por dia, e não um por coleta: com coleta de 15 em 15
 * minutos, plotar tudo viraria serrilha sem significado. O ponto escolhido é
 * o último do dia, que é o fechamento.
 */

export type Snapshot = {
  colhido_em: string;
  colhido_dia: string;
  conversas_unstarted: number | null;
  conversas_waiting: number | null;
  conversas_opened: number | null;
  esperando_resposta: number | null;
  esperando_atrasadas: number | null;
  esperando_24h: number | null;
  atrasadas_24h: number | null;
  espera_maxima_min: number | null;
  leads_do_dia: number | null;
  leads_7dias: number | null;
  leads_total: number | null;
  negocios_total: number | null;
  negocios_movidos_hoje: Record<string, number> | null;
  erro: string | null;
};

export type Etapa = {
  id: string;
  nome: string;
  pipeline_nome: string | null;
  indice: number | null;
  papel: "pediu_o_link" | "retomadas" | null;
};

const COLUNAS =
  "colhido_em, colhido_dia, conversas_unstarted, conversas_waiting, conversas_opened, esperando_resposta, esperando_atrasadas, esperando_24h, atrasadas_24h, espera_maxima_min, leads_do_dia, leads_7dias, leads_total, negocios_total, negocios_movidos_hoje, erro";

export function useDataCrazy(dias = 14) {
  const desde = addDias(hojeISO(), -(dias - 1));

  return useQuery({
    queryKey: ["datacrazy", desde],
    queryFn: async () => {
      const [snapsRes, etapasRes] = await Promise.all([
        supabase
          .from("dc_snapshots")
          .select(COLUNAS)
          .gte("colhido_dia", desde)
          .order("colhido_em", { ascending: true }),
        supabase.from("dc_etapas").select("id, nome, pipeline_nome, indice, papel"),
      ]);

      if (snapsRes.error) throw snapsRes.error;

      const snaps = (snapsRes.data ?? []) as unknown as Snapshot[];
      const etapas = (etapasRes.data ?? []) as unknown as Etapa[];

      // Um ponto por dia: o último do dia. Vem ordenado crescente, então o
      // último a escrever na chave é o mais recente.
      const porDia = new Map<string, Snapshot>();
      for (const s of snaps) porDia.set(s.colhido_dia, s);

      return {
        ultimo: snaps.length > 0 ? snaps[snaps.length - 1]! : null,
        serie: [...porDia.values()],
        etapas,
        /** Nome da etapa a partir do id — os ids do CRM são uuid opaco. */
        nomeDaEtapa: (id: string) => etapas.find((e) => e.id === id)?.nome ?? id.slice(0, 8),
      };
    },
  });
}

/**
 * Quanto entrou em cada etapa, com o nome no lugar do uuid.
 *
 * Ordena por volume porque, num quadro de dezessete etapas, quase todas ficam
 * em zero — e a que importa é a que se moveu.
 */
export function movimentoPorEtapa(
  s: Snapshot | null,
  nomeDaEtapa: (id: string) => string,
): { nome: string; quantos: number }[] {
  if (!s?.negocios_movidos_hoje) return [];
  return Object.entries(s.negocios_movidos_hoje)
    .filter(([, q]) => q > 0)
    .map(([id, quantos]) => ({ nome: nomeDaEtapa(id), quantos }))
    .sort((a, b) => b.quantos - a.quantos);
}
