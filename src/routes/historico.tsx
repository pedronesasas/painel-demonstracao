import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { formatBRL, formatDiaMes, MESES } from "@/lib/format";
import {
  FAIXA_LABEL,
  METAS_PADRAO,
  PERCENTUAL_COMISSAO,
  addDias,
  comissao,
  faixaAtingida,
  hojeISO,
  metaSemanal,
  semanasDoMes,
  type Metas,
} from "@/lib/semana";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico do mês — Painel Demonstração" },
      {
        name: "description",
        content:
          "Semana a semana: total vendido, meta e comissão, com o total do mês em destaque.",
      },
      { property: "og:title", content: "Histórico do mês — Painel Demonstração" },
      {
        property: "og:description",
        content: "Total vendido e comissão de cada semana do mês.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppLayout>
      <Historico />
    </AppLayout>
  ),
});

function Historico() {
  const { perfil } = useAuth();
  const hoje = hojeISO();
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)));

  const { data } = useQuery({
    enabled: Boolean(perfil),
    queryKey: ["historico", perfil?.id, ano, mes],
    queryFn: async () => {
      const semanas = semanasDoMes(ano, mes);
      const inicio = semanas[0]!;
      const fim = addDias(semanas[semanas.length - 1]!, 6);
      const [{ data: vendas }, { data: metas }] = await Promise.all([
        supabase
          .from("vendas_diarias")
          .select("data, valor")
          .eq("vendedora_id", perfil!.id)
          .gte("data", inicio)
          .lte("data", fim),
        supabase
          .from("metas")
          .select("meta_diaria")
          .eq("vendedora_id", perfil!.id)
          .eq("ano", ano)
          .eq("mes", mes)
          .maybeSingle(),
      ]);

      const m: Metas = metas ? { meta_diaria: Number(metas.meta_diaria) } : METAS_PADRAO;

      const linhas = semanas.map((seg) => {
        const fimSemana = addDias(seg, 6);
        const total = (vendas ?? [])
          .filter((v) => (v.data as string) >= seg && (v.data as string) <= fimSemana)
          .reduce((s, v) => s + Number(v.valor), 0);
        return {
          seg,
          fimSemana,
          total,
          faixa: faixaAtingida(total, m),
          comissao: comissao(total),
          emAndamento: fimSemana >= hoje && seg <= hoje,
          futura: seg > hoje,
        };
      });

      return { linhas, metas: m };
    },
  });

  const totalMes = data?.linhas.reduce((s, l) => s + l.total, 0) ?? 0;
  const comissaoMes = data?.linhas.reduce((s, l) => s + l.comissao, 0) ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Histórico do mês</h1>
        <p className="text-sm text-muted-foreground">
          Cada semana é fechada no domingo, de forma independente.
        </p>
      </div>

      <div className="flex gap-2">
        <select
          className="h-10 rounded-lg border bg-card px-3 text-sm"
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
        >
          {MESES.map((nome, i) => (
            <option key={nome} value={i + 1}>
              {nome}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-lg border bg-card px-3 text-sm"
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
        >
          {[ano - 1, ano, ano + 1].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {data?.linhas.map((l) => (
          <Card key={l.seg}>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {formatDiaMes(l.seg)} a {formatDiaMes(l.fimSemana)}
                  </p>
                  <p className="text-sm text-muted-foreground tabular">
                    Vendido {formatBRL(l.total)}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant={l.faixa === "abaixo" ? "destructive" : "secondary"}>
                    {FAIXA_LABEL[l.faixa]}
                  </Badge>
                  <p className="mt-1 font-semibold tabular">{formatBRL(l.comissao)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground tabular">
                Meta da semana: {formatBRL(metaSemanal(data.metas.meta_diaria))} · comissão de{" "}
                {PERCENTUAL_COMISSAO}% sobre o vendido
              </p>
              {l.emAndamento && (
                <p className="mt-2 text-xs text-muted-foreground">em andamento (parcial)</p>
              )}
              {l.futura && (
                <p className="mt-2 text-xs text-muted-foreground">semana ainda não iniciada</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-primary text-primary-foreground">
        <CardContent className="flex items-center justify-between py-5">
          <div>
            <p className="text-xs opacity-80">Total vendido no mês</p>
            <p className="text-xl font-semibold tabular">{formatBRL(totalMes)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs opacity-80">Comissão do mês</p>
            <p className="text-2xl font-bold tabular">{formatBRL(comissaoMes)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
