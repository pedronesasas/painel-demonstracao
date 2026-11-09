import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, CircleAlert, Clock, TrendingDown } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/useAuth";
import { formatBRL, formatDiaMes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PLATAFORMAS,
  type Apuracao,
  PLATAFORMA_LABEL,
  apurar,
  faixasEstouradas,
  formatMultiplo,
  formatPercent,
  serieDiaria,
} from "@/lib/financeiro";
import {
  diasDoIntervalo,
  periodoAnterior,
  periodosPadrao,
  rotuloPeriodo,
  useFinanceiro,
  useMetasOperacao,
  type Periodo,
} from "@/lib/useFinanceiro";
import { avaliarSaude, type Nivel } from "@/lib/saude";
import { recortar, type Recorte } from "@/lib/recorte";
import { PainelRitmo } from "@/components/PainelRitmo";
import { AjudaMetrica } from "@/components/AjudaMetrica";
import { SeletorPeriodo } from "@/components/SeletorPeriodo";
import { FiltroPlataforma } from "@/components/FiltroPlataforma";
import { SecaoReembolso } from "@/components/SecaoReembolso";
import type { ChaveMetrica } from "@/lib/glossario";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Painel Demonstração" },
      {
        name: "description",
        content: "Faturamento bruto e líquido, lucro, margem, ROAS e ROI da operação em uma tela.",
      },
      { property: "og:title", content: "Dashboard — Painel Demonstração" },
      {
        property: "og:description",
        content: "Faturamento, lucro, margem, ROAS e ROI da operação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppLayout>
      <Dashboard />
    </AppLayout>
  ),
});

function Dashboard() {
  const { gestao } = useAuth();
  const opcoes = useMemo(() => periodosPadrao(), []);
  const [periodo, setPeriodo] = useState<Periodo>(opcoes[4]!); // este mês
  const [recorte, setRecorte] = useState<Recorte>("todas");
  const [contarTrafego, setContarTrafego] = useState(true);

  if (!gestao) {
    return <p className="text-muted-foreground">Esta tela é da gestora e do admin.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          O que sobra depois que plataforma, imposto, anúncios e despesas cobram a parte deles.
        </p>
      </div>

      <SeletorPeriodo opcoes={opcoes} periodo={periodo} onMudar={setPeriodo} />

      <Conteudo
        periodo={periodo}
        recorte={recorte}
        onRecorte={setRecorte}
        contarTrafego={contarTrafego}
        onContarTrafego={setContarTrafego}
      />
    </div>
  );
}

function Conteudo({
  periodo,
  recorte,
  onRecorte,
  contarTrafego,
  onContarTrafego,
}: {
  periodo: Periodo;
  recorte: Recorte;
  onRecorte: (r: Recorte) => void;
  contarTrafego: boolean;
  onContarTrafego: (v: boolean) => void;
}) {
  const { data, isLoading } = useFinanceiro(periodo);
  const anterior = useMemo(() => periodoAnterior(periodo), [periodo]);
  const { data: dadosAnteriores } = useFinanceiro(anterior);
  const { data: metas } = useMetasOperacao();

  const calc = useMemo(() => {
    if (!data) return null;
    const r = recortar(data, periodo, recorte, contarTrafego);
    const a = apurar(
      r.vendas,
      data.taxas,
      r.gastos,
      r.despesas,
      data.impostoPercentual,
      r.universo,
      periodo,
    );
    const serie = serieDiaria(
      diasDoIntervalo(periodo.inicio, periodo.fim),
      recorte === "todas" ? data.universo : data.universo.filter((v) => v.plataforma === recorte),
      data.taxas,
      r.gastos,
      r.despesas,
      data.impostoPercentual,
    ).filter((l) => l.data >= periodo.inicio && l.data <= periodo.fim);

    // O período anterior passa pelo mesmo recorte, com o rateio dele: comparar
    // a Plataforma B de agora com a operação inteira de antes não diria nada.
    const rAntes = dadosAnteriores
      ? recortar(dadosAnteriores, anterior, recorte, contarTrafego)
      : null;
    const antes =
      dadosAnteriores && rAntes
        ? apurar(
            rAntes.vendas,
            dadosAnteriores.taxas,
            rAntes.gastos,
            rAntes.despesas,
            dadosAnteriores.impostoPercentual,
            rAntes.universo,
            anterior,
          )
        : null;

    return {
      a,
      antes,
      serie,
      participacao: r.participacao,
      alertas: faixasEstouradas(data.universo, data.taxas),
    };
  }, [data, dadosAnteriores, periodo, anterior, recorte, contarTrafego]);

  const filtro = (
    <FiltroPlataforma
      recorte={recorte}
      onRecorte={onRecorte}
      contarTrafego={contarTrafego}
      onContarTrafego={onContarTrafego}
      participacao={calc?.participacao ?? null}
    />
  );

  if (isLoading || !calc) {
    return (
      <div className="space-y-5">
        {filtro}
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  const { a, antes, serie, alertas } = calc;
  const plataforma = recorte === "todas" ? null : PLATAFORMA_LABEL[recorte];
  const trafegoRateado = plataforma !== null && contarTrafego;

  if (a.itensVendidos === 0 && a.reembolsos === 0 && a.gastosTotais === 0) {
    return (
      <div className="space-y-5">
        {filtro}
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">
              Nenhum movimento{plataforma ? ` na ${plataforma}` : ""} em {rotuloPeriodo(periodo)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              As vendas entram sozinhas pelos webhooks das plataformas. Anúncios e despesas são
              lançados na aba Custos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {filtro}

      {plataforma && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Só a {plataforma}. Despesas fixas são da operação inteira e ficam de fora.{" "}
          {contarTrafego
            ? "O anúncio entra pela fatia da plataforma no faturamento: a mesma campanha vende nas duas, e não existe dado que separe."
            : "Sem o anúncio, o lucro abaixo é a margem de contribuição da plataforma — a medida certa para comparar as duas."}
        </p>
      )}

      {alertas.length > 0 && (
        <Card className="border-abaixo/40 bg-abaixo-soft">
          <CardContent className="flex gap-3 py-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-abaixo" />
            <div className="text-sm">
              <p className="font-medium">Faixa de taxa estourada</p>
              {alertas.map((al) => (
                <p key={`${al.plataforma}-${al.mes}`} className="text-muted-foreground">
                  {PLATAFORMA_LABEL[al.plataforma]} faturou {formatBRL(al.faturamento)} em {al.mes}{" "}
                  — acima da última faixa cadastrada. O custo abaixo está otimista até a faixa
                  seguinte ser cadastrada.
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {antes && (a.itens > 0 || antes.itens > 0) && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Variações comparadas com {rotuloPeriodo(anterior)} ({anterior.rotulo}).
        </p>
      )}

      {/* Sem o anúncio, qualquer plataforma pareceria saudável: o veredito
          julga o lucro, e ali o lucro não é lucro. */}
      {(!plataforma || contarTrafego) && <Veredito apuracao={a} />}

      {/* A meta é da operação inteira: medir o ritmo de uma plataforma contra
          ela faria qualquer uma parecer atrasada. */}
      {data && recorte === "todas" && (
        <PainelRitmo
          vendas={data.universo}
          taxas={data.taxas}
          gastos={data.gastos}
          despesas={data.despesas}
          impostoPercentual={data.impostoPercentual}
          mensal={metas?.mensal ?? null}
          semanal={metas?.semanal ?? null}
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          titulo="Faturamento bruto"
          ajuda="faturamentoBruto"
          valor={formatBRL(a.faturamentoBruto)}
          rodape="venda aprovada − reembolso"
          variacao={variacao(a.faturamentoBruto, antes?.faturamentoBruto)}
        />
        <Kpi
          titulo="Faturamento líquido"
          ajuda="faturamentoLiquido"
          valor={formatBRL(a.faturamentoLiquido)}
          rodape="bruto − taxas − imposto"
          variacao={variacao(a.faturamentoLiquido, antes?.faturamentoLiquido)}
        />
        <Kpi
          titulo={plataforma && !contarTrafego ? "Margem de contribuição" : "Lucro"}
          ajuda="lucro"
          valor={formatBRL(a.lucro)}
          rodape={
            plataforma
              ? contarTrafego
                ? "líquido − anúncio rateado"
                : "líquido, sem anúncio"
              : "líquido − anúncios − despesas"
          }
          tom={a.lucro >= 0 ? "positivo" : "negativo"}
          variacao={variacao(a.lucro, antes?.lucro)}
        />
        <Kpi
          titulo="Margem"
          ajuda="margem"
          valor={formatPercent(a.margem)}
          rodape="lucro / faturamento líquido"
          tom={a.margem >= 0 ? "positivo" : "negativo"}
          variacao={variacao(a.margem, antes?.margem)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          titulo="ROAS"
          ajuda="roas"
          valor={a.trafego > 0 ? formatMultiplo(a.roas) : "—"}
          rodape={a.trafego > 0 ? "bruto / anúncios" : "sem anúncio lançado"}
        />
        <Kpi
          titulo="ROI"
          ajuda="roi"
          valor={a.gastosTotais > 0 ? formatMultiplo(a.roi) : "—"}
          rodape={a.gastosTotais > 0 ? "líquido / gastos totais" : "sem gasto lançado"}
        />
        <Kpi
          titulo="CPA"
          ajuda="cpa"
          valor={a.trafego > 0 ? formatBRL(a.cpa) : "—"}
          rodape="anúncios / pedidos"
        />
        <Kpi
          titulo="Ticket médio"
          ajuda="ticketMedio"
          valor={formatBRL(a.ticketMedio)}
          rodape="bruto / pedidos"
        />
      </div>

      <Card>
        <CardContent className="py-4">
          <p className="mb-3 text-sm font-medium">Status das cobranças</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Contagem
              rotulo="Aprovadas"
              ajuda="aprovadas"
              quantidade={a.itensVendidos}
              valor={formatBRL(a.vendasBrutas)}
              tom="positivo"
            />
            <Contagem
              rotulo="Aguardando pagamento"
              ajuda="pendentes"
              quantidade={a.pendentes}
              valor={formatBRL(a.valorPendente)}
              rodape="pix e boleto em aberto"
            />
            <Contagem
              rotulo="Reembolsos"
              ajuda="reembolsos"
              quantidade={0}
              valor={formatBRL(a.reembolsos)}
              rodape={
                a.pedidosVendidos > 0
                  ? `${a.pedidosReembolsados} de ${a.pedidosVendidos} vendas · ${formatPercent(a.taxaReembolso)}`
                  : `${a.pedidosReembolsados} no período`
              }
              tom={a.reembolsos > 0 ? "negativo" : undefined}
              esconderQuantidade
            />
            <Contagem
              rotulo="Não pagas"
              ajuda="naoPagas"
              quantidade={a.naoPagas}
              valor={a.taxaAprovacao > 0 ? `${formatPercent(a.taxaAprovacao)} aprovação` : "—"}
              rodape="vencidas ou recusadas"
            />
          </div>
        </CardContent>
      </Card>

      <SecaoReembolso fimPeriodo={periodo.fim} recorte={recorte} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium">Dia a dia</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Barras: faturamento bruto e anúncios. Linha: lucro.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis
                    dataKey="data"
                    tickFormatter={formatDiaMes}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v: number, n: string) => [formatBRL(v), n]}
                    labelFormatter={(l: string) => formatDiaMes(l)}
                  />
                  <Legend fontSize={11} />
                  <Bar dataKey="faturamento" name="Faturamento" fill="var(--chart-2)" radius={3} />
                  <Bar dataKey="trafego" name="Anúncios" fill="var(--chart-4)" radius={3} />
                  <Line
                    type="monotone"
                    dataKey="lucro"
                    name="Lucro"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <p className="mb-3 text-sm font-medium">Do bruto ao lucro — {rotuloPeriodo(periodo)}</p>
            <dl className="space-y-1 text-sm">
              <Degrau rotulo="Vendas aprovadas" valor={a.vendasBrutas} />
              {a.reembolsos > 0 && (
                <Degrau rotulo="Reembolsos e chargebacks" valor={-a.reembolsos} />
              )}
              <Degrau rotulo="Faturamento bruto" valor={a.faturamentoBruto} destaque />

              {a.receitaJuros > 0 && <Degrau rotulo="Juros repassados" valor={a.receitaJuros} />}
              <Degrau rotulo="Taxa de gateway" valor={-a.taxaGateway} />
              {/* Coprodutor, afiliado e custo de produto só aparecem quando
                  existirem — hoje são zero, e uma linha de R$0 só faz ruído. */}
              {a.taxaCoprodutores > 0 && (
                <Degrau rotulo="Coprodutores e afiliados" valor={-a.taxaCoprodutores} />
              )}
              {a.custoProduto > 0 && <Degrau rotulo="Custo de produto" valor={-a.custoProduto} />}
              <Degrau rotulo="Imposto" valor={-a.imposto} />
              <Degrau rotulo="Faturamento líquido" valor={a.faturamentoLiquido} destaque />

              {(!plataforma || contarTrafego) && (
                <Degrau
                  rotulo={trafegoRateado ? "Anúncios (rateado)" : "Anúncios"}
                  valor={-a.trafego}
                />
              )}
              {a.despesasAdicionais > 0 && (
                <Degrau rotulo="Despesas adicionais" valor={-a.despesasAdicionais} />
              )}
              <Degrau
                rotulo={plataforma && !contarTrafego ? "Margem de contribuição" : "Lucro"}
                valor={a.lucro}
                destaque
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Pedidos" valor={String(a.pedidos)} rodape={`${a.itens} itens`} />
        <Kpi titulo="Clientes" valor={String(a.clientes)} rodape="e-mails distintos" />
        <Kpi
          titulo="Receita por cliente"
          ajuda="receitaPorCliente"
          valor={formatBRL(a.receitaPorCliente)}
          rodape="bruto / clientes"
        />
        <Kpi
          titulo="Custo de plataforma"
          ajuda="custoPlataforma"
          valor={a.faturamentoBruto > 0 ? formatPercent(a.taxaGateway / a.faturamentoBruto) : "—"}
          rodape={formatBRL(a.taxaGateway)}
        />
      </div>

      <Card>
        <CardContent className="py-4">
          <p className="mb-3 text-sm font-medium">Por plataforma</p>
          <div className="space-y-2">
            {PLATAFORMAS.filter((p) => a.porPlataforma[p].faturamento > 0).map((p) => {
              const r = a.porPlataforma[p];
              return (
                <div
                  key={p}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{PLATAFORMA_LABEL[p]}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.pedidos} pedido{r.pedidos === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right tabular">
                    <p className="text-sm font-semibold">{formatBRL(r.faturamento)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBRL(r.taxas)} de taxa
                      {r.faturamento > 0 && ` (${formatPercent(r.taxaEfetiva)})`}
                    </p>
                    {/* Dizer de onde veio o número importa: taxa medida é o
                        que a plataforma reteve de fato; estimada é o que a
                        tabela previa, e as duas já divergiram 17% numa venda. */}
                    <p className="text-[10px] text-muted-foreground">
                      {r.comLiquidoInformado === r.itens
                        ? "taxa medida"
                        : r.comLiquidoInformado === 0
                          ? "taxa estimada pela tabela"
                          : `taxa medida em ${r.comLiquidoInformado} de ${r.itens}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Variação contra o período anterior, em fração (0.12 = +12%).
 *
 * Devolve null quando não há base de comparação: mostrar "+100%" porque o
 * período anterior foi zero é ruído, não informação.
 */
function variacao(atual: number, anterior: number | undefined): number | null {
  if (anterior === undefined || anterior === 0) return null;
  return (atual - anterior) / Math.abs(anterior);
}

function Kpi({
  titulo,
  valor,
  rodape,
  tom,
  variacao: delta,
  ajuda,
}: {
  titulo: string;
  valor: string;
  rodape?: string | undefined;
  tom?: "positivo" | "negativo" | undefined;
  variacao?: number | null | undefined;
  ajuda?: ChaveMetrica | undefined;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {titulo}
          {ajuda && <AjudaMetrica metrica={ajuda} />}
        </p>
        <p
          className={cn(
            "text-xl font-semibold tabular",
            tom === "positivo" && "text-positivo",
            tom === "negativo" && "text-negativo",
          )}
        >
          {valor}
        </p>
        {delta !== null && delta !== undefined && (
          <p
            className={cn(
              "tabular text-xs font-medium",
              delta >= 0 ? "text-positivo" : "text-negativo",
            )}
          >
            {delta >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(delta))}
          </p>
        )}
        {rodape && <p className="mt-0.5 text-xs text-muted-foreground">{rodape}</p>}
      </CardContent>
    </Card>
  );
}

function Degrau({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean | undefined;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-1",
        destaque && "border-t pt-2 font-semibold",
      )}
    >
      <dt className={cn(!destaque && "text-muted-foreground")}>{rotulo}</dt>
      <dd
        className={cn(
          "tabular",
          valor < 0 && !destaque && "text-muted-foreground",
          destaque && valor < 0 && "text-negativo",
        )}
      >
        {valor < 0 ? `− ${formatBRL(Math.abs(valor))}` : formatBRL(valor)}
      </dd>
    </div>
  );
}

const TOM_VEREDITO: Record<Nivel, { classe: string; Icone: typeof CheckCircle2 }> = {
  saudavel: { classe: "border-positivo/40 bg-positivo/5", Icone: CheckCircle2 },
  atencao: { classe: "border-abaixo/40 bg-abaixo-soft", Icone: CircleAlert },
  critico: { classe: "border-negativo/50 bg-abaixo-soft", Icone: TrendingDown },
  "sem-dados": { classe: "", Icone: Clock },
};

/**
 * A primeira coisa da tela: a conclusão, em uma frase.
 *
 * Quem abre o painel quer saber se está tudo bem antes de olhar número
 * nenhum. Os KPIs abaixo servem para conferir a conclusão, não para
 * substituí-la.
 */
function Veredito({ apuracao }: { apuracao: Apuracao }) {
  const saude = avaliarSaude(apuracao);
  const { classe, Icone } = TOM_VEREDITO[saude.nivel];

  return (
    <Card className={classe}>
      <CardContent className="flex items-start gap-3 py-5">
        <Icone
          className={cn(
            "mt-0.5 size-5 shrink-0",
            saude.nivel === "saudavel" && "text-positivo",
            saude.nivel === "atencao" && "text-abaixo",
            saude.nivel === "critico" && "text-negativo",
            saude.nivel === "sem-dados" && "text-muted-foreground",
          )}
        />
        <div>
          <p className="text-base font-semibold tracking-tight">{saude.titulo}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{saude.detalhe}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Contagem({
  rotulo,
  quantidade,
  valor,
  rodape,
  tom,
  esconderQuantidade,
  ajuda,
}: {
  rotulo: string;
  quantidade: number;
  valor: string;
  rodape?: string | undefined;
  tom?: "positivo" | "negativo" | undefined;
  esconderQuantidade?: boolean | undefined;
  ajuda?: ChaveMetrica | undefined;
}) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {rotulo}
        {ajuda && <AjudaMetrica metrica={ajuda} />}
      </p>
      <p
        className={cn(
          "tabular text-lg font-semibold",
          tom === "positivo" && "text-positivo",
          tom === "negativo" && "text-negativo",
        )}
      >
        {valor}
      </p>
      <p className="text-xs text-muted-foreground">
        {esconderQuantidade
          ? (rodape ?? "")
          : `${quantidade} ${quantidade === 1 ? "cobrança" : "cobranças"}`}
        {!esconderQuantidade && rodape ? ` · ${rodape}` : ""}
      </p>
    </div>
  );
}
