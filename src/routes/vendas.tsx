import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SeletorPeriodo } from "@/components/SeletorPeriodo";
import { useAuth } from "@/lib/useAuth";
import { formatBRL, formatDataHora } from "@/lib/format";
import {
  PLATAFORMA_LABEL,
  STATUS_LABEL,
  TIPO_LABEL,
  faturamentoPorPlataformaMes,
  jurosRepassados,
  taxaDoItem,
  taxaVigente,
  type Plataforma,
  type StatusVenda,
} from "@/lib/financeiro";
import { periodosPadrao, rotuloPeriodo, useFinanceiro, type Periodo } from "@/lib/useFinanceiro";

type FiltroPlataforma = Plataforma | "todas";
type FiltroStatus = StatusVenda | "todos";

export const Route = createFileRoute("/vendas")({
  head: () => ({
    meta: [
      { title: "Vendas — Painel Demonstração" },
      {
        name: "description",
        content:
          "Consulta item a item das vendas recebidas das plataformas, com taxa e líquido de cada uma.",
      },
      { property: "og:title", content: "Vendas — Painel Demonstração" },
      { property: "og:description", content: "Consulta das vendas recebidas, com taxa e líquido de cada item." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppLayout>
      <Vendas />
    </AppLayout>
  ),
});

function Vendas() {
  const { gestao } = useAuth();
  const opcoes = useMemo(() => periodosPadrao(), []);
  const [periodo, setPeriodo] = useState<Periodo>(opcoes[4]!);
  const [plataforma, setPlataforma] = useState<FiltroPlataforma>("todas");
  const [status, setStatus] = useState<FiltroStatus>("todos");
  const [busca, setBusca] = useState("");

  const { data, isLoading } = useFinanceiro(periodo);

  const linhas = useMemo(() => {
    if (!data) return [];
    const porMes = faturamentoPorPlataformaMes(data.universo);
    const termo = busca.trim().toLowerCase();

    return data.vendas
      .filter((v) => plataforma === "todas" || v.plataforma === plataforma)
      .filter((v) => status === "todos" || v.status === status)
      .filter((v) => {
        if (!termo) return true;
        return [v.cliente_nome, v.cliente_email, v.produto_nome, v.pedido_externo_id].some((c) =>
          c?.toLowerCase().includes(termo),
        );
      })
      .map((v) => {
        const taxa = taxaVigente(
          data.taxas,
          v.plataforma,
          v.ocorrido_dia,
          porMes.get(`${v.plataforma}|${v.ocorrido_dia.slice(0, 7)}`) ?? 0,
        );
        const custo = v.status === "aprovada" ? taxaDoItem(v, taxa) : 0;
        const juros = v.status === "aprovada" ? jurosRepassados(v, taxa) : 0;
        const imposto =
          v.status === "aprovada" ? (v.valor_bruto + juros) * (data.impostoPercentual / 100) : 0;
        // Mesma cascata do painel, item a item. As tres deducoes do meio sao
        // zero hoje (sem coprodutor, afiliado ou custo de produto), mas ficam
        // na conta para o dia em que existirem.
        const deducoes = v.taxa_coprodutor + v.taxa_afiliado + v.custo_produto;
        return {
          v,
          custo,
          juros,
          imposto,
          liquido: v.status === "aprovada" ? v.valor_bruto + juros - custo - deducoes - imposto : 0,
        };
      });
  }, [data, plataforma, status, busca]);

  if (!gestao) {
    return <p className="text-muted-foreground">Esta tela é da gestora e do admin.</p>;
  }

  const totalBruto = linhas
    .filter((l) => l.v.status === "aprovada")
    .reduce((s, l) => s + l.v.valor_bruto, 0);
  const totalLiquido = linhas.reduce((s, l) => s + l.liquido, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vendas</h1>
        <p className="text-sm text-muted-foreground">
          Uma linha por item vendido — order bump e upsell aparecem separados do produto principal,
          porque a taxa de cada um é diferente.
        </p>
      </div>

      <SeletorPeriodo opcoes={opcoes} periodo={periodo} onMudar={setPeriodo} />

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-lg border bg-card px-3 text-sm"
          value={plataforma}
          onChange={(e) => setPlataforma(e.target.value as FiltroPlataforma)}
        >
          <option value="todas">Todas as plataformas</option>
          <option value="plataforma_a">Plataforma A</option>
          <option value="plataforma_b">Plataforma B</option>
        </select>

        <select
          className="h-9 rounded-lg border bg-card px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as FiltroStatus)}
        >
          <option value="todos">Todos os status</option>
          <option value="aprovada">Aprovadas</option>
          <option value="reembolsada">Reembolsadas</option>
          <option value="chargeback">Chargeback</option>
          <option value="pendente">Aguardando pagamento</option>
          <option value="nao_paga">Não pagas</option>
        </select>

        <Input
          placeholder="Cliente, produto ou pedido"
          className="h-9 w-full sm:w-64"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Resumo titulo="Itens" valor={String(linhas.length)} />
        <Resumo titulo="Faturamento bruto" valor={formatBRL(totalBruto)} />
        <Resumo titulo="Faturamento líquido" valor={formatBRL(totalLiquido)} />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && linhas.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">Nada em {rotuloPeriodo(periodo)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              As vendas chegam pelos webhooks das plataformas assim que forem configurados.
            </p>
          </CardContent>
        </Card>
      )}

      {linhas.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto py-2">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Quando</th>
                  <th className="px-2 py-2 text-left font-medium">Produto</th>
                  <th className="px-2 py-2 text-left font-medium">Cliente</th>
                  <th className="px-2 py-2 text-right font-medium">Bruto</th>
                  <th className="px-2 py-2 text-right font-medium">Taxa</th>
                  <th className="px-2 py-2 text-right font-medium">Imposto</th>
                  <th className="px-2 py-2 text-right font-medium">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ v, custo, imposto, liquido, juros }) => (
                  <tr key={v.id} className="border-b last:border-0 align-top">
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                      {formatDataHora(v.ocorrido_em)}
                      <span className="mt-0.5 block">{PLATAFORMA_LABEL[v.plataforma]}</span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="block">{v.produto_nome ?? "—"}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        {v.tipo !== "principal" && (
                          <Badge variant="outline" className="text-[10px]">
                            {TIPO_LABEL[v.tipo]}
                          </Badge>
                        )}
                        {v.status !== "aprovada" && (
                          <Badge variant="destructive" className="text-[10px]">
                            {STATUS_LABEL[v.status]}
                          </Badge>
                        )}
                        {v.parcelas > 1 && (
                          <span className="text-[10px] text-muted-foreground">
                            {v.parcelas}x{juros > 0 && ` · ${formatBRL(juros)} de juros p/ nós`}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <span className="block">{v.cliente_nome ?? "—"}</span>
                      <span className="text-muted-foreground">{v.cliente_email ?? ""}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular">{formatBRL(v.valor_bruto)}</td>
                    <td className="px-2 py-2 text-right tabular text-muted-foreground">
                      {custo > 0 ? `− ${formatBRL(custo)}` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular text-muted-foreground">
                      {imposto > 0 ? `− ${formatBRL(imposto)}` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular font-medium">
                      {v.status === "aprovada" ? formatBRL(liquido) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
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
