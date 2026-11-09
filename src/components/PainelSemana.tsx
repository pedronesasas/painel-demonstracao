import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LancamentoDialog } from "@/components/LancamentoDialog";
import { formatBRL, formatDiaMes, DIAS_SEMANA } from "@/lib/format";
import {
  FAIXA_LABEL,
  METAS_PADRAO,
  PERCENTUAL_COMISSAO,
  comissao,
  diasDaSemana,
  faixaAtingida,
  fromISO,
  hojeISO,
  inicioSemana,
  metaSemanal,
  montarSemana,
  proximoPasso,
  type Faixa,
  type Metas,
} from "@/lib/semana";
import { cn } from "@/lib/utils";

const FAIXA_BG: Record<Faixa, string> = {
  batida: "bg-faixa10 text-faixa10-foreground",
  abaixo: "bg-faixa5 text-faixa5-foreground",
};

export function useDadosSemana(vendedoraId: string, refISO: string) {
  const seg = inicioSemana(refISO);
  const dias = diasDaSemana(seg);
  const d = fromISO(seg);

  return useQuery({
    queryKey: ["semana", vendedoraId, seg],
    queryFn: async () => {
      const [{ data: vendas }, { data: metas }] = await Promise.all([
        supabase
          .from("vendas_diarias")
          .select("data, valor")
          .eq("vendedora_id", vendedoraId)
          .gte("data", dias[0])
          .lte("data", dias[6]),
        supabase
          .from("metas")
          .select("meta_diaria")
          .eq("vendedora_id", vendedoraId)
          .eq("ano", d.getFullYear())
          .eq("mes", d.getMonth() + 1)
          .maybeSingle(),
      ]);

      const mapa: Record<string, number> = {};
      for (const v of vendas ?? []) mapa[v.data as string] = Number(v.valor);

      const metasNum: Metas = metas ? { meta_diaria: Number(metas.meta_diaria) } : METAS_PADRAO;

      return { vendas: mapa, metas: metasNum, metasCadastradas: Boolean(metas) };
    },
  });
}

export function PainelSemana({
  vendedoraId,
  nome,
  refISO,
  semTrava,
}: {
  vendedoraId: string;
  nome: string;
  refISO: string;
  semTrava: boolean;
}) {
  const seg = inicioSemana(refISO);
  const { data, isLoading, refetch } = useDadosSemana(vendedoraId, seg);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [dataEdicao, setDataEdicao] = useState<string | undefined>(undefined);

  if (isLoading || !data) {
    return <p className="text-muted-foreground">Carregando semana…</p>;
  }

  const linhas = montarSemana(seg, data.vendas, data.metas);
  const total = linhas[6]?.acumulado ?? 0;
  const faixa = faixaAtingida(total, data.metas);
  const valorComissao = comissao(total);
  const dias = diasDaSemana(seg);
  const semLancamentos = Object.keys(data.vendas).length === 0;

  function abrirLancamento(dia?: string) {
    setDataEdicao(dia ?? hojeISO());
    setDialogAberto(true);
  }

  const meta = metaSemanal(data.metas.meta_diaria);
  const pct = Math.min(100, meta > 0 ? (total / meta) * 100 : 0);
  const falta = Math.max(0, meta - total);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {nome}</h1>
        <p className="text-sm text-muted-foreground">
          Semana de {formatDiaMes(dias[0] ?? seg)} a {formatDiaMes(dias[6] ?? seg)}
        </p>
      </div>

      <Card className={cn("border-0 shadow-sm", FAIXA_BG[faixa])}>
        <CardContent className="space-y-3 py-6">
          <p className="text-sm/none opacity-80">Comissão da semana até agora</p>
          <p className="text-4xl font-bold tracking-tight tabular">{formatBRL(valorComissao)}</p>
          <p className="text-sm opacity-90 tabular">
            {PERCENTUAL_COMISSAO}% de {formatBRL(total)} vendidos · {FAIXA_LABEL[faixa]}
          </p>
          <p className="text-sm opacity-90">
            {proximoPasso(total, data.metas, seg)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-5">
          <p className="text-sm font-medium">Meta da semana</p>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium tabular">
                {formatBRL(total)} <span className="text-muted-foreground">de {formatBRL(meta)}</span>
              </span>
              <span className={cn("tabular", falta === 0 ? "text-positivo" : "text-muted-foreground")}>
                {falta === 0 ? "atingida" : `faltam ${formatBRL(falta)}`}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-faixa10 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              Meta diária de {formatBRL(data.metas.meta_diaria)}, de segunda a sexta.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button size="lg" className="h-14 w-full text-base" onClick={() => abrirLancamento()}>
        <Plus className="size-5" /> Lançar venda de hoje
      </Button>

      {!data.metasCadastradas && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="size-3.5" />
          Metas deste mês não cadastradas — usando os valores padrão.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {semLancamentos && (
            <p className="border-b p-4 text-sm text-muted-foreground">
              Nenhuma venda lançada nesta semana ainda — comece lançando o dia de hoje.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Dia</th>
                  <th className="px-3 py-2 text-right font-medium">Vendido</th>
                  <th className="px-3 py-2 text-right font-medium">Total vendido</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo da meta</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr
                    key={l.data}
                    onClick={() => (l.futuro ? undefined : abrirLancamento(l.data))}
                    className={cn(
                      "border-b last:border-0 tabular",
                      l.futuro ? "text-muted-foreground/50" : "cursor-pointer hover:bg-accent/50",
                      l.hoje && "bg-secondary font-medium",
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {DIAS_SEMANA[l.posicao]} {formatDiaMes(l.data)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      {l.vendido != null ? (
                        formatBRL(l.vendido)
                      ) : l.naoPreenchido ? (
                        <span className="text-abaixo">— não preenchido</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {l.futuro ? "—" : formatBRL(l.acumulado)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right",
                        l.futuro ? "" : l.saldo < 0 ? "text-negativo" : "text-positivo",
                      )}
                    >
                      {l.futuro ? "—" : formatBRL(l.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
            A comissão é {PERCENTUAL_COMISSAO}% de tudo que foi vendido na semana. O saldo compara
            o vendido com a meta acumulada até o dia: um dia ruim ainda pode ser recuperado.
          </p>
        </CardContent>
      </Card>

      <LancamentoDialog
        aberto={dialogAberto}
        onOpenChange={setDialogAberto}
        vendedoraId={vendedoraId}
        semTrava={semTrava}
        {...(dataEdicao ? { dataInicial: dataEdicao } : {})}
        valorInicial={dataEdicao ? (data.vendas[dataEdicao] ?? null) : null}
        onSalvo={() => void refetch()}
      />
    </div>
  );
}

export { FAIXA_BG };
