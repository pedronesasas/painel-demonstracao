import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { formatBRL, formatDiaMes, MESES } from "@/lib/format";
import {
  FAIXA_LABEL,
  METAS_PADRAO,
  addDias,
  comissao,
  diasDaSemana,
  faixaAtingida,
  fromISO,
  hojeISO,
  inicioSemana,
  semanasDoMes,
  type Metas,
} from "@/lib/semana";

export const Route = createFileRoute("/equipe/")({
  head: () => ({
    meta: [
      { title: "Painel da equipe — Painel Demonstração" },
      {
        name: "description",
        content:
          "Ranking da semana por vendedora: total vendido, faixa projetada, comissão e dias não preenchidos.",
      },
      { property: "og:title", content: "Painel da equipe — Painel Demonstração" },
      {
        property: "og:description",
        content: "Acompanhe a semana de toda a equipe de vendas em uma tela.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppLayout>
      <Equipe />
    </AppLayout>
  ),
});

function Equipe() {
  const { gestao } = useAuth();
  const hoje = hojeISO();
  const [semana, setSemana] = useState(inicioSemana(hoje));
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)));

  if (!gestao) {
    return <p className="text-muted-foreground">Esta tela é da gestora e do admin.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Painel da equipe</h1>
        <p className="text-sm text-muted-foreground">
          A comissão de cada vendedora é definida pelo total da semana no fechamento de domingo.
        </p>
      </div>

      <Tabs defaultValue="semana">
        <TabsList>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="mes">Mês</TabsTrigger>
        </TabsList>

        <TabsContent value="semana" className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSemana(addDias(semana, -7))}>
              Semana anterior
            </Button>
            <span className="text-sm font-medium">
              {formatDiaMes(semana)} a {formatDiaMes(addDias(semana, 6))}
            </span>
            <Button variant="outline" size="sm" onClick={() => setSemana(addDias(semana, 7))}>
              Próxima
            </Button>
          </div>
          <TabelaSemanaEquipe semana={semana} />
        </TabsContent>

        <TabsContent value="mes" className="space-y-4">
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
          <ConsolidadoMes ano={ano} mes={mes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

async function carregarBase(inicio: string, fim: string, ano: number, mes: number) {
  const [{ data: perfis }, { data: papeis }, { data: vendas }, { data: metas }] =
    await Promise.all([
      supabase.from("profiles").select("id, nome, ativo").order("nome"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("vendas_diarias").select("vendedora_id, data, valor").gte("data", inicio).lte("data", fim),
      supabase.from("metas").select("vendedora_id, meta_diaria").eq("ano", ano).eq("mes", mes),
    ]);

  const vendedoras = (perfis ?? []).filter(
    (p) =>
      p.ativo &&
      (papeis ?? []).some((r) => r.user_id === p.id && r.role === "vendedora"),
  );

  const metasPor = (id: string): Metas => {
    const m = (metas ?? []).find((x) => x.vendedora_id === id);
    return m ? { meta_diaria: Number(m.meta_diaria) } : METAS_PADRAO;
  };

  return { vendedoras, vendas: vendas ?? [], metasPor };
}

function TabelaSemanaEquipe({ semana }: { semana: string }) {
  const hoje = hojeISO();
  const dias = diasDaSemana(semana);
  const d = fromISO(semana);

  const { data } = useQuery({
    queryKey: ["equipe-semana", semana],
    queryFn: async () => {
      const base = await carregarBase(dias[0]!, dias[6]!, d.getFullYear(), d.getMonth() + 1);
      const linhas = base.vendedoras.map((v) => {
        const metas = base.metasPor(v.id);
        const minhas = base.vendas.filter((x) => x.vendedora_id === v.id);
        const total = minhas.reduce((s, x) => s + Number(x.valor), 0);
        const preenchidos = new Set(minhas.map((x) => x.data as string));
        const naoPreenchidos = dias.filter((dia) => dia <= hoje && !preenchidos.has(dia)).length;
        return {
          id: v.id,
          nome: v.nome,
          total,
          metas,
          faixa: faixaAtingida(total, metas),
          comissao: comissao(total),
          naoPreenchidos,
        };
      });
      linhas.sort((a, b) => b.total - a.total);
      return linhas;
    },
  });

  const totalEquipe = data?.reduce((s, l) => s + l.total, 0) ?? 0;
  const comissaoEquipe = data?.reduce((s, l) => s + l.comissao, 0) ?? 0;
  const abaixo = data?.filter((l) => l.faixa === "abaixo").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Resumo titulo="Vendido pela equipe" valor={formatBRL(totalEquipe)} />
        <Resumo titulo="Comissão projetada" valor={formatBRL(comissaoEquipe)} />
        <Resumo titulo="Abaixo da meta" valor={String(abaixo)} />
      </div>

      {data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma vendedora cadastrada ainda.
        </p>
      )}

      <div className="space-y-2">
        {data?.map((l, i) => (
          <Link key={l.id} to="/equipe/$id" params={{ id: l.id }}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="flex items-center gap-3 py-4">
                <span className="w-5 text-sm text-muted-foreground tabular">{i + 1}</span>
                <div className="flex-1">
                  <p className="font-medium">{l.nome}</p>
                  <p className="text-sm text-muted-foreground tabular">
                    {formatBRL(l.total)} · comissão {formatBRL(l.comissao)}
                  </p>
                  {l.naoPreenchidos > 0 && (
                    <p className="mt-1 text-xs text-abaixo">
                      {l.naoPreenchidos} dia{l.naoPreenchidos > 1 ? "s" : ""} não preenchido
                      {l.naoPreenchidos > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                <Badge variant={l.faixa === "abaixo" ? "destructive" : "secondary"}>
                  {FAIXA_LABEL[l.faixa]}
                </Badge>
                <ChevronRight className="size-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ConsolidadoMes({ ano, mes }: { ano: number; mes: number }) {
  const { data } = useQuery({
    queryKey: ["equipe-mes", ano, mes],
    queryFn: async () => {
      const semanas = semanasDoMes(ano, mes);
      const inicio = semanas[0]!;
      const fim = addDias(semanas[semanas.length - 1]!, 6);
      const base = await carregarBase(inicio, fim, ano, mes);
      return base.vendedoras
        .map((v) => {
          const minhas = base.vendas.filter((x) => x.vendedora_id === v.id);
          const total = minhas.reduce((s, x) => s + Number(x.valor), 0);
          const comissaoMes = semanas.reduce((soma, seg) => {
            const fimSemana = addDias(seg, 6);
            const totalSemana = minhas
              .filter((x) => (x.data as string) >= seg && (x.data as string) <= fimSemana)
              .reduce((s, x) => s + Number(x.valor), 0);
            return soma + comissao(totalSemana);
          }, 0);
          return { id: v.id, nome: v.nome, total, comissaoMes };
        })
        .sort((a, b) => b.total - a.total);
    },
  });

  return (
    <div className="space-y-2">
      {data?.map((l) => (
        <Card key={l.id}>
          <CardContent className="flex items-center justify-between py-4">
            <p className="font-medium">{l.nome}</p>
            <div className="text-right tabular">
              <p className="text-sm text-muted-foreground">{formatBRL(l.total)} vendidos</p>
              <p className="font-semibold">{formatBRL(l.comissaoMes)} de comissão</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Resumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-xl font-semibold tabular">{valor}</p>
      </CardContent>
    </Card>
  );
}
