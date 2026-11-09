import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AjudaMetrica } from "@/components/AjudaMetrica";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatBRL, formatDiaMes } from "@/lib/format";
import type { ChaveMetrica } from "@/lib/glossario";
import { addDias, hojeISO } from "@/lib/semana";
import { inicioMes } from "@/lib/useFinanceiro";
import type { StatusVenda } from "@/lib/financeiro";
import {
  FAIXAS,
  PISO_VENDAS_BONUS,
  SITUACAO_LABEL,
  comissaoDaReversao,
  comissaoEstimada,
  progressoBonus,
  situacaoReversao,
  type SituacaoReversao,
} from "@/lib/reembolso";

/**
 * O que o suporte ganha, pela regra de remuneração da operação.
 *
 * Os números vêm de `suporte_resumo_mes`, e não da tabela de vendas: o
 * suporte não enxerga faturamento. A regra dá ao suporte o número de
 * vendas, o de reembolsos e o valor de cada reversão — é isso que chega aqui.
 */

export type Revertida = {
  id: string;
  cliente_nome: string | null;
  produto_nome: string | null;
  plataforma: string;
  revertida_dia: string;
  com_registro: boolean;
  valor_bruto: number | null;
  juros_parcelamento: number | null;
  liquido_plataforma: number | null;
  /** Calculado pela tabela de taxas quando a plataforma não informa (Plataforma A). */
  liquido_estimado?: number | null;
  status_venda: StatusVenda | null;
  perc_juros_repassado: number;
};

export type ResumoSuporte = {
  imposto_percentual: number;
  vendas: Record<string, number>;
  reembolsos: Record<string, number>;
  revertidas: Revertida[];
};

/** Busca o extrato de um mês. A mesma chave serve à tela do mês e ao histórico. */
export function consultaResumoMes(mes: string) {
  return {
    queryKey: ["suporte-resumo-mes", mes] as const,
    queryFn: async (): Promise<ResumoSuporte> => {
      const { data, error } = await supabase.rpc("suporte_resumo_mes", { p_mes: mes });
      if (error) throw error;
      return data as unknown as ResumoSuporte;
    },
  };
}

/**
 * O extrato do mês: comissão de cada reversão, separada entre confirmada e em
 * carência, e onde a taxa do mês está nas faixas do bônus.
 */
export function extratoDoMes(data: ResumoSuporte, hoje: string) {
  const soma = (r: Record<string, number>) => Object.values(r).reduce((s, n) => s + n, 0);
  const bonus = progressoBonus(soma(data.vendas), soma(data.reembolsos));

  const casos = data.revertidas.map((r) => {
    const { situacao, confirmaEm } = situacaoReversao({
      revertidaDia: r.revertida_dia,
      hoje,
      statusVenda: r.status_venda,
      comRegistro: r.com_registro,
    });
    const venda =
      r.valor_bruto === null
        ? null
        : {
            valor_bruto: r.valor_bruto,
            juros_parcelamento: r.juros_parcelamento ?? 0,
            liquido_plataforma: r.liquido_plataforma,
            liquido_estimado: r.liquido_estimado ?? null,
            status: r.status_venda,
            perc_juros_repassado: r.perc_juros_repassado,
          };
    const comissao = venda ? comissaoDaReversao(venda, data.imposto_percentual) : null;
    const estimada = venda !== null && comissao !== null && comissaoEstimada(venda);
    return { ...r, situacao, confirmaEm, comissao, estimada };
  });

  const somaDe = (s: SituacaoReversao) =>
    casos.filter((c) => c.situacao === s).reduce((t, c) => t + (c.comissao ?? 0), 0);
  const emCarencia = casos.filter((c) => c.situacao === "em_carencia");

  return {
    bonus,
    casos,
    confirmado: somaDe("confirmada"),
    qtdConfirmadas: casos.filter((c) => c.situacao === "confirmada").length,
    carencia: somaDe("em_carencia"),
    qtdCarencia: emCarencia.length,
    proximaConfirmacao: emCarencia.map((c) => c.confirmaEm).sort()[0] ?? null,
    semRegistro: casos.filter((c) => c.situacao === "sem_registro").length,
  };
}

const TOM_SITUACAO: Record<SituacaoReversao, string> = {
  confirmada: "bg-positivo/15 text-positivo",
  em_carencia: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  anulada: "bg-secondary text-muted-foreground line-through",
  sem_registro: "bg-secondary text-muted-foreground",
};

export function BonificacaoSuporte() {
  const hoje = hojeISO();
  const esteMes = inicioMes(hoje);
  const mesPassado = inicioMes(addDias(esteMes, -1));
  const [mes, setMes] = useState(esteMes);

  const { data, isLoading, error } = useQuery(consultaResumoMes(mes));

  const calc = useMemo(() => (data ? extratoDoMes(data, hoje) : null), [data, hoje]);

  const nomeMes = (iso: string) => {
    const [a, m] = iso.split("-").map(Number);
    return new Date(a!, m! - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  };

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Comissão e bônus — {nomeMes(mes)}</p>
            <p className="text-xs text-muted-foreground">
              10% do líquido de cada venda em que o cliente desistiu do reembolso, mais o bônus
              pela taxa de reembolso do mês.
            </p>
          </div>
          <div className="flex gap-1">
            {[
              [esteMes, "Este mês"],
              [mesPassado, "Mês passado"],
            ].map(([m, rot]) => (
              <Button
                key={m}
                size="sm"
                variant={mes === m ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setMes(m!)}
              >
                {rot}
              </Button>
            ))}
          </div>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && (
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar o extrato do mês.
          </p>
        )}

        {calc && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Bloco
                titulo="Comissão confirmada"
                valor={formatBRL(calc.confirmado)}
                rodape={`${calc.qtdConfirmadas} ${calc.qtdConfirmadas === 1 ? "reversão" : "reversões"}`}
                positivo={calc.confirmado > 0}
              />
              <Bloco
                titulo="Em carência"
                ajuda="emCarencia"
                valor={formatBRL(calc.carencia)}
                rodape={
                  calc.proximaConfirmacao
                    ? `${calc.qtdCarencia} · próxima confirma em ${formatDiaMes(calc.proximaConfirmacao)}`
                    : "nenhuma aguardando"
                }
              />
              <Bloco
                titulo="Bônus se o mês fechasse hoje"
                valor={calc.bonus.faixa ? formatBRL(calc.bonus.faixa.bonus) : "—"}
                rodape={
                  calc.bonus.taxa === null
                    ? "nenhuma venda no mês ainda"
                    : `taxa de ${calc.bonus.taxa.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}% · ${calc.bonus.reembolsos} reembolsos em ${calc.bonus.vendas} pedidos`
                }
                positivo={(calc.bonus.faixa?.bonus ?? 0) > 0}
              />
            </div>

            {calc.bonus.abaixoDoPiso && calc.bonus.vendas > 0 && (
              <p className="text-xs text-muted-foreground">
                O bônus só é apurado a partir de {PISO_VENDAS_BONUS} pedidos no mês — faltam{" "}
                {calc.bonus.faltamParaPiso}.
              </p>
            )}

            <FaixasDoBonus atual={calc.bonus.faixa?.bonus ?? null} />

            {calc.casos.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Reversões do mês</p>
                {calc.casos.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.cliente_nome ?? "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDiaMes(c.revertida_dia)}
                        {c.produto_nome && ` · ${c.produto_nome}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-xs",
                          TOM_SITUACAO[c.situacao],
                        )}
                        title={
                          c.situacao === "em_carencia"
                            ? `Confirma em ${formatDiaMes(c.confirmaEm)} se não houver estorno`
                            : undefined
                        }
                      >
                        {SITUACAO_LABEL[c.situacao]}
                      </span>
                      <span
                        className="tabular font-semibold"
                        title={
                          c.estimada
                            ? "A plataforma não informa o líquido: calculado pela tabela de taxas dela"
                            : undefined
                        }
                      >
                        {c.comissao === null ? "—" : formatBRL(c.comissao)}
                        {c.estimada && (
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                            pela tabela
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {calc.semRegistro > 0 && (
              <p className="text-xs text-muted-foreground">
                {calc.semRegistro === 1
                  ? "Uma reversão está"
                  : `${calc.semRegistro} reversões estão`}{" "}
                sem registro de atendimento, e por isso sem comissão. A plataforma marca como
                revertido quando o próprio cliente cancela o pedido. Se o atendimento foi seu, abra
                o caso e registre o que foi feito.
              </p>
            )}

            <p className="text-[11px] text-muted-foreground">
              Nas vendas da Plataforma A, que não informa o líquido, a comissão sai pela tabela de taxas
              da plataforma. O bônus também depende da qualidade do atendimento, avaliada
              no fechamento do mês.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** As faixas do bônus, da melhor para a pior, com a do mês em destaque. */
function FaixasDoBonus({ atual }: { atual: number | null }) {
  return (
    <div className="rounded-lg border">
      <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        Faixas do bônus pela taxa de reembolso do mês
      </p>
      <div className="divide-y text-sm">
        {[...FAIXAS].reverse().map((f) => (
          <div
            key={f.bonus}
            className={cn(
              "flex items-center justify-between px-3 py-1.5",
              atual === f.bonus && "bg-positivo/10 font-semibold",
            )}
          >
            <span>
              Taxa {f.rotulo}
              {atual === f.bonus && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  ← o mês está aqui
                </span>
              )}
            </span>
            <span className="tabular">{f.bonus > 0 ? formatBRL(f.bonus) : "sem bônus"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bloco({
  titulo,
  valor,
  rodape,
  positivo,
  ajuda,
}: {
  titulo: string;
  valor: string;
  rodape: string;
  positivo?: boolean;
  ajuda?: ChaveMetrica;
}) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        {ajuda && <AjudaMetrica metrica={ajuda} />}
      </div>
      <p className={cn("tabular text-lg font-semibold", positivo && "text-positivo")}>{valor}</p>
      <p className="text-xs text-muted-foreground">{rodape}</p>
    </div>
  );
}
