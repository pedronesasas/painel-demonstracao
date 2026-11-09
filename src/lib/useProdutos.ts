import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buscarTodas } from "@/lib/buscarTodas";
import { itensDaFatura, type ItemDaFatura } from "@/lib/produtos";
import { fimMes, inicioMes, type Periodo } from "@/lib/useFinanceiro";

/**
 * Os produtos de cada fatura da Plataforma B, por id da venda.
 *
 * Busca à parte de `useFinanceiro` porque só a tela de Produtos precisa do
 * detalhe, e ele mora dentro do aviso guardado (`payload`), que as outras
 * telas não carregam. Só a lista de produtos sai do banco: nome, preço e
 * marca de order bump, nada do cliente.
 *
 * A janela é a mesma de `useFinanceiro` (os meses inteiros e os estornos de
 * vendas anteriores), para toda linha da tela achar o detalhe dela.
 */
export function useItensDasFaturas(periodo: Periodo) {
  const inicio = inicioMes(periodo.inicio);
  const fim = fimMes(periodo.fim);

  return useQuery<Map<string, ItemDaFatura[]>>({
    queryKey: ["itens-faturas-plataforma_b", inicio, fim],
    queryFn: async () => {
      const colunas = "id, produtos:payload->event->products";
      const [vendidas, devolvidasDeAntes] = await Promise.all([
        buscarTodas((de, ate) =>
          supabase
            .from("vendas")
            .select(colunas)
            .eq("plataforma", "plataforma_b")
            .gte("ocorrido_dia", inicio)
            .lte("ocorrido_dia", fim)
            .order("id")
            .range(de, ate),
        ),
        buscarTodas((de, ate) =>
          supabase
            .from("vendas")
            .select(colunas)
            .eq("plataforma", "plataforma_b")
            .gte("reembolsado_dia", inicio)
            .lte("reembolsado_dia", fim)
            .lt("ocorrido_dia", inicio)
            .order("id")
            .range(de, ate),
        ),
      ]);

      const itens = new Map<string, ItemDaFatura[]>();
      for (const linha of [...vendidas, ...devolvidasDeAntes]) {
        const daFatura = itensDaFatura(linha.produtos);
        if (daFatura) itens.set(linha.id, daFatura);
      }
      return itens;
    },
  });
}
